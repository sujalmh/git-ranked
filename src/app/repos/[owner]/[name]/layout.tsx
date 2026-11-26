import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getOwnedRepo } from '@/lib/repo-access';

/**
 * Reject unknown/unauthorized repositories here, above the segment's
 * loading.tsx boundary. notFound() inside the page would stream the shell
 * first and therefore answer 200 (a soft 404) instead of a real 404.
 */
export default async function OwnedRepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; name: string }>;
}) {
  const { owner, name } = await params;
  const session = await auth();
  const repo = await getOwnedRepo(owner, name, session?.user?.id ?? -1);

  if (!repo) notFound();

  return children;
}
