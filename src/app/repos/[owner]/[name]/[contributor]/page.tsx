import { auth } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { sql } from '@/lib/db';
import { redirect } from 'next/navigation';
import { computeContributionScore, type ClassificationMap, type RawEvent } from '@/lib/scoring';
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
};

export default async function ContributorDetail(
  props: { params: Promise<{ owner: string; name: string; contributor: string }> }
) {
  const params = await props.params;
  const { owner, name, contributor } = params;

  const session = await auth();
  if (!session?.user?.id) redirect('/');

  // Verify repo access
  const repoQuery = await sql`
    SELECT r.id
    FROM repositories r
    JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
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

  // Fetch events for this contributor
  const eventRows = (await sql`
    SELECT e.id, e.event_type, e.payload, e.created_at, e.classification
    FROM github_events e
    WHERE e.repo_id = ${repoId} AND e.contributor_id = ${contributorId}
    ORDER BY e.created_at DESC
    LIMIT 50
  `) as EventRow[];

  // Build classifications map
  const classifications: ClassificationMap = new Map();
  for (const row of eventRows) {
    if (row.classification && typeof row.classification === 'object') {
      classifications.set(row.id, row.classification as ClassificationItem);
    }
  }

  // Compute score
  const rawEvents: RawEvent[] = eventRows.map(r => ({
    id: r.id,
    type: r.event_type,
    payload: asPayload(r.payload),
    created_at: eventDate(r.created_at).toISOString(),
  }));
  const score = computeContributionScore(rawEvents, { classifications });

  // Fetch AI results (cache only)
  const dateTo = new Date().toISOString().split('T')[0];
  // eslint-disable-next-line react-hooks/purity
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
      
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 mt-8">
        <Link href={`/repos/${owner}/${name}`} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-8 w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Repo
        </Link>

        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            {avatarUrl && (
              <Image
                src={avatarUrl}
                className="rounded-full border border-white/10"
                alt={contributor}
                width={64}
                height={64}
              />
            )}
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
                {contributor}
              </h1>
              <p className="text-zinc-400">Deep dive into impact and code velocity.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          {/* AI Contributor Profile */}
          <div className="glass-card p-6">
            <h2 className="text-xl font-bold mb-4">AI Contributor Profile</h2>
            {profileResult ? (
              <ContributorProfileCard result={profileResult} />
            ) : (
              <div className="text-center py-8">
                <p className="text-zinc-400 mb-4">No AI profile generated yet.</p>
                <Link
                  href={`/repos/${owner}/${name}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold text-sm"
                >
                  Analyse repository to generate
                </Link>
              </div>
            )}
          </div>

          {/* AI Impact Analysis */}
          <div className="glass-card p-6">
            <h2 className="text-xl font-bold mb-4">Impact Analysis</h2>
            <ImpactExplanation
              result={impactResult}
              breakdown={score.breakdown}
              total={score.total}
            />
          </div>
        </div>

        {/* Recent Events */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold mb-4">Recent Events</h2>
          {eventRows.length === 0 ? (
            <p className="text-zinc-400">No recent activity found.</p>
          ) : (
            <div className="space-y-3">
              {eventRows.map((row) => {
                const payload = asPayload(row.payload);
                const createdAt = eventDate(row.created_at);
                const description = describeEvent(row.event_type, payload);
                const classification = row.classification as ClassificationItem | undefined;
                return (
                  <div key={row.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                    <div className="text-xs text-zinc-500 mt-1 w-24 shrink-0">
                      {formatRelativeDate(createdAt)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-zinc-300">{description}</p>
                      {classification && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                            {classification.work_type}
                          </span>
                          <span className="text-xs text-zinc-600">
                            {Math.round(classification.confidence * 100)}% confidence
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
