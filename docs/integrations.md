# ChatSaver integrations

## Architecture

```text
Browser / PWA / Tauri
        |
        | ChatSaver bearer token
        v
Spring IntegrationController
        |
        | UUID ownership + allowlist + validation + rate limit
        v
IntegrationProvider
        |
        `- ComposioIntegrationProvider --x-api-key--> Composio managed OAuth
                                                        |
                                                        `- external provider
```

The Spring API is the only trusted integration boundary. The frontend never receives the Composio
API key, provider access tokens, refresh tokens, OAuth state, or connection metadata beyond the
minimum required to render the marketplace. Composio remains the source of truth for connected
accounts, so ChatSaver does not add a second token database.

The initial catalog contains Google Drive, Gmail, GitHub, Notion, Slack, and Dropbox. Connections
can be created and removed for every catalog entry. The only executable action in the initial
allowlist is `github / verify-profile`, which maps to the read-only
`GITHUB_GET_THE_AUTHENTICATED_USER` tool. Adding a card does not implicitly grant any action.

## Server environment

Set these values only on the Spring backend deployment:

| Variable | Required | Purpose |
| --- | --- | --- |
| `COMPOSIO_API_KEY` | Yes | Composio project key used only by the server |
| `COMPOSIO_CALLBACK_URL` | Production | Public HTTPS identity-verifier page, for example `https://chatsaver.example/integrations/callback` |
| `COMPOSIO_API_BASE_URL` | No | Defaults to `https://backend.composio.dev/api`; useful only for controlled testing |
| `COMPOSIO_GITHUB_VERSION` | No | Pinned GitHub toolkit version; defaults to `20260721_00` |
| `WEB_ORIGIN` | Yes in production | Existing exact ChatSaver frontend origin and callback origin |

Do not add `COMPOSIO_API_KEY` to `NEXT_PUBLIC_*`, a frontend `.env`, Tauri configuration, source
control, logs, analytics, or error responses.

## Composio dashboard setup

1. Create or select a Composio project on the free plan.
2. Create a project API key with the smallest useful permissions: auth-config read, connected-account
   read/write, and predefined-tool execution. Raw proxy-execution permission is not needed.
3. Confirm that Composio-managed auth is enabled for each toolkit you intend to expose. ChatSaver
   discovers the enabled managed auth config by toolkit and caches only its non-secret ID for 15
   minutes; users never configure client IDs or secrets.
4. Under **Settings → General → Configuration**, set the callback identity verifier to the public
   `COMPOSIO_CALLBACK_URL`. It must be HTTPS. Local callback verification requires an HTTPS tunnel.
5. Set the server environment variables and redeploy the backend. No frontend credential is needed.

Connect Links handle provider state and credentials. The callback page restores the signed-in
ChatSaver session and asks the backend to complete the connection with that session's stable user
UUID. A copied authorization return therefore cannot select a different ChatSaver user.

## GitHub end-to-end check

1. Sign in to ChatSaver and open `/integrations`.
2. Select **GitHub → Connect** and approve the Composio-managed GitHub authorization.
3. Return to the integration studio. It polls briefly and should show **Connected**.
4. Open **Manage → Verify connection**. ChatSaver runs only the allowlisted read-only profile action
   and displays a small public-profile summary.
5. Choose **Disconnect** and confirm. Refresh the page and verify that the account is no longer
   active.

If the card says **Not configured**, the backend has no `COMPOSIO_API_KEY`. If connect reports that
the toolkit is not enabled, enable its Composio-managed auth config in the same project as the key.

## Adding another provider safely

1. Add one curated definition to `IntegrationCatalog`; do not render Composio's entire toolkit
   catalog automatically.
2. Enable the toolkit's managed auth config in the Composio project.
3. Add a service icon mapping in `integrations-marketplace.tsx` if the generic plug icon is not
   sufficient.
4. To expose an action, add a ChatSaver action ID to that definition, map it to one pinned Composio
   tool inside `ComposioIntegrationProvider`, validate every input field, and return a deliberately
   reduced result object. Never accept a tool slug, HTTP endpoint, method, or provider arguments
   directly from the browser.
5. Add a focused authorization/ownership test before release.

## Security and failure behavior

- All endpoints require the existing ChatSaver bearer token.
- The stable internal user UUID is the Composio `user_id`; email addresses are not provider IDs.
- Connection reads are filtered by user, while disconnect and execution also reload the individual
  account and compare ownership server-side.
- Toolkit, connection ID, action, callback session, and request sizes are validated.
- Per-user fixed-window limits protect catalog, connect, callback, disconnect, and execution paths.
- Upstream bodies and secrets are never returned. Users receive short RFC 9457 problem details with
  the existing request ID.
- With no provider key or during a provider outage, the vault, notes, authentication, sync, exports,
  and desktop flows continue normally; only integration actions are unavailable.
- The implementation uses managed Connect Links, connected-account lifecycle endpoints, and one
  predefined tool execution. It does not depend on paid sessions, white-label OAuth, MCP, raw proxy
  execution, or premium-only features. Normal free-plan quotas still apply.
