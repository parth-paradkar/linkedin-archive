import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Avatar } from '@/components/avatar';
import { FocusRefresh } from '@/components/focus-refresh';
import { NoteThread } from '@/components/note-thread';
import { TagEditor } from '@/components/tag-editor';
import { currentEmail, getProfile, isMember } from '@/lib/data';

type Props = { params: Promise<{ slug: string }> };

export default async function ProfilePage({ params }: Props) {
  if (!(await isMember())) redirect('/no-access');

  const { slug } = await params;
  const [found, email] = await Promise.all([getProfile(slug), currentEmail()]);
  if (!found) notFound();

  const { profile: p, notes } = found;

  return (
    <div className="content detail">
      <FocusRefresh />
      <p>
        <Link href="/">← Archive</Link>
      </p>

      <Avatar name={p.name} slug={p.slug} photoUrl={p.photoUrl} big />
      <h2>{p.name}</h2>
      <p className="muted">{p.headline}</p>
      <p className="muted">{[p.company, p.location].filter(Boolean).join(' · ')}</p>
      <p>
        <a href={p.url} target="_blank" rel="noreferrer">
          Open on LinkedIn ↗
        </a>
      </p>
      <p className="muted">Saved {new Date(p.savedAt).toLocaleDateString()}</p>

      {p.about ? (
        <>
          <label>About</label>
          <p className="about">{p.about}</p>
        </>
      ) : null}

      <label>Tags</label>
      <TagEditor slug={p.slug} tags={p.tags} />

      <label>Notes</label>
      <NoteThread slug={p.slug} notes={notes} viewerEmail={email ?? ''} />
    </div>
  );
}
