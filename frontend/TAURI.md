# ChatSaver desktop

Tauri is contained entirely in this `frontend` directory. The normal `npm run dev` and
`npm run build` commands remain the existing Next.js website workflow.

## Prerequisites

Install the current stable Rust toolchain and the platform prerequisites listed in the
[Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

## Commands

- `npm run desktop:dev` starts Next.js and opens it in a Tauri development window.
- `npm run desktop:build` creates the static Next.js export and native installers.

Production desktop builds use `https://chatsaver.viveknigam.co.in` for the existing Next.js API
routes. Override that origin when needed:

```powershell
$env:TAURI_API_ORIGIN = "https://your-chatsaver-web-origin.example"
npm run desktop:build
```

If the origin changes, add the same narrowly scoped URL to
`src-tauri/capabilities/default.json`. Keep `NEXT_PUBLIC_WEBSOCKET_URL` configured with the
deployed backend origin when live vault updates are required.
