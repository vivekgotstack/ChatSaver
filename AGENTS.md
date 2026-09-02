# ChatSaver agent guide

## Product direction

- ChatSaver is a private, local-first Obsidian-style knowledge workspace for one primary user.
- The main app must behave as one stable workspace: persistent file/folder sidebar, one full-height note surface, no dashboard cards or route hops during normal note browsing.
- Collections are folders. Notes are title-only files in the sidebar.
- Clicking a folder or note updates mounted workspace state; it must not navigate between `/`, `/history`, and `/collections`.
- Keep a small sidebar open/close control at the top-left. Mobile uses the existing Sheet; desktop collapses the persistent sidebar.
- Reading and editing happen in the same note surface. Avoid drawers, modal readers, multi-note overview grids, and nested cards.
- Q&A notes expose a non-destructive “Separate into individual notes” action. Each populated Q&A block becomes a standalone Markdown note, inherits the source collections, and leaves the original unchanged.

## Data safety

- IndexedDB/Dexie is the local source of truth. Preserve offline-first behavior and existing sync/outbox semantics.
- Editing must autosave with a short debounce and flush pending title/content changes on blur, note switch/unmount, `visibilitychange`, and `pagehide`.
- Persist workspace state per vault in localStorage: selected note, selected collection/filter, sort, and sidebar visibility.
- Never replace, clear, or migrate user data unless explicitly requested.

## Architecture boundaries

- Frontend: `frontend/` — Next.js App Router, React, TypeScript, Tailwind v4, shadcn/Radix.
- Desktop: `frontend/src-tauri/` — Tauri v2. Static export is staged by `frontend/scripts/build-tauri.mjs`.
- Database and mutations: `frontend/src/lib/db/database.ts`.
- Main workspace: `frontend/src/components/library-app.tsx`.
- Editor and Markdown tools: `frontend/src/components/note-editor.tsx`.
- Preserve account sync, import, backup, private vault, integrations, and desktop context-menu behavior.
- Use existing shadcn primitives and Lucide icons; do not add a UI dependency for simple controls.

## UX and performance

- Normal file/folder/note interactions must not call `router.push`, `router.replace`, or `beginRouteTransition`.
- Reserve real routes for leaving the workspace (integrations, private vault, legal/about/support pages).
- Do not render large note-card grids. The sidebar is the file browser.
- Keep the editor full-height and independently scrollable. Avoid page-level fades or transition curtains that make navigation feel fuzzy.
- Markdown editing should expose practical controls: headings, bold, italic, strikethrough, bullets, numbering, tasks, quote, link, inline code, code block, and horizontal rule.

## Editing rules

- Use `apply_patch` for source edits.
- Preserve unrelated user changes. Check `git status --short` before broad edits.
- Prefer `rg`/`rg --files` for discovery.
- Do not run Playwright or broad test suites unless explicitly requested. For this project, use typecheck plus production builds.

## Verification

From `frontend/` (the global npm shim may be broken, so direct local binaries are preferred):

```powershell
& node_modules\.bin\tsc.cmd --noEmit
node node_modules\next\dist\bin\next build
node scripts\build-tauri.mjs
& node_modules\.bin\tauri.cmd build --config src-tauri\tauri.local-build.json --bundles nsis
```

- Always run `git diff --check` before release.
- `tauri.local-build.json` skips the duplicate static-export command after `build-tauri.mjs`; this also avoids relying on a machine-global npm shim.
- A desktop release is published by pushing a plain semantic-version tag. `.github/workflows/desktop-release.yml` builds Windows NSIS and macOS DMG assets and creates the GitHub release.

## Version and release

- Keep these versions aligned: `frontend/package.json`, `frontend/package-lock.json`, `frontend/src-tauri/Cargo.toml`, and the ChatSaver package entry in `frontend/src-tauri/Cargo.lock`.
- Inspect existing tags and increment from the latest published version.
- Before tagging: clean typecheck, Next production build, local Windows Tauri/NSIS build, clean diff check, commit, and push.
- Then create and push the version tag and verify the GitHub Actions release workflow reaches completion.

## Communication

- Work directly and keep updates short. Lead with concrete findings or completed outcomes.
- Do not repeatedly explain framework basics or re-read the entire repository when this guide already settles the decision.
- If a required external action needs approval or authentication, state the exact blocker once.
