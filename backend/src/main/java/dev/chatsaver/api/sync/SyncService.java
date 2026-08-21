package dev.chatsaver.api.sync;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.ArrayList;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import dev.chatsaver.api.auth.AuthenticatedUser;
import dev.chatsaver.api.sync.SyncController.Mutation;

@Service
public class SyncService {

    private static final List<String> ENTITY_TYPES =
            List.of("collection", "conversation", "message", "note", "noteBlock");
    private final JdbcTemplate jdbc;

    public SyncService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public PushResult push(AuthenticatedUser user, List<Mutation> mutations) {
        int accepted = 0;
        Long latestCursor = null;
        for (Mutation mutation : mutations) {
            validateMutation(mutation);
            Integer exists = jdbc.queryForObject("""
                    SELECT count(*) FROM mutation_receipt
                    WHERE device_id = ? AND mutation_id = ?
                    """, Integer.class, user.deviceId(), mutation.id());
            if (exists != null && exists > 0) {
                accepted++;
                continue;
            }

            EntityVersion changed = applyMutation(user.userId(), mutation);
            if (changed != null) {
                Long cursor = jdbc.queryForObject("""
                        INSERT INTO change_event
                            (user_id, entity_type, client_id, operation)
                        VALUES (?, ?, ?, ?)
                        RETURNING cursor
                        """, Long.class, user.userId(), mutation.entityType(), mutation.entityId(),
                        mutation.operation().toUpperCase(Locale.ROOT));
                if (mutation.operation().equalsIgnoreCase("delete") && cursor != null) {
                    jdbc.update("""
                            UPDATE deletion_marker SET change_cursor = ?
                            WHERE user_id = ? AND change_cursor IS NULL
                            """, cursor, user.userId());
                }
                if (cursor != null) latestCursor = cursor;
            }
            jdbc.update("""
                    INSERT INTO mutation_receipt
                        (user_id, device_id, mutation_id)
                    VALUES (?, ?, ?)
                    """, user.userId(), user.deviceId(), mutation.id());
            accepted++;
        }
        jdbc.update("UPDATE device SET last_seen_at = now() WHERE id = ?", user.deviceId());
        return new PushResult(accepted, latestCursor);
    }

