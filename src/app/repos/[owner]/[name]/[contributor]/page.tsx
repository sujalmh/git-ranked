import { auth } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import { ArrowLeft, Crown, Star, CheckCircle, AlertTriangle, ShieldCheck, Flame, GitMerge, FileText, Cpu, Shield } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { sql } from '@/lib/db';
import { getRepoScoringConfig, scoreRepo, type DimensionScores, type WorkUnit } from '@/lib/scoring';
import { runTaskById } from '@/lib/ai';
import type { AiResult, ContributorProfile, ImpactAnalysis } from '@/lib/ai/types';
import { ContributorProfileCard, ImpactExplanation } from '@/components/ai';
import { formatRelativeDate } from '@/lib/contributor-insights';
import { getAnalysisPeriod } from '@/lib/analysis';

function StarRating({ count }: { count: number }) {
  const stars = Math.min(5, Math.max(1, Math.round(count)));
  return (
    <div className="flex items-center gap-0.5" title={`Score: ${stars}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i <= stars ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'
          }`}
        />
      ))}
    </div>
  );
}

export default async function ContributorDetail(
  props: { params: Promise<{ owner: string; name: string; contributor: string }> }
) {
  const params = await props.params;
  const session = await auth();
  const userId = session?.user?.id ?? -1;

  const { owner, name, contributor } = params;

  const repoQuery = await sql`
    SELECT r.id
    FROM repositories r
    LEFT JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name}
      AND (i.linked_user_id = ${userId} OR r.added_by_user_id = ${userId})
  `;

  if (repoQuery.length === 0) return <div className="p-8">Repository not found.</div>;

  const repoId = repoQuery[0].id;
  const config = await getRepoScoringConfig(repoId);

  const dbData = await sql`
    SELECT c.id as contributor_id, c.username, c.avatar_url
    FROM github_contributors c
    WHERE c.username = ${contributor}
    LIMIT 1
  `;

  if (dbData.length === 0) return <div className="p-8">Contributor not found.</div>;

  const contributorId = dbData[0].contributor_id;
  const avatarUrl = dbData[0].avatar_url;

  // Fetch v3 dimension scores for contributor
  let scoreRows = await sql`
    SELECT contributor_id, decay_profile, impact, quality, collaboration, consistency, composite
    FROM dimension_scores
    WHERE repo_id = ${repoId} AND contributor_id = ${contributorId} AND scoring_config_version = ${config.version}
  `;

  if (scoreRows.length === 0) {
    const computed = await scoreRepo(repoId);
    scoreRows = computed.filter((s) => s.contributor_id === contributorId) as unknown as typeof scoreRows;
  }

  const currentScore: DimensionScores = (scoreRows as unknown as DimensionScores[]).find((s) => s.decay_profile === 'current') ?? {
    contributor_id: contributorId,
    repo_id: repoId,
    decay_profile: 'current',
    impact: 0,
    quality: 0,
    collaboration: 0,
    consistency: 0,
    composite: 0,
    scoring_config_version: config.version,
  };

  // Fetch contributor work units
  const workUnitsQuery = await sql`
    SELECT wu.id, wu.work_type, wu.summary, wu.facts, wu.derived, wu.extraction_confidence,
           wu.extraction_source, wu.shipped, wu.outcome, wu.size_metrics, wu.rationale,
           wu.shipped_at, wu.created_at
    FROM work_units wu
    JOIN work_unit_contributors wuc ON wu.id = wuc.work_unit_id
    WHERE wu.repo_id = ${repoId} AND wuc.contributor_id = ${contributorId}
    ORDER BY wu.created_at DESC
  `;

  const workUnits = workUnitsQuery as WorkUnit[];

  const { dateTo, dateFrom } = getAnalysisPeriod();

  let profileResult: AiResult<ContributorProfile> | null = null;
  let impactResult: AiResult<ImpactAnalysis> | null = null;
  try {
    profileResult = (await runTaskById('contributor_profile', repoId, dateFrom, dateTo, contributorId)) as AiResult<ContributorProfile> | null;
    impactResult = (await runTaskById('impact_analysis', repoId, dateFrom, dateTo, contributorId)) as AiResult<ImpactAnalysis> | null;
  } catch (err) {
    console.error('AI fetch failed', err);
  }

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />

      <main className="flex-1 w-full px-6 py-8">
        <Link
          href={`/repos/${owner}/${name}`}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6 w-fit text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Repo
        </Link>

        {/* Contributor Header */}
        <div className="flex items-center justify-between mb-8 p-6 sleek-panel">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <Image src={avatarUrl} width={64} height={64} className="rounded-full border border-white/10" alt={contributor} />
            ) : (
              <div className="w-16 h-16 rounded-full bg-zinc-800 border border-white/10" />
            )}
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {contributor}
              </h1>
              <p className="text-xs text-zinc-400 mt-1">Profile: {config.profile} profile active</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-3xl font-black text-accent leading-none">{Math.round(currentScore.composite)}</div>
              <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider mt-1">Composite Score</div>
            </div>
          </div>
        </div>

        {/* 5 Dimension Breakdown Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="sleek-panel p-4">
            <div className="text-xs text-zinc-400 mb-1">Impact</div>
            <div className="text-2xl font-bold text-amber-400">{currentScore.impact}</div>
          </div>
          <div className="sleek-panel p-4">
            <div className="text-xs text-zinc-400 mb-1">Quality</div>
            <div className="text-2xl font-bold text-emerald-400">{currentScore.quality}</div>
          </div>
          <div className="sleek-panel p-4">
            <div className="text-xs text-zinc-400 mb-1">Collaboration</div>
            <div className="text-2xl font-bold text-blue-400">{currentScore.collaboration}</div>
          </div>
          <div className="sleek-panel p-4">
            <div className="text-xs text-zinc-400 mb-1">Consistency</div>
            <div className="text-2xl font-bold text-purple-400">{currentScore.consistency}</div>
          </div>
        </div>

        {/* AI Profile & Impact Sections (Description, Strengths, Focus Areas, Accomplishments, Concerns) */}
        {(profileResult || impactResult) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {profileResult && <ContributorProfileCard result={profileResult} />}
            {impactResult && <ImpactExplanation result={impactResult} />}
          </div>
        )}

        {/* Extracted Work Units Section */}
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-accent" />
            Extracted Work Units & Explainable Scores ({workUnits.length})
          </h2>

          {workUnits.length === 0 ? (
            <div className="sleek-panel p-6 text-center text-sm text-zinc-400">
              No work units extracted yet. Run repository classification to generate work items.
            </div>
          ) : (
            <div className="space-y-3">
              {workUnits.map((unit) => (
                <div key={unit.id} className="sleek-panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-none bg-accent/20 text-accent border border-accent/30">
                        {unit.work_type}
                      </span>
                      {unit.shipped && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-none bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Shipped
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-500" title={`Extraction Source: ${unit.extraction_source}`}>
                        {Math.round(unit.extraction_confidence * 100)}% confidence ({unit.extraction_source})
                      </span>
                    </div>

                    <div className="text-sm font-medium text-zinc-200 mt-1">
                      {unit.summary || unit.rationale?.impact_reason}
                    </div>

                    <div className="text-xs text-zinc-400">
                      {unit.rationale?.impact_reason}
                      {unit.rationale?.impact_reason && unit.rationale?.quality_reason ? ' · ' : ''}
                      Quality: {unit.rationale?.quality_reason}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-zinc-800">
                    <div className="text-right">
                      <div className="text-xs text-zinc-500 mb-0.5">Difficulty</div>
                      <StarRating count={unit.derived?.difficulty ?? 1} />
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-zinc-500 mb-0.5">Execution</div>
                      <StarRating count={unit.derived?.execution_quality ?? 1} />
                    </div>
                    <div className="text-right pl-2 border-l border-zinc-800">
                      <div className="text-xs text-zinc-500">Value</div>
                      <div className="text-base font-bold text-accent">
                        {((unit.derived?.value ?? 0) * 10).toFixed(1)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
