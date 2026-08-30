'use client';

import { useState, useTransition } from 'react';
import { getExtensionCode } from '@/lib/actions';

type Result = { code: string; email: string; expiresInMinutes: number };

export function ConnectPanel() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const generate = () =>
    start(async () => {
      setError('');
      setResult(null);
      const res = await getExtensionCode();
      if ('error' in res) setError(res.error);
      else setResult(res);
    });

  return (
    <div className="connect">
      <button onClick={generate} disabled={pending}>
        {pending ? 'Generating…' : result ? 'Generate a new code' : 'Get code'}
      </button>

      {error ? <p className="error">{error}</p> : null}

      {result ? (
        <div className="code-box">
          <p className="muted">Email</p>
          <p className="mono">{result.email}</p>
          <p className="muted">Code</p>
          <p className="code">{result.code}</p>
          <p className="muted">
            Expires in {result.expiresInMinutes} minutes, single use. Generating a new code
            invalidates this one.
          </p>
        </div>
      ) : null}
    </div>
  );
}
