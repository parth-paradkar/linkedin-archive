/** Up to two leading characters, e.g. "Ada Grace Byron" -> "AG". */
const initials = (label: string) =>
  label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? '')
    .join('')
    .toUpperCase();

/**
 * A photo when there is one, initials when there is not. LinkedIn CDN URLs are
 * signed and expire, so a stored photo eventually 404s.
 */
export function Avatar({
  name,
  slug,
  photoUrl,
  big,
}: {
  name: string;
  slug: string;
  photoUrl: string;
  big?: boolean;
}) {
  const cls = big ? 'avatar big' : 'avatar';
  if (!photoUrl) return <span className={cls}>{initials(name || slug)}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- hotlinked, not stored
  return <img className={cls} src={photoUrl} alt="" />;
}
