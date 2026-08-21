package dev.chatsaver.api.persistence;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

public final class PersistenceSchema {
    private PersistenceSchema() {
    }

    public static final class DeletionMarkerId implements Serializable {
        public UUID userId;
        public String entityType;
        public UUID clientId;

        public DeletionMarkerId() {
        }

        @Override
        public boolean equals(Object value) {
            if (this == value) return true;
            if (!(value instanceof DeletionMarkerId other)) return false;
            return Objects.equals(userId, other.userId)
                    && Objects.equals(entityType, other.entityType)
                    && Objects.equals(clientId, other.clientId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, entityType, clientId);
        }
    }
}

@Entity
@Table(name = "app_user", indexes = @Index(name = "idx_app_user_email", columnList = "email", unique = true))
class AppUserEntity {
    @Id
    UUID id;
    @Column(nullable = false, length = 320, unique = true)
    String email;
    @Column(name = "display_name", length = 160)
    String displayName;
    @Column(name = "password_hash", nullable = false, length = 255)
    String passwordHash;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant updatedAt;
    @Column(name = "deleted_at")
    Instant deletedAt;
}

@Entity
@Table(name = "pending_registration")
class PendingRegistrationEntity {
    @Id
    @Column(length = 320)
    String email;
    @Column(name = "password_hash", nullable = false, length = 255)
    String passwordHash;
    @Column(name = "display_name", length = 160)
    String displayName;
    @Column(name = "verification_code_hash", nullable = false, length = 64)
    String verificationCodeHash;
    @Column(name = "device_id", nullable = false)
    UUID deviceId;
    @Column(name = "device_name", nullable = false, length = 160)
    String deviceName;
    @Column(nullable = false, columnDefinition = "integer default 0")
    int attempts;
    @Column(name = "expires_at", nullable = false)
    Instant expiresAt;
    @Column(name = "last_sent_at", nullable = false)
    Instant lastSentAt;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
}

@Entity
@Table(name = "pending_password_reset")
class PendingPasswordResetEntity {
    @Id
    @Column(length = 320)
    String email;
    @Column(name = "password_hash", nullable = false, length = 255)
    String passwordHash;
    @Column(name = "verification_code_hash", nullable = false, length = 64)
    String verificationCodeHash;
    @Column(nullable = false, columnDefinition = "integer default 0")
    int attempts;
    @Column(name = "expires_at", nullable = false)
    Instant expiresAt;
    @Column(name = "last_sent_at", nullable = false)
    Instant lastSentAt;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
}

@Entity
@Table(name = "device", indexes = @Index(name = "idx_device_user", columnList = "user_id"))
class DeviceEntity {
    @Id
    UUID id;
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    AppUserEntity user;
    @Column(nullable = false, length = 160)
    String name;
    @Column(name = "last_sync_cursor", nullable = false, columnDefinition = "bigint default 0")
    long lastSyncCursor;
    @Column(name = "last_seen_at")
    Instant lastSeenAt;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
    @Column(name = "revoked_at")
    Instant revokedAt;
}

