package dev.chatsaver.api.privatevault;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import dev.chatsaver.api.privatevault.PrivateVaultController.Deletion;
import dev.chatsaver.api.privatevault.PrivateVaultController.Item;
import dev.chatsaver.api.privatevault.PrivateVaultController.Metadata;
import dev.chatsaver.api.privatevault.PrivateVaultController.Snapshot;
import dev.chatsaver.api.privatevault.PrivateVaultController.StoredDeletion;
import dev.chatsaver.api.privatevault.PrivateVaultController.StoredItem;

@Service
public class PrivateVaultService {
    private final JdbcTemplate jdbc;

    public PrivateVaultService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Snapshot snapshot(UUID userId) {
        List<Metadata> metadata = jdbc.query("""
                SELECT salt, verifier_iv, verifier_ciphertext, created_at, updated_at
                FROM private_vault WHERE user_id = ?
                """, (rs, row) -> new Metadata(
                rs.getString("salt"), rs.getString("verifier_iv"),
                rs.getString("verifier_ciphertext"), instant(rs.getTimestamp("created_at")),
                instant(rs.getTimestamp("updated_at"))), userId);
        List<StoredItem> items = jdbc.query("""
                SELECT client_id, iv, ciphertext, created_at, updated_at
                FROM private_vault_item WHERE user_id = ? ORDER BY updated_at, id
                """, (rs, row) -> new StoredItem(
                rs.getObject("client_id", UUID.class), rs.getString("iv"), rs.getString("ciphertext"),
                instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at"))), userId);
        List<StoredDeletion> deleted = jdbc.query("""
                SELECT client_id, deleted_at FROM private_vault_item_deletion
                WHERE user_id = ? ORDER BY deleted_at, id
                """, (rs, row) -> new StoredDeletion(
                rs.getObject("client_id", UUID.class), instant(rs.getTimestamp("deleted_at"))), userId);
        return new Snapshot(metadata.isEmpty() ? null : metadata.getFirst(), items, deleted);
    }

    @Transactional
    public void putMetadata(UUID userId, Metadata value) {
        List<Metadata> existing = jdbc.query("""
                SELECT salt, verifier_iv, verifier_ciphertext, created_at, updated_at
                FROM private_vault WHERE user_id = ? FOR UPDATE
                """, (rs, row) -> new Metadata(
                rs.getString("salt"), rs.getString("verifier_iv"),
                rs.getString("verifier_ciphertext"), instant(rs.getTimestamp("created_at")),
                instant(rs.getTimestamp("updated_at"))), userId);
        if (!existing.isEmpty()) {
            Metadata current = existing.getFirst();
            if (!current.salt().equals(value.salt())
                    || !current.verifierIv().equals(value.verifierIv())
                    || !current.verifierCiphertext().equals(value.verifierCiphertext())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This account already has a different encrypted Private Vault.");
            }
            jdbc.update("UPDATE private_vault SET updated_at = greatest(updated_at, ?) WHERE user_id = ?",
                    timestamp(value.updatedAt()), userId);
            return;
        }
        jdbc.update("""
                INSERT INTO private_vault
                    (id, user_id, salt, verifier_iv, verifier_ciphertext, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), userId, value.salt(), value.verifierIv(),
                value.verifierCiphertext(), timestamp(value.createdAt()), timestamp(value.updatedAt()));
    }

    @Transactional
    public void putItem(UUID userId, UUID clientId, Item value) {
        requireVault(userId);
        Integer blocked = jdbc.queryForObject("""
                SELECT count(*) FROM private_vault_item_deletion
                WHERE user_id = ? AND client_id = ? AND deleted_at >= ?
                """, Integer.class, userId, clientId, timestamp(value.updatedAt()));
        if (blocked != null && blocked > 0) return;
        jdbc.update("""
                INSERT INTO private_vault_item
                    (id, user_id, client_id, iv, ciphertext, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, client_id) DO UPDATE SET
                    iv = excluded.iv,
                    ciphertext = excluded.ciphertext,
                    created_at = least(private_vault_item.created_at, excluded.created_at),
                    updated_at = excluded.updated_at
                WHERE private_vault_item.updated_at <= excluded.updated_at
                """, UUID.randomUUID(), userId, clientId, value.iv(), value.ciphertext(),
                timestamp(value.createdAt()), timestamp(value.updatedAt()));
        jdbc.update("""
                DELETE FROM private_vault_item_deletion
                WHERE user_id = ? AND client_id = ? AND deleted_at < ?
                """, userId, clientId, timestamp(value.updatedAt()));
    }

    @Transactional
    public void deleteItem(UUID userId, UUID clientId, Instant deletedAt) {
        requireVault(userId);
        jdbc.update("""
                DELETE FROM private_vault_item
                WHERE user_id = ? AND client_id = ? AND updated_at <= ?
                """, userId, clientId, timestamp(deletedAt));
        jdbc.update("""
                INSERT INTO private_vault_item_deletion (id, user_id, client_id, deleted_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (user_id, client_id) DO UPDATE SET
                    deleted_at = greatest(private_vault_item_deletion.deleted_at, excluded.deleted_at)
                """, UUID.randomUUID(), userId, clientId, timestamp(deletedAt));
    }

    @Transactional
    public void erase(UUID userId) {
        jdbc.update("DELETE FROM private_vault_item_deletion WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM private_vault_item WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM private_vault WHERE user_id = ?", userId);
    }

    private void requireVault(UUID userId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM private_vault WHERE user_id = ?",
                Integer.class, userId);
        if (count == null || count == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Create the encrypted Private Vault metadata before saving items.");
        }
    }

    private static Timestamp timestamp(Instant value) {
        return Timestamp.from(value);
    }

    private static Instant instant(Timestamp value) {
        return value.toInstant();
    }
}
