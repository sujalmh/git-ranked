import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { GitBranch, ArrowLeft, Layers3 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { generateSummary } from '@/lib/ai';

export default async function ReleasesPage(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { owner, name } = params;

  const repoQuery = await sql`
    SELECT r.id, r.github_repo_id
    FROM repositories r
    JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
  `;

  if (repoQuery.length === 0) return <div>Repository not found.</div>;

  const repoId = repoQuery[0].id;
  
  // Last 30 days releases
  const dateTo = new Date().toISOString().split('T')[0];
  // eslint-disable-next-line react-hooks/purity
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  let releaseNotes = "No release notes could be generated.";
  try {
    releaseNotes = (await generateSummary(repoId, 'release_notes', dateFrom, dateTo)) || "No release notes could be generated.";
  } catch (err) {
    console.error("AI Generation failed", err);
  }

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full p-6 mt-8">
        <div className="mb-10">
          <Link href={`/repos/${owner}/${name}`} className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
            <Layers3 className="w-8 h-8 text-indigo-400" />
            AI Release Notes
          </h1>
          <p className="text-zinc-400">
            Automatically generated changelog based on merged features and resolved issues from the last 30 days for {owner}/{name}.
          </p>
        </div>

        <div className="glass-card p-10 prose prose-invert prose-indigo max-w-none">
          <div dangerouslySetInnerHTML={{ __html: releaseNotes.replace(/\n/g, '<br/>') }} />
        </div>
      </main>
    </div>
  );
}
