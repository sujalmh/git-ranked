import { Navbar } from '@/components/Navbar';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { AISummaryButton } from '@/components/AISummaryButton';
import { sql } from '@/lib/db';

export default async function ContributorDetail(
  props: { params: Promise<{ owner: string; name: string; contributor: string }> }
) {
  const params = await props.params;
  const { owner, name, contributor } = params;

  // Mock repoId and contributorId since we are in a server component, we can query it!
  const dbData = await sql`
    SELECT r.id as repo_id, c.id as contributor_id
    FROM repositories r
    JOIN github_contributors c ON c.username = ${contributor}
    WHERE r.owner = ${owner} AND r.name = ${name}
    LIMIT 1
  `;
  const repoId = dbData[0]?.repo_id || 1;
  const contributorId = dbData[0]?.contributor_id || 1;

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 mt-8">
        <Link href={`/repos/${owner}/${name}`} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-8 w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Repo
        </Link>

        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
              Contributor: {contributor}
            </h1>
            <p className="text-zinc-400">Deep dive into impact and code velocity.</p>
          </div>
        </div>

        <AISummaryButton repoId={repoId} contributorId={contributorId} />

        <div className="glass-card p-6">
          <h2 className="text-xl font-bold mb-4">Recent Events</h2>
          <p className="text-zinc-400 mb-8">Raw activity feed will be displayed here.</p>
          {/* Timeline component goes here */}
        </div>
      </main>
    </div>
  );
}