    @Transactional
    public VaultSnapshot snapshot(AuthenticatedUser user, long requestedAfter) {
        if (requestedAfter < 0) throw badRequest("The sync cursor cannot be negative.");
        UUID userId = user.userId();
        Long latest = jdbc.queryForObject(
                "SELECT coalesce(max(cursor), 0) FROM change_event WHERE user_id = ?",
                Long.class, userId);
        long cursor = latest == null ? 0 : latest;
        long after = requestedAfter > cursor ? 0 : requestedAfter;

        List<Map<String, Object>> collections = jdbc.query("""
                SELECT client_id, name, created_at, updated_at, version
                FROM note_collection
                WHERE user_id = ?
                  AND (? = 0 OR client_id IN (
                      SELECT client_id FROM change_event
                      WHERE user_id = ? AND cursor > ? AND cursor <= ?
                        AND entity_type = 'collection' AND client_id IS NOT NULL
                  ))
                ORDER BY updated_at, id
                """, (rs, row) -> collection(rs), userId, after, userId, after, cursor);

        List<Map<String, Object>> conversations = jdbc.query("""
                SELECT client_id, external_conversation_id, title, source,
                       source_created_at, created_at, updated_at, version
                FROM conversation
                WHERE user_id = ?
                  AND (? = 0 OR client_id IN (
                      SELECT client_id FROM change_event
                      WHERE user_id = ? AND cursor > ? AND cursor <= ?
                        AND entity_type = 'conversation' AND client_id IS NOT NULL
                  ))
                ORDER BY updated_at, id
                """, (rs, row) -> conversation(rs), userId, after, userId, after, cursor);

        List<Map<String, Object>> messages = jdbc.query("""
                SELECT m.client_id, c.client_id AS conversation_client_id,
                       m.external_message_id, m.role, m.content_text,
                       m.sequence_number, m.source_created_at,
                       m.created_at, m.updated_at, m.version
                FROM message m
                JOIN conversation c ON c.id = m.conversation_id
                WHERE m.user_id = ?
                  AND (? = 0 OR m.client_id IN (
                      SELECT client_id FROM change_event
                      WHERE user_id = ? AND cursor > ? AND cursor <= ?
                        AND entity_type = 'message' AND client_id IS NOT NULL
                  ))
                ORDER BY c.id, m.sequence_number
                """, (rs, row) -> message(rs), userId, after, userId, after, cursor);

        List<Map<String, Object>> notes = jdbc.query("""
                SELECT n.client_id, c.client_id AS conversation_client_id,
                       n.title, n.source, n.is_favorite, n.is_archived, n.collection_ids,
                       (SELECT count(*) FROM note_block count_block WHERE count_block.note_id = n.id) AS block_count,
                       n.created_at, n.updated_at, n.version
                FROM note n
                LEFT JOIN conversation c ON c.id = n.conversation_id
                WHERE n.user_id = ?
                  AND (? = 0 OR n.client_id IN (
                      SELECT client_id FROM change_event
                      WHERE user_id = ? AND cursor > ? AND cursor <= ?
                        AND entity_type = 'note' AND client_id IS NOT NULL
                  ))
                ORDER BY n.updated_at, n.id
                """, (rs, row) -> note(rs), userId, after, userId, after, cursor);

        List<Map<String, Object>> blocks = jdbc.query("""
                SELECT b.client_id, n.client_id AS note_client_id, b.position,
                       b.question_text, b.answer_text, b.created_at, b.updated_at, b.version
                FROM note_block b
                JOIN note n ON n.id = b.note_id
                WHERE b.user_id = ?
                  AND (? = 0 OR b.client_id IN (
                      SELECT client_id FROM change_event
                      WHERE user_id = ? AND cursor > ? AND cursor <= ?
                        AND entity_type = 'noteBlock' AND client_id IS NOT NULL
                  ))
                ORDER BY n.id, b.position
                """, (rs, row) -> block(rs), userId, after, userId, after, cursor);

        DeletedEntities deleted = new DeletedEntities(
                deletedIds("collection", userId, after, cursor),
                deletedIds("conversation", userId, after, cursor),
                deletedIds("message", userId, after, cursor),
                deletedIds("note", userId, after, cursor),
                deletedIds("noteBlock", userId, after, cursor));
        jdbc.update("UPDATE device SET last_sync_cursor = ?, last_seen_at = now() WHERE id = ?",
                cursor, user.deviceId());
        return new VaultSnapshot(collections, conversations, messages, notes, blocks, deleted, cursor, Instant.now());
    }

    private EntityVersion applyMutation(UUID userId, Mutation mutation) {
        if (mutation.operation().equalsIgnoreCase("delete")) {
            return delete(userId, mutation.entityType(), mutation.entityId());
        }
        if (isDeleted(userId, mutation.entityType(), mutation.entityId())) {
            return null;
        }
        return switch (mutation.entityType()) {
            case "collection" -> upsertCollection(userId, mutation);
            case "conversation" -> upsertConversation(userId, mutation);
            case "message" -> upsertMessage(userId, mutation);
            case "note" -> upsertNote(userId, mutation);
            case "noteBlock" -> upsertBlock(userId, mutation);
            default -> throw badRequest("Unsupported entity type.");
        };
    }

