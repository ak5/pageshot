# Verification

Verification date: 2026-11-19.

TypeScript/Svelte checks (zero errors or warnings), ESLint, all 27 unit/component tests, and the production build pass. The extension build is generated in `.output/chrome-mv3` and excluded from source control.

## Automated coverage

- Full-page and scrolled-viewport geometry, image size guards including Retina output, reverse and out-of-bounds crops, and filenames.
- Visible-tile capture, overlap cropping at the bottom, scroll-stall rejection, and viewport-only mode.
- Lazy-content loading before capture, restarting from the top after document growth, and reducing output resolution to fit the memory limit on the expanded page.
- Fixed/sticky element handling, exact property priority restoration, and original scroll restoration.
- Chrome debugger attachment and screenshot commands; page cleanup and detachment on success, tile failures, and navigation; restricted-page rejection.
- Local HTML capture in both modes with file access enabled, and a specific error when file access is disabled (mocked Chrome API).
- Component checks for capture, clipboard actions, one-time error display, error dismissal, clearing errors after successful capture, and empty editor state.

The E2E suite in `e2e/extension.spec.ts` covers a synthetic 3,000-pixel document, image pixels at the middle and bottom, scroll preservation, debugger cleanup, popup recovery, PNG download, crop, black covering, reset, and visible-area capture. It copies the built extension to a temporary directory and grants only the synthetic fixture origin to substitute for toolbar-granted `activeTab` access when opening the popup as a regular test tab. It uses a temporary Chrome profile and mocks clipboard writes to preserve the system clipboard.

**E2E has not passed in this environment.** The installed Playwright Chrome for Testing exited with SIGABRT during launch in the sandbox before any test ran. No browser assertions ran. Run `nice -n 10 pnpm exec playwright install chromium` and `nice -n 10 pnpm test:e2e` in a regular terminal after building.

Dropdowns now use a shared custom chevron with native arrow rendering disabled. Browser visual verification remains pending.

## Manual checks still needed

- Load unpacked in Chrome, pin the action, capture a real webpage, and paste into a destination such as Notes. Real system clipboard writes are intentionally not exercised by automated tests.
- Verify popup behavior around Chrome's debugging banner, browser zoom and a Retina display, and a long lazy-loaded page.
- Try a signed-in page, fixed headers, embedded frames, and DevTools-open failure handling.

## Toolchain

The checks above used the installed dependencies. A clean installation from the committed lockfile was attempted in an isolated source snapshot but failed because the sandbox could not resolve `registry.npmjs.org`. Offline installation also failed because required packages were not cached. A clean installation still needs verification.

## Publication checks

Gitleaks scanned the 41-file publication snapshot with its default rules and found no secrets. The snapshot includes source, tests, documentation, icons, configuration, and the lockfile; it excludes dependencies, caches, generated builds, test artifacts, environment files, and scratch files. This is a current-file scan; no Git history is present in this directory.

All heavy commands were prefixed with `nice -n 10`. The sandbox reported that it could not change process priority, and then ran the commands. No development server was started or existing port reused.
