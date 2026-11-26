import { notFound } from 'next/navigation';
import { getRepoByShareToken } from '@/lib/share';

/**
 * Validate the share token above the segment's loading.tsx boundary so an
 * invalid/revoked link returns a real 404 instead of a streamed 200 soft 404.
 */
export default async function SharedTokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const repo = await getRepoByShareToken(token);

  if (!repo) notFound();

  return children;
}
