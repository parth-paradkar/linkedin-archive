import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { SUPABASE_ANON_KEY as key, SUPABASE_URL as url } from './env';

/** Server-side Supabase client bound to the request's cookies. */
export async function createClient() {
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components may not set cookies. The proxy refreshes the
          // session on every request, so there is nothing to recover here.
        }
      },
    },
  });
}
