import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { ArrowLeft, Layers3 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { runTaskById } from '@/lib/ai';
import type { AiResult, ReleaseNotes } from '@/lib/ai/types';
import { ReleaseNotesCard } from '@/components/ai';

export default async function ReleasesPage(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const session = await auth();
  const userId = session?.user?.id ?? -1;

  const { owner, name } = params;

  const repoQuery = await sql`
    SELECT r.id, r.github_repo_id
    FROM repositories r
    LEFT JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} 
      AND (i.linked_user_id = ${userId} OR r.installation_id IS NULL)
  `;

  if (repoQuery.length === 0) return <div>Repository not found.</div>;

  const repoId = repoQuery[0].id;
  
  // Last 30 days releases
  const dateTo = new Date().toISOString().split('T')[0];
  // eslint-disable-next-line react-hooks/purity
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  let releaseNotesResult: AiResult<ReleaseNotes> | null = null;
  try {
    releaseNotesResult = await runTaskById('release_notes', repoId, dateFrom, dateTo) as AiResult<ReleaseNotes> | null;
  } catch (err) {
    console.error("AI Generation failed", err);
  }

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        <div className="mb-8">
          <Link href={`/repos/${owner}/${name}`} className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-4 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2.5 mb-1">
            <Layers3 className="w-6 h-6 text-indigo-400" />
            AI Release Notes
          </h1>
          <p className="text-sm text-zinc-400">
            Automatically generated changelog based on merged features and resolved issues from the last 30 days for {owner}/{name}.
          </p>
        </div>

        <div className="sleek-panel p-6">
          {releaseNotesResult ? (
            <ReleaseNotesCard result={releaseNotesResult} />
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-400 mb-3">No release notes have been generated yet.</p>
              <Link
                href={`/repos/${owner}/${name}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold text-sm"
              >
                Back to repository to analyse
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
