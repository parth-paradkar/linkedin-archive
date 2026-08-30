import type { ManifestV3Export } from '@crxjs/vite-plugin';

/**
 * The Supabase origin must appear in host_permissions for the service worker
 * to fetch it, so the manifest is built from the same env as the client.
 */
export function buildManifest(supabaseUrl: string): ManifestV3Export {
  const origin = new URL(supabaseUrl).origin;
  return {
    manifest_version: 3,
    name: 'LinkedIn Archive',
    version: '0.2.0',
    description: 'Save LinkedIn profiles with shared notes and tags.',
    permissions: ['storage'],
    host_permissions: ['*://*.linkedin.com/*', `${origin}/*`],
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
}
