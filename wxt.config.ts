import { defineConfig } from 'wxt';
const icons = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };
export default defineConfig({
  srcDir: 'src', modules: ['@wxt-dev/module-svelte'], webExt: { disabled: true },
  vite: () => ({ build: { modulePreload: { polyfill: false } } }),
  manifest: {
    name: 'PageShot', description: 'Capture a whole page or visible area. Copy, download, or crop. All on your device.',
    minimum_chrome_version: '121', permissions: ['activeTab', 'debugger', 'clipboardWrite'],
    action: { default_title: 'PageShot — capture this page', default_icon: icons },
    icons,
  },
});
