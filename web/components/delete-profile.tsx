'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteProfile } from '@/lib/actions';

/** Removes the profile (notes cascade) and returns to the list. */
export function DeleteProfile({ slug, name, afterHref }: { slug: string; name: string; afterHref: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const remove = () => {
    if (!confirm(`Delete ${name} and all its notes? This cannot be undone.`)) return;
    start(async () => {
      setError('');
      const res = await deleteProfile(slug);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(afterHref);
    });
  };

  return (
    <div className="delete-profile">
      <button type="button" className="danger" onClick={remove} disabled={pending}>
        {pending ? 'Deleting…' : 'Delete profile'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
