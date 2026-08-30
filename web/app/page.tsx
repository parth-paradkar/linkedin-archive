import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/avatar';
import { FocusRefresh } from '@/components/focus-refresh';
import { ProfileDetail } from '@/components/profile-detail';
import { allTags, currentEmail, getProfile, isMember, listProfiles, PER_PAGE } from '@/lib/data';

type Props = {
  searchParams: Promise<{
    q?: string;
    tag?: string | string[];
    page?: string;
    profile?: string;
  }>;
};

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

type Query = { q: string; tags: string[]; page: number; profile?: string };

/** Rebuild the query string, overriding some keys. `null` drops a key. */
function href(cur: Query, over: Partial<Record<keyof Query, string | number | null>>): string {
  const params = new URLSearchParams();
  const q = 'q' in over ? over.q : cur.q;
  const page = 'page' in over ? over.page : cur.page;
  const profile = 'profile' in over ? over.profile : cur.profile;

  if (q) params.set('q', String(q));
  for (const t of cur.tags) params.append('tag', t);
  if (page && Number(page) > 1) params.set('page', String(page));
  if (profile) params.set('profile', String(profile));

  const s = params.toString();
  return s ? `/?${s}` : '/';
}

function tagHref(cur: Query, tag: string): string {
  const tags = cur.tags.includes(tag) ? cur.tags.filter((t) => t !== tag) : [...cur.tags, tag];
  const params = new URLSearchParams();
  if (cur.q) params.set('q', cur.q);
  for (const t of tags) params.append('tag', t);
  const s = params.toString();
  return s ? `/?${s}` : '/';
}

export default async function Archive({ searchParams }: Props) {
  if (!(await isMember())) redirect('/no-access');

  const sp = await searchParams;
  const cur: Query = {
    q: sp.q ?? '',
    tags: asArray(sp.tag),
    page: Math.max(1, Number(sp.page) || 1),
    profile: sp.profile,
  };

  const [{ profiles, total }, tags, email, detail] = await Promise.all([
    listProfiles(cur.q, cur.tags, cur.page),
    allTags(),
    currentEmail(),
    cur.profile ? getProfile(cur.profile) : Promise.resolve(null),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="shell" data-detail={detail ? 'open' : 'closed'}>
      <FocusRefresh />
      <aside className="sidebar">
        <h1>Archive</h1>
        <form action="/">
          <input type="search" name="q" defaultValue={cur.q} placeholder="Search…" />
          {cur.tags.map((t) => (
            <input key={t} type="hidden" name="tag" value={t} />
          ))}
        </form>
        <div className="tag-list">
          {tags.map(({ tag: t, count }) => (
            <Link
              key={t}
              href={tagHref(cur, t)}
              className="tag-link"
              data-on={cur.tags.includes(t)}
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
          <>
            <div className="rows">
              {profiles.map((p) => (
                <Link
                  key={p.slug}
                  href={href(cur, { profile: p.slug })}
                  className="row"
                  data-active={p.slug === cur.profile}
                >
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

            {pageCount > 1 ? (
              <nav className="pager">
                {cur.page > 1 ? (
                  <Link href={href(cur, { page: cur.page - 1 })}>← Newer</Link>
                ) : (
                  <span className="muted">← Newer</span>
                )}
                <span className="muted">
                  Page {cur.page} of {pageCount}
                </span>
                {cur.page < pageCount ? (
                  <Link href={href(cur, { page: cur.page + 1 })}>Older →</Link>
                ) : (
                  <span className="muted">Older →</span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </main>

      {detail ? (
        <aside className="pane">
          <ProfileDetail
            profile={detail.profile}
            notes={detail.notes}
            viewerEmail={email ?? ''}
            closeHref={href(cur, { profile: null })}
          />
        </aside>
      ) : null}
    </div>
  );
}
