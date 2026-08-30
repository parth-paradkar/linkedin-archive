import { defineConfig, loadEnv } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { buildManifest } from './manifest.config.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const url = env.VITE_SUPABASE_URL;
  if (!url) throw new Error('VITE_SUPABASE_URL must be set; copy .env.example to .env');

  return {
    plugins: [crx({ manifest: buildManifest(url) })],
    build: { emptyOutDir: true },
  };
});
