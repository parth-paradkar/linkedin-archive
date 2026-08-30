import type { ManifestV3Export } from '@crxjs/vite-plugin';

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'LinkedIn Archive',
  version: '0.1.0',
  description: 'Save LinkedIn profiles with notes and tags.',
  permissions: ['storage', 'unlimitedStorage'],
  host_permissions: ['*://*.linkedin.com/*'],
  background: {
    service_worker: 'src/background/background.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['*://*.linkedin.com/in/*'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  action: { default_title: 'Open LinkedIn Archive' },
  options_ui: { page: 'src/viewer/index.html', open_in_tab: true },
};

export default manifest;
