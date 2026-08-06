import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import { ArrowLeft, Zap, MessageSquare, ShieldCheck, Activity } from 'lucide-react';
import Image from 'next/image';
import { getRepoScoringConfig, scoreRepo, type DimensionScores } from '@/lib/scoring';
import { getCachedContributorResults } from '@/lib/ai';
import type { AiResult, ContributorProfile, ImpactAnalysis } from '@/lib/ai/types';
import { ImpactExplanation } from '@/components/ai';

type CompareContributor = {
  id: number;
  username: string;
  avatarUrl: string | null;
  dimensionScores: DimensionScores;
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
      AND (i.linked_user_id = ${userId} OR r.added_by_user_id = ${userId})
  `;

  if (repoQuery.length === 0) return <div>Repository not found.</div>;

  const repoId = repoQuery[0].id;
  const config = await getRepoScoringConfig(repoId);

  let dimensionRows = await sql`
    SELECT contributor_id, decay_profile, impact, quality, collaboration, consistency, composite,
           window_start, window_end, scoring_config_version, computed_at
    FROM dimension_scores
    WHERE repo_id = ${repoId} AND decay_profile = 'current' AND scoring_config_version = ${config.version}
  `;

  if (dimensionRows.length === 0) {
    const computed = await scoreRepo(repoId);
    dimensionRows = computed.filter((s) => s.decay_profile === 'current') as unknown as typeof dimensionRows;
  }

  const contributorQuery = await sql`
    SELECT id, username, avatar_url FROM github_contributors
    WHERE id IN (SELECT DISTINCT contributor_id FROM github_events WHERE repo_id = ${repoId})
      AND username NOT ILIKE '%[bot]%'
  `;
  const contribMap = new Map<number, { username: string; avatarUrl: string | null }>();
  for (const c of contributorQuery) {
    contribMap.set(c.id, { username: c.username, avatarUrl: c.avatar_url });
  }

  const contributorAiData = await getCachedContributorResults(repoId, dimensionRows.map(r => r.contributor_id));

  const contributors: CompareContributor[] = dimensionRows.map((row) => {
    const cid = row.contributor_id as number;
    const cMeta = contribMap.get(cid) ?? { username: `user-${cid}`, avatarUrl: null };
    const aiData = contributorAiData.get(cid) ?? { profile: null, impact: null };

    return {
      id: cid,
      username: cMeta.username,
      avatarUrl: cMeta.avatarUrl,
      dimensionScores: {
        contributor_id: cid,
        repo_id: repoId,
        decay_profile: row.decay_profile,
        impact: row.impact,
        quality: row.quality,
        collaboration: row.collaboration,
        consistency: row.consistency,
        composite: row.composite,
        scoring_config_version: row.scoring_config_version,
      },
      impactScore: Math.round(row.composite),
      profile: aiData.profile as AiResult<ContributorProfile> | null,
      impact: aiData.impact as AiResult<ImpactAnalysis> | null,
    };
  });

  const ranked = [...contributors].sort((a, b) => b.impactScore - a.impactScore).slice(0, 4);

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />

      <main className="flex-1 w-full px-6 py-8">
        <Link href={`/repos/${owner}/${name}`} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6 w-fit text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Repo
        </Link>

        <h1 className="text-2xl font-bold mb-2">Contributor Dimension Comparison</h1>
        <p className="text-sm text-zinc-400 mb-8">Side-by-side breakdown of top contributors by Impact, Quality, Collaboration, and Consistency.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {ranked.map((c) => (
            <div key={c.id} className="sleek-panel p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  {c.avatarUrl ? (
                    <Image src={c.avatarUrl} alt={c.username} width={40} height={40} className="rounded-full" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-800" />
                  )}
                  <div>
                    <h3 className="font-semibold">{c.username}</h3>
                    <div className="text-xs text-accent font-bold">Composite: {c.impactScore}</div>
                  </div>
                </div>

                <div className="space-y-3 text-xs mb-4">
                  <div className="flex justify-between items-center bg-zinc-900/60 p-2 rounded-none">
                    <span className="flex items-center gap-1.5 text-zinc-400"><Zap className="w-3.5 h-3.5 text-amber-400" /> Impact</span>
                    <span className="font-bold">{c.dimensionScores.impact}</span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-900/60 p-2 rounded-none">
                    <span className="flex items-center gap-1.5 text-zinc-400"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Quality</span>
                    <span className="font-bold">{c.dimensionScores.quality}</span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-900/60 p-2 rounded-none">
                    <span className="flex items-center gap-1.5 text-zinc-400"><MessageSquare className="w-3.5 h-3.5 text-blue-400" /> Collaboration</span>
                    <span className="font-bold">{c.dimensionScores.collaboration}</span>
                  </div>
                  <div className="flex justify-between items-center bg-zinc-900/60 p-2 rounded-none">
                    <span className="flex items-center gap-1.5 text-zinc-400"><Activity className="w-3.5 h-3.5 text-purple-400" /> Consistency</span>
                    <span className="font-bold">{c.dimensionScores.consistency}</span>
                  </div>
                </div>
              </div>

              {c.impact && (
                <div className="pt-3 border-t border-zinc-800">
                  <ImpactExplanation result={c.impact} />
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
