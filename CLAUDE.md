# PageShot

Read README.md before changes. Keep AGENTS.md and CLAUDE.md byte-identical.

- WXT, Svelte 5, strict TypeScript, pnpm. Entrypoints: `src/entrypoints`; shared logic: `src/lib`.
- Keep the popup focused on capture, copy, download, and opening the editor.
- Captures run only on an explicit user action. Attach Chrome's debugger only for capture and always detach in `finally`.
- Full-page capture must scroll and stitch visible tiles, reject scroll stalls, and restore page styles and scroll in `finally`. Never request an oversized beyond-viewport screenshot.
- Store just the latest screenshot locally in IndexedDB. Never transmit screenshots, add analytics, or request blanket website access.
- Keep the image size guard, restricted-page validation, and message sender validation.
- Editor changes stay in its tab; the popup retains the original until replaced or cleared.
- Run heavy commands with `nice -n 10`: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, then `pnpm test:e2e` with one worker.
- E2E tests use a temporary Chrome for Testing profile and synthetic pages, never the user's profile. Mock clipboard writes in tests to preserve the system clipboard.
- `pnpm dev` chooses a free port and records `.env.dev-slot`. Reuse an existing server when appropriate; stop servers you start.
- Do not hand-edit `.wxt` or `.output`. Scratch files belong in ignored `tmp/`.
- Use Chrome control or terminal verification. Never use the in-app browser.
- Prefer forward-looking docs and the smallest complete implementation.
- GitHub model: `main` is the only long-lived branch. Use feature branches and PRs directly to `main`; do not create a `dev` branch or push directly to `main`.
