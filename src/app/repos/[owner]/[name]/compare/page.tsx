import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { GitBranch, ArrowLeft, Users, Zap, Code, MessageSquare, Plus } from 'lucide-react';
import { redirect } from 'next/navigation';
import { computeContributionScore, RawEvent } from '@/lib/scoring';
import { ExplainableScore } from '@/components/ExplainableScore';
import { generateSummary } from '@/lib/ai';

type CompareContributor = {
  id: number;
  username: string;
  avatarUrl: string | null;
  score: ReturnType<typeof computeContributionScore>;
  impactScore: number;
  areasOfContribution: string;
};

export default async function ComparePage(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { owner, name } = params;

  const repoQuery = await sql`
    SELECT r.id
    FROM repositories r
    JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
  `;

  if (repoQuery.length === 0) return <div>Repository not found.</div>;

  const repoId = repoQuery[0].id;
  
  const events = await sql`
    SELECT e.event_type, e.payload, e.created_at, c.id as contributor_id, c.username, c.avatar_url
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId} AND e.created_at > NOW() - INTERVAL '30 days'
  `;

  // Process events for contributors
  const contributorMap = new Map<number, {
    id: number;
    username: string;
    avatarUrl: string | null;
    events: RawEvent[];
  }>();
  for (const row of events) {
    const existing = contributorMap.get(row.contributor_id) || {
      id: row.contributor_id,
      username: row.username,
      avatarUrl: row.avatar_url,
      events: [] as RawEvent[]
    };
    existing.events.push({ type: row.event_type, payload: (row.payload as Record<string, unknown>) || {}, created_at: row.created_at });
    contributorMap.set(row.contributor_id, existing);
  }

  const dateTo = new Date().toISOString().split('T')[0];
  // eslint-disable-next-line react-hooks/purity
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const contributors: CompareContributor[] = [];
  for (const c of Array.from(contributorMap.values())) {
    const score = computeContributionScore(c.events);
    
    // Generate AI areas of contribution
    let areas = "Unknown";
    try {
      areas = await generateSummary(repoId, 'areas_of_contribution', dateFrom, dateTo, c.id);
    } catch (e) {}

    contributors.push({
      id: c.id,
      username: c.username,
      avatarUrl: c.avatarUrl,
      score,
      impactScore: score.total, // Will normalize below
      areasOfContribution: areas
    });
  }
  
  const topScore = Math.max(...contributors.map(c => c.impactScore), 1);
  const ranked = contributors.map(c => ({
    ...c,
    impactScore: Math.max(1, Math.round((c.impactScore / topScore) * 100))
  })).sort((a, b) => b.impactScore - a.impactScore).slice(0, 4); // Compare top 4

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 mt-8">
        <div className="mb-10">
          <Link href={`/repos/${owner}/${name}`} className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-indigo-400" />
            Team Comparison
          </h1>
          <p className="text-zinc-400">
            Side-by-side analysis of contributor impact, specializations, and focus areas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {ranked.map(c => (
            <div key={c.id} className="glass-card p-6 flex flex-col gap-6">
              <div className="flex flex-col items-center text-center">
                <img src={c.avatarUrl || ''} className="w-20 h-20 rounded-full mb-4 border border-white/10" alt="" />
                <h2 className="text-xl font-bold">{c.username}</h2>
                <div className="text-xs text-zinc-400 mt-2 flex flex-wrap justify-center gap-1">
                  {c.areasOfContribution.split(',').map((area, i) => (
                    <span key={i} className="px-2 py-1 bg-white/5 rounded-md">{area.trim()}</span>
                  ))}
                </div>
              </div>
              
              <div className="pt-4 border-t border-white/10">
                <ExplainableScore total={c.impactScore} breakdown={c.score.breakdown} />
              </div>
              
              <div className="pt-4 border-t border-white/10 space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="text-zinc-300">Feature Delivery</span>
                  <span className="ml-auto font-bold">{c.score.breakdown.featureDelivery}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Code className="w-4 h-4 text-blue-400" />
                  <span className="text-zinc-300">Code Quality</span>
                  <span className="ml-auto font-bold">{c.score.breakdown.codeQuality}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 text-purple-400" />
                  <span className="text-zinc-300">Reviews & Collab</span>
                  <span className="ml-auto font-bold">{c.score.breakdown.reviews + c.score.breakdown.collaboration}</span>
                </div>
              </div>
            </div>
          ))}
          
          {ranked.length === 0 && (
            <div className="col-span-full text-center py-20 text-zinc-500">
              No contributor data available for comparison yet.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
