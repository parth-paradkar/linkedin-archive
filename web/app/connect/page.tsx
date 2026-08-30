import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ConnectPanel } from '@/components/connect-panel';
import { isMember } from '@/lib/data';

export default async function Connect() {
  if (!(await isMember())) redirect('/no-access');

  return (
    <div className="content detail">
      <p>
        <Link href="/">← Archive</Link>
      </p>
      <h2>Connect the browser extension</h2>
      <p className="muted">
        The extension signs in with a code. Generate one here, then in the extension enter your
        email and this code.
      </p>
      <ConnectPanel />
    </div>
  );
}
