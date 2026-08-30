'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Refetch when the tab regains focus, so a co-founder's edits show up. */
export function FocusRefresh() {
  const router = useRouter();
  useEffect(() => {
    const onFocus = () => router.refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [router]);
  return null;
}
