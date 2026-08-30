import type { NoteEntry, Profile } from '@archive/shared';
import { Avatar } from '@/components/avatar';
import { NoteThread } from '@/components/note-thread';
import { TagEditor } from '@/components/tag-editor';

/** Detail view, shown in the sidebar pane and (via redirect fallback) full page. */
export function ProfileDetail({
  profile: p,
  notes,
  viewerEmail,
  closeHref,
}: {
  profile: Profile;
  notes: NoteEntry[];
  viewerEmail: string;
  closeHref: string;
}) {
  return (
    <div className="detail">
      <a href={closeHref} className="detail-close" aria-label="Close">
        ×
      </a>
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
      <NoteThread slug={p.slug} notes={notes} viewerEmail={viewerEmail} />
    </div>
  );
}