    private EntityVersion upsertCollection(UUID userId, Mutation mutation) {
        Map<String, Object> p = mutation.payload();
        String name = requiredText(p, "name");
        if (name.length() > 80) throw badRequest("Collection names cannot exceed 80 characters.");
        Optional<EntityVersion> existing = lockEntity("note_collection", userId, mutation.entityId());
        if (existing.isEmpty()) {
            UUID serverId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO note_collection
                        (id, user_id, client_id, name, version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 1, ?, ?)
                    """, serverId, userId, mutation.entityId(), name,
                    timestampOrNow(p, "createdAt"), timestampOrNow(p, "updatedAt"));
            return new EntityVersion(serverId, 1);
        }
        EntityVersion row = existing.get();
        long version = row.version() + 1;
        jdbc.update("""
                UPDATE note_collection SET name = ?, version = ?, updated_at = now()
                WHERE id = ?
                """, name, version, row.serverId());
        return new EntityVersion(row.serverId(), version);
    }

    private EntityVersion upsertConversation(UUID userId, Mutation mutation) {
        Optional<EntityVersion> existing = lockEntity("conversation", userId, mutation.entityId());
        Map<String, Object> p = mutation.payload();
        if (existing.isEmpty()) {
            UUID serverId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO conversation
                        (id, user_id, client_id, external_conversation_id, title, source,
                         source_created_at, version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """, serverId, userId, mutation.entityId(), nullableText(p, "externalId"),
                    requiredText(p, "title"), requiredText(p, "source").toUpperCase(Locale.ROOT),
                    timestamp(p, "sourceCreatedAt"), timestampOrNow(p, "createdAt"),
                    timestampOrNow(p, "updatedAt"));
            return new EntityVersion(serverId, 1);
        }
        EntityVersion row = existing.get();
        long version = row.version() + 1;
        jdbc.update("""
                UPDATE conversation SET external_conversation_id = ?, title = ?, source = ?,
                    source_created_at = ?, version = ?, updated_at = now()
                WHERE id = ?
                """, nullableText(p, "externalId"), requiredText(p, "title"),
                requiredText(p, "source").toUpperCase(Locale.ROOT),
                timestamp(p, "sourceCreatedAt"), version, row.serverId());
        return new EntityVersion(row.serverId(), version);
    }

    private EntityVersion upsertMessage(UUID userId, Mutation mutation) {
        Map<String, Object> p = mutation.payload();
        UUID conversationId = requireServerId("conversation", userId, uuid(p, "conversationId"));
        Optional<EntityVersion> existing = lockEntity("message", userId, mutation.entityId());
        if (existing.isEmpty()) {
            UUID serverId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO message
                        (id, user_id, client_id, conversation_id, external_message_id,
                         role, content_text, sequence_number, source_created_at,
                         version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """, serverId, userId, mutation.entityId(), conversationId,
                    nullableText(p, "externalId"), requiredText(p, "role").toUpperCase(Locale.ROOT),
                    requiredText(p, "content"), integer(p, "sortIndex"),
                    timestamp(p, "sourceCreatedAt"), timestampOrNow(p, "createdAt"),
                    timestampOrNow(p, "updatedAt"));
            return new EntityVersion(serverId, 1);
        }
        EntityVersion row = existing.get();
        long version = row.version() + 1;
        jdbc.update("""
                UPDATE message SET conversation_id = ?, external_message_id = ?, role = ?,
                    content_text = ?, sequence_number = ?, source_created_at = ?,
                    version = ?, updated_at = now()
                WHERE id = ?
                """, conversationId, nullableText(p, "externalId"),
                requiredText(p, "role").toUpperCase(Locale.ROOT), requiredText(p, "content"),
                integer(p, "sortIndex"), timestamp(p, "sourceCreatedAt"), version, row.serverId());
        return new EntityVersion(row.serverId(), version);
    }

    private EntityVersion upsertNote(UUID userId, Mutation mutation) {
        Map<String, Object> p = mutation.payload();
        UUID conversationId = optionalServerId("conversation", userId, optionalUuid(p, "conversationId"));
        Optional<EntityVersion> existing = lockEntity("note", userId, mutation.entityId());
        if (existing.isEmpty()) {
            UUID serverId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO note
                        (id, user_id, client_id, conversation_id, title, source,
                         is_favorite, is_archived, collection_ids, version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """, serverId, userId, mutation.entityId(), conversationId,
                    requiredText(p, "title"), requiredText(p, "source").toUpperCase(Locale.ROOT),
                    bool(p, "isFavorite"), bool(p, "isArchived"),
                    collectionIds(p),
                    timestampOrNow(p, "createdAt"), timestampOrNow(p, "updatedAt"));
            return new EntityVersion(serverId, 1);
        }
        EntityVersion row = existing.get();
        long version = row.version() + 1;
        jdbc.update("""
                UPDATE note SET conversation_id = ?, title = ?, source = ?, is_favorite = ?,
                    is_archived = ?, collection_ids = ?, version = ?, updated_at = now()
                WHERE id = ?
                """, conversationId, requiredText(p, "title"),
                requiredText(p, "source").toUpperCase(Locale.ROOT), bool(p, "isFavorite"),
                bool(p, "isArchived"), collectionIds(p), version, row.serverId());
        return new EntityVersion(row.serverId(), version);
    }

    private EntityVersion upsertBlock(UUID userId, Mutation mutation) {
        Map<String, Object> p = mutation.payload();
        UUID noteId = requireServerId("note", userId, uuid(p, "noteId"));
        Optional<EntityVersion> existing = lockEntity("note_block", userId, mutation.entityId());
        if (existing.isEmpty()) {
            UUID serverId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO note_block
                        (id, user_id, client_id, note_id, position,
                         question_text, answer_text, version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """, serverId, userId, mutation.entityId(), noteId, integer(p, "position"),
                    text(p, "question"), text(p, "answer"), timestampOrNow(p, "createdAt"),
                    timestampOrNow(p, "updatedAt"));
            return new EntityVersion(serverId, 1);
        }
        EntityVersion row = existing.get();
        long version = row.version() + 1;
        jdbc.update("""
                UPDATE note_block SET note_id = ?, position = ?, question_text = ?, answer_text = ?,
                    version = ?, updated_at = now()
                WHERE id = ?
                """, noteId, integer(p, "position"), text(p, "question"), text(p, "answer"),
                version, row.serverId());
        return new EntityVersion(row.serverId(), version);
    }

    private EntityVersion delete(UUID userId, String entityType, UUID clientId) {
        String table = table(entityType);
        Optional<EntityVersion> existing = lockEntity(table, userId, clientId);
        markDeleted(userId, entityType, clientId);
        if (existing.isEmpty()) return null;
        EntityVersion row = existing.get();
        long version = row.version() + 1;
        if (entityType.equals("conversation")) {
            markChildren("message", "SELECT client_id FROM message WHERE conversation_id = ?", userId, row.serverId());
            markChildren("note", "SELECT client_id FROM note WHERE conversation_id = ?", userId, row.serverId());
            markChildren("noteBlock", """
                    SELECT b.client_id FROM note_block b
                    JOIN note n ON n.id = b.note_id WHERE n.conversation_id = ?
                    """, userId, row.serverId());
            jdbc.update("DELETE FROM note WHERE conversation_id = ?", row.serverId());
        } else if (entityType.equals("note")) {
            markChildren("noteBlock", "SELECT client_id FROM note_block WHERE note_id = ?", userId, row.serverId());
        }
        jdbc.update("DELETE FROM " + table + " WHERE id = ?", row.serverId());
        return new EntityVersion(row.serverId(), version);
    }

    @Transactional
    public long eraseVault(UUID userId) {
        markAll("collection", "note_collection", userId);
        markAll("conversation", "conversation", userId);
        markAll("message", "message", userId);
        markAll("note", "note", userId);
        markAll("noteBlock", "note_block", userId);

        jdbc.update("DELETE FROM note WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM note_collection WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM conversation WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM change_event WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM mutation_receipt WHERE user_id = ?", userId);
        Long cursor = jdbc.queryForObject("""
                INSERT INTO change_event (user_id, entity_type, client_id, operation)
                VALUES (?, 'vault', NULL, 'DELETE')
                RETURNING cursor
                """, Long.class, userId);
        if (cursor != null) {
            jdbc.update("UPDATE deletion_marker SET change_cursor = ? WHERE user_id = ?",
                    cursor, userId);
        }
        return cursor == null ? 0 : cursor;
    }

    private void markAll(String entityType, String table, UUID userId) {
        jdbc.update("INSERT INTO deletion_marker (user_id, entity_type, client_id) "
                + "SELECT user_id, ?, client_id FROM " + table + " WHERE user_id = ? "
                + "ON CONFLICT (user_id, entity_type, client_id) DO UPDATE SET deleted_at = now()",
                entityType, userId);
    }

    private void markChildren(String entityType, String sql, UUID userId, UUID parentId) {
        for (UUID childId : jdbc.query(sql, (rs, row) -> rs.getObject("client_id", UUID.class), parentId)) {
            markDeleted(userId, entityType, childId);
        }
    }

    private void markDeleted(UUID userId, String entityType, UUID clientId) {
        jdbc.update("""
                INSERT INTO deletion_marker (user_id, entity_type, client_id)
                VALUES (?, ?, ?)
                ON CONFLICT (user_id, entity_type, client_id)
                DO UPDATE SET deleted_at = now()
                """, userId, entityType, clientId);
    }

    private boolean isDeleted(UUID userId, String entityType, UUID clientId) {
        Integer count = jdbc.queryForObject("""
                SELECT count(*) FROM deletion_marker
                WHERE user_id = ? AND entity_type = ? AND client_id = ?
                """, Integer.class, userId, entityType, clientId);
        return count != null && count > 0;
    }

    private Optional<EntityVersion> lockEntity(String table, UUID userId, UUID clientId) {
        return jdbc.query("SELECT id, version FROM " + table
                        + " WHERE user_id = ? AND client_id = ? FOR UPDATE",
                (rs, row) -> new EntityVersion(rs.getObject("id", UUID.class), rs.getLong("version")),
                userId, clientId).stream().findFirst();
    }

    private UUID requireServerId(String table, UUID userId, UUID clientId) {
        return optionalServerId(table, userId, clientId);
    }

    private UUID optionalServerId(String table, UUID userId, UUID clientId) {
        if (clientId == null) return null;
        List<UUID> ids = jdbc.query("SELECT id FROM " + table
                        + " WHERE user_id = ? AND client_id = ?",
                (rs, row) -> rs.getObject("id", UUID.class), userId, clientId);
        if (ids.isEmpty()) throw badRequest("A related record has not been synced yet.");
        return ids.getFirst();
    }

    private List<UUID> deletedIds(String entityType, UUID userId, long after, long cursor) {
        return jdbc.query("""
                SELECT client_id FROM deletion_marker
                WHERE user_id = ? AND entity_type = ?
                  AND (? = 0 OR (change_cursor > ? AND change_cursor <= ?))
                """, (rs, row) -> rs.getObject("client_id", UUID.class),
                userId, entityType, after, after, cursor);
    }

    private static Map<String, Object> conversation(ResultSet rs) throws SQLException {
        Map<String, Object> value = base(rs);
        value.put("externalId", rs.getString("external_conversation_id"));
        value.put("title", rs.getString("title"));
        value.put("source", rs.getString("source").toLowerCase(Locale.ROOT));
        value.put("messageCount", 0);
        value.put("sourceCreatedAt", instant(rs, "source_created_at"));
        return value;
    }

    private static Map<String, Object> collection(ResultSet rs) throws SQLException {
        Map<String, Object> value = base(rs);
        value.put("name", rs.getString("name"));
        return value;
    }

    private static Map<String, Object> message(ResultSet rs) throws SQLException {
        Map<String, Object> value = base(rs);
        value.put("conversationId", rs.getObject("conversation_client_id", UUID.class));
        value.put("externalId", rs.getString("external_message_id"));
        value.put("role", rs.getString("role").toLowerCase(Locale.ROOT));
        value.put("content", rs.getString("content_text"));
        value.put("sortIndex", rs.getInt("sequence_number"));
        value.put("sourceCreatedAt", instant(rs, "source_created_at"));
        return value;
    }

    private static Map<String, Object> note(ResultSet rs) throws SQLException {
        Map<String, Object> value = base(rs);
        value.put("conversationId", rs.getObject("conversation_client_id", UUID.class));
        value.put("title", rs.getString("title"));
        value.put("source", rs.getString("source").toLowerCase(Locale.ROOT));
        value.put("isFavorite", rs.getBoolean("is_favorite"));
        value.put("isArchived", rs.getBoolean("is_archived"));
        value.put("collectionIds", collectionIdList(rs.getString("collection_ids")));
        value.put("blockCount", rs.getInt("block_count"));
        value.put("searchText", "");
        return value;
    }

    private static Map<String, Object> block(ResultSet rs) throws SQLException {
        Map<String, Object> value = base(rs);
        value.put("noteId", rs.getObject("note_client_id", UUID.class));
        value.put("position", rs.getInt("position"));
        value.put("question", rs.getString("question_text"));
        value.put("answer", rs.getString("answer_text"));
        return value;
    }

    private static Map<String, Object> base(ResultSet rs) throws SQLException {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("id", rs.getObject("client_id", UUID.class));
        value.put("createdAt", instant(rs, "created_at"));
        value.put("updatedAt", instant(rs, "updated_at"));
        value.put("serverVersion", rs.getLong("version"));
        value.put("syncStatus", "synced");
        return value;
    }

    private static String instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant().toString();
    }

    private static void validateMutation(Mutation mutation) {
        if (!ENTITY_TYPES.contains(mutation.entityType())) throw badRequest("Unsupported entity type.");
        String operation = mutation.operation().toLowerCase(Locale.ROOT);
        if (!List.of("create", "update", "delete").contains(operation)) {
            throw badRequest("Unsupported mutation operation.");
        }
    }

    private static String table(String entityType) {
        return switch (entityType) {
            case "collection" -> "note_collection";
            case "conversation" -> "conversation";
            case "message" -> "message";
            case "note" -> "note";
            case "noteBlock" -> "note_block";
            default -> throw badRequest("Unsupported entity type.");
        };
    }

    private static String requiredText(Map<String, Object> payload, String key) {
        String value = text(payload, key).trim();
        if (value.isEmpty()) throw badRequest("Missing field: " + key);
        return value;
    }

    private static String text(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        return value == null ? "" : value.toString();
    }

    private static String nullableText(Map<String, Object> payload, String key) {
        String value = text(payload, key).trim();
        return value.isEmpty() ? null : value;
    }

    private static boolean bool(Map<String, Object> payload, String key) {
        return Boolean.parseBoolean(text(payload, key));
    }

    private static String collectionIds(Map<String, Object> payload) {
        Object raw = payload.get("collectionIds");
        if (raw == null) return "";
        if (!(raw instanceof List<?> values) || values.size() > 100) {
            throw badRequest("Invalid collection membership.");
        }
        List<String> ids = new ArrayList<>();
        for (Object value : values) {
            try {
                ids.add(UUID.fromString(String.valueOf(value)).toString());
            } catch (IllegalArgumentException exception) {
                throw badRequest("Invalid collection identifier.");
            }
        }
        return String.join(",", ids.stream().distinct().toList());
    }

    private static List<String> collectionIdList(String value) {
        if (value == null || value.isBlank()) return List.of();
        return List.of(value.split(","));
    }

    private static int integer(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        if (value instanceof Number number) return number.intValue();
        try {
            return Integer.parseInt(text(payload, key));
        } catch (NumberFormatException exception) {
            throw badRequest("Invalid number: " + key);
        }
    }

    private static UUID uuid(Map<String, Object> payload, String key) {
        UUID value = optionalUuid(payload, key);
        if (value == null) throw badRequest("Missing identifier: " + key);
        return value;
    }

    private static UUID optionalUuid(Map<String, Object> payload, String key) {
        String value = text(payload, key).trim();
        if (value.isEmpty()) return null;
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            throw badRequest("Invalid identifier: " + key);
        }
    }

    private static Timestamp timestamp(Map<String, Object> payload, String key) {
        String value = text(payload, key).trim();
        if (value.isEmpty()) return null;
        try {
            return Timestamp.from(Instant.parse(value));
        } catch (RuntimeException exception) {
            throw badRequest("Invalid timestamp: " + key);
        }
    }

    private static Timestamp timestampOrNow(Map<String, Object> payload, String key) {
        Timestamp value = timestamp(payload, key);
        return value == null ? Timestamp.from(Instant.now()) : value;
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    public record VaultSnapshot(
            List<Map<String, Object>> collections,
            List<Map<String, Object>> conversations,
            List<Map<String, Object>> messages,
            List<Map<String, Object>> notes,
            List<Map<String, Object>> noteBlocks,
            DeletedEntities deleted,
            long cursor,
            Instant serverTime) {
    }

    public record PushResult(int accepted, Long cursor) {
    }

    public record DeletedEntities(
            List<UUID> collections,
            List<UUID> conversations,
            List<UUID> messages,
            List<UUID> notes,
            List<UUID> noteBlocks) {
    }

    private record EntityVersion(UUID serverId, long version) {
    }
}
