import { redirect } from 'next/navigation';

/** The detail view now lives in the sidebar on the home page. Keep this path
 *  working for old links and anything that deep-links to a profile. */
export default async function ProfileRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/?profile=${encodeURIComponent(slug)}`);
}
