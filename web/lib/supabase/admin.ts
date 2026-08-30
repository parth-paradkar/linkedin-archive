import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './env';

/**
 * Admin client. The service_role key bypasses RLS entirely, so this module
 * must never be imported into a Client Component. `server-only` makes that a
 * build error rather than a silent leak.
 *
 * The only caller is getExtensionCode(), which is locked to the session's own
 * email.
 */
function required(value: string | undefined): string {
  if (!value) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to the Vercel project (server env, not NEXT_PUBLIC).',
    );
  }
  return value;
}

export const adminClient = () =>
  createClient(SUPABASE_URL, required(process.env.SUPABASE_SERVICE_ROLE_KEY), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
