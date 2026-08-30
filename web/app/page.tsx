import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/avatar';
import { FocusRefresh } from '@/components/focus-refresh';
import { allTags, currentEmail, isMember, listProfiles } from '@/lib/data';

type Props = { searchParams: Promise<{ q?: string; tag?: string | string[] }> };

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Toggle one tag in the current query string. */
function tagHref(q: string, selected: string[], tag: string): string {
  const next = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag];
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  for (const t of next) params.append('tag', t);
  const s = params.toString();
  return s ? `/?${s}` : '/';
}

export default async function Archive({ searchParams }: Props) {
  if (!(await isMember())) redirect('/no-access');

  const { q = '', tag } = await searchParams;
  const selected = asArray(tag);
  const [profiles, tags, email] = await Promise.all([
    listProfiles(q, selected),
    allTags(),
    currentEmail(),
  ]);

  return (
    <div className="shell">
      <FocusRefresh />
      <aside className="sidebar">
        <h1>Archive</h1>
        <form action="/">
          <input type="search" name="q" defaultValue={q} placeholder="Search…" />
          {selected.map((t) => (
            <input key={t} type="hidden" name="tag" value={t} />
          ))}
        </form>
        <div className="tag-list">
          {tags.map(({ tag: t, count }) => (
            <Link
              key={t}
              href={tagHref(q, selected, t)}
              className="tag-link"
              data-on={selected.includes(t)}
            >
              <span>{t}</span>
              <span className="count">{count}</span>
            </Link>
          ))}
        </div>
        <div className="spacer" />
        <Link href="/connect" className="muted" style={{ fontSize: 12 }}>
          Connect extension →
        </Link>
        <p className="muted" style={{ fontSize: 12 }}>
          {email}
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </aside>

      <main className="content">
        {profiles.length === 0 ? (
          <p className="empty">No profiles match.</p>
        ) : (
          <div className="rows">
            {profiles.map((p) => (
              <Link key={p.slug} href={`/p/${p.slug}`} className="row">
                <Avatar name={p.name} slug={p.slug} photoUrl={p.photoUrl} />
                <span className="meta">
                  <div className="name">{p.name}</div>
                  <div className="sub">
                    {[p.headline || p.role, p.company].filter(Boolean).join(' · ')}
                  </div>
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
