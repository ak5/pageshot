# Contributing to PageShot

Use Node.js 22.12 or newer, pnpm 10, and Chrome 121 or newer. Install dependencies with `nice -n 10 pnpm install --frozen-lockfile`. The README describes development, building, and loading the extension.

Create a feature branch and open a pull request directly to `main`. `main` is the only long-lived branch; do not push directly to it.

Before opening a pull request, run these checks sequentially:

```sh
nice -n 10 pnpm check
nice -n 10 pnpm lint
nice -n 10 pnpm test
nice -n 10 pnpm build
nice -n 10 pnpm test:e2e
```

Browser tests use synthetic pages and a disposable Chrome for Testing profile. Keep the single-worker setting and mocked clipboard writes. If Chrome for Testing is missing, install it with `nice -n 10 pnpm exec playwright install chromium`.

Captures must remain local and require an explicit user action. Preserve restricted-page checks, message sender validation, image size limits, and debugger cleanup. Do not include real screenshots, credentials, browser profiles, or generated build output in pull requests.

Keep `AGENTS.md` and `CLAUDE.md` byte-identical. Update the README and verification notes when behavior or checks change.
