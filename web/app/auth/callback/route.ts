import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Lands here from the emailed magic link. Supabase sends either a PKCE `code`
 * or a `token_hash` depending on project settings, so handle both.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const next = searchParams.get('next') ?? '/';

  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash })
      : { error: new Error('missing code') };

  if (error) {
    const to = new URL('/login', origin);
    to.searchParams.set('error', 'That sign-in link did not work. Request a new one.');
    return NextResponse.redirect(to);
  }

  // A valid session still does not mean access: membership is checked here so
  // a non-member sees a clear page instead of an empty archive.
  const { data: isMember } = await supabase.rpc('is_member');
  return NextResponse.redirect(new URL(isMember ? next : '/no-access', origin));
}
