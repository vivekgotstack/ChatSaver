# ChatSaver architecture

## Product boundary

ChatSaver is an offline-first personal knowledge application. IndexedDB is the immediate working
database; the backend provides identity, permanent recovery, and cross-device synchronization.

> Creating, reading, updating, searching, and deleting a local note must not require a network
> request.

## Runtime topology

```text
Next.js PWA
|- React application and source-owned shadcn UI
|- IndexedDB domain tables, account cursor, and mutation outbox
|- local ChatGPT link/import normalization
`- service worker
       |
       | authenticated push and cursor pull
       v
Spring Boot API
|- password authentication and rotating device sessions
|- idempotent mutation batches
|- full recovery plus incremental delta synchronization
`- authenticated IntegrationProvider boundary
       |
       |- PostgreSQL (Hibernate-managed schema)
       `- Composio managed OAuth (optional; no provider tokens stored locally)
```

## Frontend boundaries

- `app`: routing, metadata, global providers, and the application entry point.
- `components/ui`: source-owned shadcn primitives without product persistence logic.
- `components`: library, importer, editor, account, and vault surfaces.
- `domain`: serializable local and synchronization contracts.
- `lib/db`: IndexedDB schema, atomic local changes, backup/recovery, and outbox creation.
- `lib/import`: untrusted ChatGPT content validation and normalization.
- `lib/sync`: authenticated push, delta pull, and atomic remote application.
- `lib/integrations`: minimal authenticated contracts for the optional integration provider.

## Backend boundaries

Backend packages are feature-oriented: `auth`, `sync`, `note`, `integration`, `config`, `error`, and `system`.
Controllers validate HTTP contracts, services own authorization and transactions, and JDBC queries
are always tenant-scoped. Hibernate/JPA currently manages the schema during the initial rollout.

## Data ownership

- IndexedDB owns interactive state and unsent changes.
- PostgreSQL owns authenticated recovery state.
- `mutation_receipt` makes retries idempotent.
- `change_event.cursor` is the server-authoritative incremental cursor.
- Entity versions preserve server ordering.
- Content-free `deletion_marker` rows prevent old devices from resurrecting deleted data.

## Security invariants

- Never read or store ChatGPT session cookies.
- Parse imported/shared ChatGPT content before optional synchronization.
- Scope every private database operation by the authenticated user.
- Keep third-party credentials server-side, bind provider connections to the internal user UUID,
  and execute only curated, validated actions.
- Store refresh tokens only as hashes and bind them to independently revocable devices.
- Backend runtime configuration is consolidated in `application.yaml` for this deployment.
- Require HTTPS, secure cookies, an exact production web origin, and PostgreSQL TLS in production.
- Return RFC 9457 problem responses with request IDs and no stack traces.
