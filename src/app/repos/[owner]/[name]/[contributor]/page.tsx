import { auth } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import { ArrowLeft, Crown } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { sql } from '@/lib/db';
import { redirect } from 'next/navigation';
import { computeScoreBaseline, normalizeScoreToImpact, type ClassificationMap, type RawEvent } from '@/lib/scoring';
import { runTaskById } from '@/lib/ai';
import type { AiResult, ContributorProfile, ImpactAnalysis } from '@/lib/ai/types';
import { ContributorProfileCard, ImpactExplanation } from '@/components/ai';
import { describeEvent, asPayload, eventDate, formatRelativeDate } from '@/lib/contributor-insights';
import type { ClassificationItem } from '@/lib/ai/types';

type EventRow = {
  id: number;
  event_type: string;
  payload: unknown;
  created_at: Date | string;
  classification?: unknown;
  contributor_id: number;
  username: string;
};

export default async function ContributorDetail(
  props: { params: Promise<{ owner: string; name: string; contributor: string }> }
) {
  const params = await props.params;
  const session = await auth();
  const userId = session?.user?.id ?? -1;

  const { owner, name, contributor } = params;

  // Verify repo access
  const repoQuery = await sql`
    SELECT r.id
    FROM repositories r
    LEFT JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} 
      AND (i.linked_user_id = ${userId} OR r.installation_id IS NULL)
  `;

  if (repoQuery.length === 0) return <div>Repository not found.</div>;

  const repoId = repoQuery[0].id;

  const dbData = await sql`
    SELECT c.id as contributor_id, c.username, c.avatar_url
    FROM github_contributors c
    WHERE c.username = ${contributor}
    LIMIT 1
  `;

  if (dbData.length === 0) return <div>Contributor not found.</div>;

  const contributorId = dbData[0].contributor_id;
  const avatarUrl = dbData[0].avatar_url;

  // 30-day window — matches the AI impact-analysis window so the deterministic
  // 0-100 score and the AI explanation use the same normalized scale.
  const dateTo = new Date().toISOString().split('T')[0];
  // eslint-disable-next-line react-hooks/purity
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Fetch all contributors' events for the 30-day window so we can compute a
  // repo-wide topScore and normalize this contributor's score to 0-100.
  const eventRows = (await sql`
    SELECT e.id, e.event_type, e.payload, e.created_at, e.classification, e.contributor_id, c.username
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId}
      AND c.username NOT ILIKE '%[bot]%'
      AND e.created_at >= ${dateFrom}::date
      AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
    ORDER BY e.created_at DESC
  `) as EventRow[];

  // Build classifications map and group events by contributor
  const classifications: ClassificationMap = new Map();
  const eventsByContributor = new Map<number, RawEvent[]>();
  for (const row of eventRows) {
    if (row.classification && typeof row.classification === 'object') {
      classifications.set(row.id, row.classification as ClassificationItem);
    }
    const list = eventsByContributor.get(row.contributor_id) ?? [];
    list.push({
      id: row.id,
      type: row.event_type,
      payload: asPayload(row.payload),
      created_at: eventDate(row.created_at).toISOString(),
    });
    eventsByContributor.set(row.contributor_id, list);
  }

  // Compute the absolute 0-100 impact score (comparable across repos and
  // consistent with the leaderboard).
  const { scoresByContributor } = computeScoreBaseline(eventsByContributor, classifications);
  const rawScore = scoresByContributor.get(contributorId);
  const normalized = rawScore
    ? normalizeScoreToImpact(rawScore)
    : { total: 0, breakdown: { featureDelivery: 0, codeQuality: 0, reviews: 0, collaboration: 0, consistency: 0 } };

  // Calculate leaderboard rank for top 3 gold/silver/bronze styling
  const sortedContributors = Array.from(scoresByContributor.entries()).sort((a, b) => b[1].total - a[1].total);
  const rankIndex = sortedContributors.findIndex(([id]) => id === contributorId);
  const rank = rankIndex !== -1 ? rankIndex + 1 : null;

  const recentEvents = (eventsByContributor.get(contributorId) ?? []).slice(0, 50);

  // Fetch AI results (cache only)
  let profileResult: AiResult<ContributorProfile> | null = null;
  let impactResult: AiResult<ImpactAnalysis> | null = null;
  try {
    profileResult = await runTaskById('contributor_profile', repoId, dateFrom, dateTo, contributorId) as AiResult<ContributorProfile> | null;
    impactResult = await runTaskById('impact_analysis', repoId, dateFrom, dateTo, contributorId) as AiResult<ImpactAnalysis> | null;
  } catch (err) {
    console.error("AI fetch failed", err);
  }

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      
      <main className="flex-1 w-full px-6 py-8">
        <Link href={`/repos/${owner}/${name}`} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6 w-fit text-base font-medium">
          <ArrowLeft className="w-5 h-5" /> Back to Repo
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {avatarUrl && (
              <Image
                src={avatarUrl}
                className={`rounded-full ${
                  rank === 1 ? 'border-2 border-[#ffd700] shadow-[0_0_15px_rgba(255,215,0,0.4)]' :
                  rank === 2 ? 'border-2 border-[#c0c0c0] shadow-[0_0_15px_rgba(192,192,192,0.4)]' :
                  rank === 3 ? 'border-2 border-[#cd7f32] shadow-[0_0_15px_rgba(205,127,50,0.4)]' :
                  'border border-white/10'
                }`}
                alt={contributor}
                width={64}
                height={64}
              />
            )}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className={`text-3xl md:text-4xl font-black ${
                  rank === 1 ? 'text-[#ffd700]' :
                  rank === 2 ? 'text-[#c0c0c0]' :
                  rank === 3 ? 'text-[#cd7f32]' :
                  'text-white'
                }`}>
                  {contributor}
                </h1>
                {rank && rank <= 3 && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-bold uppercase tracking-wider ${
                    rank === 1 ? 'bg-[#ffd700]/10 border border-[#ffd700]/40 text-[#ffd700]' :
                    rank === 2 ? 'bg-[#c0c0c0]/10 border border-[#c0c0c0]/40 text-[#c0c0c0]' :
                    'bg-[#cd7f32]/10 border border-[#cd7f32]/40 text-[#cd7f32]'
                  }`}>
                    {rank === 1 && <Crown className="w-4 h-4 text-[#ffd700]" />}
                    #{rank} Contributor
                  </span>
                )}
              </div>
              <p className="text-base text-zinc-400">Deep dive into impact and code velocity.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* AI Contributor Profile */}
          <div className="sleek-panel p-6 border-t-2 border-t-[#00ffff]">
            <h2 className="text-xl uppercase tracking-wider font-bold mb-4 text-white">AI Contributor Profile</h2>
            {profileResult ? (
              <ContributorProfileCard result={profileResult} />
            ) : (
              <div className="text-center py-6">
                <p className="text-base text-zinc-400 mb-3">No AI profile generated yet.</p>
                <Link
                  href={`/repos/${owner}/${name}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold text-base"
                >
                  Analyse repository to generate
                </Link>
              </div>
            )}
          </div>

          {/* AI Impact Analysis */}
          <div className="sleek-panel p-6 border-t-2 border-t-[#ccff00]">
            <h2 className="text-xl uppercase tracking-wider font-bold mb-4 text-white">Impact Analysis</h2>
            <ImpactExplanation
              result={impactResult}
              breakdown={normalized.breakdown}
              total={normalized.total}
            />
          </div>
        </div>

        {/* Recent Events */}
        <div className="sleek-panel p-6 border-t-2 border-t-[#ff00ff]">
          <h2 className="text-xl uppercase tracking-wider font-bold mb-4 text-white">Recent Events</h2>
          {recentEvents.length === 0 ? (
            <p className="text-base text-zinc-400">No recent activity found.</p>
          ) : (
            <div className="space-y-3">
              {recentEvents.map((row) => {
                const createdAt = eventDate(row.created_at);
                const description = describeEvent(row.type, row.payload);
                const classification = row.id !== undefined ? classifications.get(row.id) : undefined;
                return (
                  <div key={row.id} className="flex items-start gap-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors -mx-2 px-2 rounded-lg">
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mt-1 w-24 shrink-0">
                      {formatRelativeDate(createdAt)}
                    </div>
                    <div className="flex-1">
                      <p className="text-base text-zinc-200 font-medium">{description}</p>
                      {classification && (
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border border-[#ff00ff]/30 text-[#ff00ff] bg-[#ff00ff]/10">
                            {classification.work_type}
                          </span>
                          <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                            {Math.round(classification.confidence * 100)}% conf
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