@Entity
@Table(name = "refresh_session", indexes = {
        @Index(name = "idx_refresh_token_hash", columnList = "token_hash", unique = true),
        @Index(name = "idx_refresh_user_device", columnList = "user_id,device_id"),
        @Index(name = "idx_refresh_family", columnList = "family_id")
})
class RefreshSessionEntity {
    @Id
    UUID id;
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    AppUserEntity user;
    @ManyToOne(optional = false)
    @JoinColumn(name = "device_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    DeviceEntity device;
    @Column(name = "token_hash", nullable = false, length = 64, unique = true)
    String tokenHash;
    @Column(name = "family_id", nullable = false)
    UUID familyId;
    @Column(name = "expires_at", nullable = false)
    Instant expiresAt;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
    @Column(name = "rotated_at")
    Instant rotatedAt;
    @Column(name = "revoked_at")
    Instant revokedAt;
    @Column(name = "replaced_by")
    UUID replacedBy;
}

@Entity
@Table(name = "conversation", uniqueConstraints = {
        @UniqueConstraint(name = "uq_conversation_user_client", columnNames = {"user_id", "client_id"}),
        @UniqueConstraint(name = "uq_conversation_external", columnNames = {"user_id", "source", "external_conversation_id"})
}, indexes = @Index(name = "idx_conversation_user_updated", columnList = "user_id,updated_at,id"))
class ConversationEntity {
    @Id
    UUID id;
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    AppUserEntity user;
    @Column(name = "client_id", nullable = false)
    UUID clientId;
    @Column(name = "external_conversation_id", length = 255)
    String externalConversationId;
    @Column(nullable = false, length = 500)
    String title;
    @Column(nullable = false, length = 40)
    String source;
    @Column(name = "source_created_at")
    Instant sourceCreatedAt;
    @Column(nullable = false, columnDefinition = "bigint default 1")
    long version;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant updatedAt;
}

@Entity
@Table(name = "message", uniqueConstraints = {
        @UniqueConstraint(name = "uq_message_user_client", columnNames = {"user_id", "client_id"}),
        @UniqueConstraint(name = "uq_message_position", columnNames = {"conversation_id", "sequence_number"})
}, indexes = @Index(name = "idx_message_conversation_sequence", columnList = "conversation_id,sequence_number"))
class MessageEntity {
    @Id
    UUID id;
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    AppUserEntity user;
    @Column(name = "client_id", nullable = false)
    UUID clientId;
    @ManyToOne(optional = false)
    @JoinColumn(name = "conversation_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    ConversationEntity conversation;
    @Column(name = "external_message_id", length = 255)
    String externalMessageId;
    @Column(nullable = false, length = 24)
    String role;
    @Column(name = "content_text", nullable = false, columnDefinition = "text")
    String contentText;
    @Column(name = "sequence_number", nullable = false)
    int sequenceNumber;
    @Column(name = "source_created_at")
    Instant sourceCreatedAt;
    @Column(nullable = false, columnDefinition = "bigint default 1")
    long version;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant updatedAt;
}

@Entity
@Table(name = "note_collection", uniqueConstraints = {
        @UniqueConstraint(name = "uq_note_collection_user_client", columnNames = {"user_id", "client_id"})
}, indexes = @Index(name = "idx_note_collection_user_updated", columnList = "user_id,updated_at,id"))
class NoteCollectionEntity {
    @Id
    UUID id;
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    AppUserEntity user;
    @Column(name = "client_id", nullable = false)
    UUID clientId;
    @Column(nullable = false, length = 80)
    String name;
    @Column(nullable = false, columnDefinition = "bigint default 1")
    long version;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant updatedAt;
}

@Entity
@Table(name = "note", uniqueConstraints = @UniqueConstraint(
        name = "uq_note_user_client", columnNames = {"user_id", "client_id"}), indexes = {
        @Index(name = "idx_note_user_updated", columnList = "user_id,updated_at,id"),
        @Index(name = "idx_note_user_archive", columnList = "user_id,is_archived,updated_at,id"),
        @Index(name = "idx_note_user_favorite", columnList = "user_id,is_archived,is_favorite,updated_at,id"),
        @Index(name = "idx_note_conversation", columnList = "conversation_id")
})
class NoteEntity {
    @Id
    UUID id;
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    AppUserEntity user;
    @Column(name = "client_id", nullable = false)
    UUID clientId;
    @ManyToOne
    @JoinColumn(name = "conversation_id")
    ConversationEntity conversation;
    @Column(nullable = false, length = 500)
    String title;
    @Column(nullable = false, length = 24)
    String source;
    @Column(name = "is_favorite", nullable = false, columnDefinition = "boolean default false")
    boolean favorite;
    @Column(name = "is_archived", nullable = false, columnDefinition = "boolean default false")
    boolean archived;
    @Column(name = "collection_ids", nullable = false, columnDefinition = "text default ''")
    String collectionIds;
    @Column(nullable = false, columnDefinition = "bigint default 1")
    long version;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant updatedAt;
}

@Entity
@Table(name = "note_block", uniqueConstraints = {
        @UniqueConstraint(name = "uq_note_block_user_client", columnNames = {"user_id", "client_id"}),
        @UniqueConstraint(name = "uq_note_block_position", columnNames = {"note_id", "position"})
}, indexes = @Index(name = "idx_note_block_note_position", columnList = "note_id,position"))
class NoteBlockEntity {
    @Id
    UUID id;
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    AppUserEntity user;
    @Column(name = "client_id", nullable = false)
    UUID clientId;
    @ManyToOne(optional = false)
    @JoinColumn(name = "note_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    NoteEntity note;
    @Column(nullable = false)
    int position;
    @Column(name = "question_text", nullable = false, columnDefinition = "text default ''")
    String question;
    @Column(name = "answer_text", nullable = false, columnDefinition = "text default ''")
    String answer;
    @Column(nullable = false, columnDefinition = "bigint default 1")
    long version;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant createdAt;
    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant updatedAt;
}

@Entity
@Table(name = "mutation_receipt", indexes = @Index(name = "idx_mutation_receipt_processed", columnList = "processed_at"))
class MutationReceiptEntity {
    @Id
    @Column(name = "mutation_id")
    UUID mutationId;
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    AppUserEntity user;
    @ManyToOne(optional = false)
    @JoinColumn(name = "device_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    DeviceEntity device;
    @Column(name = "processed_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant processedAt;
}

@Entity
@Table(name = "change_event", indexes = @Index(name = "idx_change_event_user_cursor", columnList = "user_id,cursor"))
class ChangeEventEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long cursor;
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    AppUserEntity user;
    @Column(name = "entity_type", nullable = false, length = 40)
    String entityType;
    @Column(name = "client_id")
    UUID clientId;
    @Column(nullable = false, length = 16)
    String operation;
    @Column(name = "changed_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant changedAt;
}

@Entity
@IdClass(PersistenceSchema.DeletionMarkerId.class)
@Table(name = "deletion_marker", indexes = @Index(
        name = "idx_deletion_marker_user_cursor", columnList = "user_id,change_cursor"))
class DeletionMarkerEntity {
    @Id
    @Column(name = "user_id")
    UUID userId;
    @Id
    @Column(name = "entity_type", length = 40)
    String entityType;
    @Id
    @Column(name = "client_id")
    UUID clientId;
    @Column(name = "deleted_at", nullable = false, columnDefinition = "timestamptz default now()")
    Instant deletedAt;
    @Column(name = "change_cursor")
    Long changeCursor;
}
