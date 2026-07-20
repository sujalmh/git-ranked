import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { ArrowLeft, Users, Zap, Code, MessageSquare } from 'lucide-react';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { computeContributionScore, normalizeScoreToImpact, type ClassificationMap, type RawEvent } from '@/lib/scoring';
import { getCachedContributorResults } from '@/lib/ai';
import type { AiResult, ContributorProfile, ImpactAnalysis } from '@/lib/ai/types';
import { ImpactExplanation } from '@/components/ai';
import type { ClassificationItem } from '@/lib/ai/types';

type CompareContributor = {
  id: number;
  username: string;
  avatarUrl: string | null;
  score: ReturnType<typeof computeContributionScore>;
  impactScore: number;
  profile: AiResult<ContributorProfile> | null;
  impact: AiResult<ImpactAnalysis> | null;
};

export default async function ComparePage(
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
  
  const events = await sql`
    SELECT e.id, e.event_type, e.payload, e.created_at, e.classification,
           c.id as contributor_id, c.username, c.avatar_url
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId} AND e.created_at > NOW() - INTERVAL '30 days'
  `;

  const classifications: ClassificationMap = new Map();
  for (const row of events) {
    if (row.classification && typeof row.classification === 'object') {
      classifications.set(row.id, row.classification as ClassificationItem);
    }
  }

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
    existing.events.push({
      id: row.id,
      type: row.event_type,
      payload: (row.payload as Record<string, unknown>) || {},
      created_at: row.created_at
    });
    contributorMap.set(row.contributor_id, existing);
  }

  const contributors: CompareContributor[] = [];
  for (const c of Array.from(contributorMap.values())) {
    const score = computeContributionScore(c.events, { classifications });

    contributors.push({
      id: c.id,
      username: c.username,
      avatarUrl: c.avatarUrl,
      score,
      impactScore: Math.max(1, Math.min(100, Math.round(score.total))),
      profile: null,
      impact: null,
    });
  }

  const ranked = [...contributors].sort((a, b) => b.impactScore - a.impactScore).slice(0, 4);

  // Fetch cached AI results for the top 4 contributors
  const topIds = ranked.map(c => c.id);
  const aiResults = await getCachedContributorResults(repoId, topIds);
  for (const c of ranked) {
    const data = aiResults.get(c.id);
    if (data) {
      c.profile = data.profile as AiResult<ContributorProfile> | null;
      c.impact = data.impact as AiResult<ImpactAnalysis> | null;
    }
  }

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <div className="mb-8">
          <Link href={`/repos/${owner}/${name}`} className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-4 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2.5 mb-1">
            <Users className="w-6 h-6 text-indigo-400" />
            Team Comparison
          </h1>
          <p className="text-sm text-zinc-400">
            Side-by-side analysis of contributor impact, specializations, and focus areas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {ranked.map(c => {
            const focusAreas = c.profile?.payload.focus_areas ?? [];
            const norm = normalizeScoreToImpact(c.score);
            return (
              <div key={c.id} className="sleek-panel p-5 flex flex-col gap-5">
                <div className="flex flex-col items-center text-center">
                  <Image
                    src={c.avatarUrl || ''}
                    className="rounded-full mb-3 border border-white/10"
                    alt={c.username}
                    width={64}
                    height={64}
                  />
                  <h2 className="text-base font-semibold">{c.username}</h2>
                  <div className="text-xs text-zinc-400 mt-2 flex flex-wrap justify-center gap-1">
                    {focusAreas.length > 0 ? (
                      focusAreas.map((area, i) => (
                        <span key={i} className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 rounded-md text-indigo-300">
                          {area}
                        </span>
                      ))
                    ) : (
                      <span className="px-2 py-0.5 bg-white/5 rounded-md text-zinc-500">No focus areas</span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10">
                  <ImpactExplanation
                    result={c.impact}
                    breakdown={norm.breakdown}
                    total={c.impactScore}
                  />
                </div>

                <div className="pt-3 border-t border-white/10 space-y-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-zinc-300">Feature Delivery</span>
                    <span className="ml-auto font-bold">{norm.breakdown.featureDelivery}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Code className="w-4 h-4 text-blue-400" />
                    <span className="text-zinc-300">Code Quality</span>
                    <span className="ml-auto font-bold">{norm.breakdown.codeQuality}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4 text-purple-400" />
                    <span className="text-zinc-300">Reviews & Collab</span>
                    <span className="ml-auto font-bold">{norm.breakdown.reviews + norm.breakdown.collaboration}</span>
                  </div>
                </div>
              </div>
            );
          })}
          
          {ranked.length === 0 && (
            <div className="col-span-full text-center py-16 text-zinc-500 text-sm">
              No contributor data available for comparison yet.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
