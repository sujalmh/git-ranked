import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Award,
  Code2,
  GitBranch,
  GitCommit,
  GitPullRequest,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { computeContributionScore, RawEvent } from '@/lib/scoring';
import { backfillRepoActivity } from '@/lib/github-backfill';

type RepoEventRow = {
  type: string;
  payload: Record<string, unknown> | string | null;
  created_at: Date | string;
  contributor_id: number;
  username: string;
  avatar_url: string | null;
};

type ContributorInsight = {
  id: number;
  username: string;
  avatarUrl: string | null;
  score: number;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  issues: number;
  releases: number;
  changedLines: number;
  lastActive: Date | null;
  role: string;
  summary: string;
  highlights: string[];
  events: RawEvent[];
};

type Highlight = {
  date: Date;
  username: string;
  text: string;
};

function asPayload(payload: RepoEventRow['payload']): Record<string, unknown> {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return payload;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function eventDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function formatRelativeDate(date: Date | null) {
  if (!date) return 'No activity yet';
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function describeEvent(type: string, payload: Record<string, unknown>) {
  if (type === 'pr_merged') {
    const title = asString(payload.title) || 'Untitled PR';
    const number = asNumber(payload.pr_number);
    const changed = asNumber(payload.additions) + asNumber(payload.deletions);
    return `Merged PR #${number}: ${title}${changed ? ` (${changed} changed lines)` : ''}`;
  }

  if (type === 'pr_opened') {
    const title = asString(payload.title) || 'Untitled PR';
    const number = asNumber(payload.pr_number);
    return `Opened PR #${number}: ${title}`;
  }

  if (type === 'review_submitted') {
    const state = asString(payload.state).replace('_', ' ') || 'submitted';
    const number = asNumber(payload.pr_number);
    const words = asNumber(payload.word_count);
    return `Reviewed PR #${number} with ${state}${words ? ` (${words} words)` : ''}`;
  }

  if (type === 'push') {
    const count = asNumber(payload.commit_count);
    const branch = asString(payload.branch).replace('refs/heads/', '');
    return `Pushed ${pluralize(count, 'commit')} ${branch ? `to ${branch}` : ''}`.trim();
  }

  if (type === 'issue_opened') {
    return `Opened issue #${asNumber(payload.issue_number)}: ${asString(payload.title) || 'Untitled issue'}`;
  }

  if (type === 'issue_closed') {
    return `Closed issue #${asNumber(payload.issue_number)}: ${asString(payload.title) || 'Untitled issue'}`;
  }

  if (type === 'release') {
    return `Published release ${asString(payload.tag_name) || asString(payload.name) || ''}`.trim();
  }

  return 'Contributed activity';
}

function contributorRole(contributor: ContributorInsight) {
  const categories = [
    { label: 'Shipping code', value: contributor.commits + contributor.prsMerged * 3 + contributor.changedLines / 100 },
    { label: 'Reviewing work', value: contributor.reviews * 2 },
    { label: 'Planning work', value: contributor.issues + contributor.prsOpened },
    { label: 'Releasing', value: contributor.releases * 4 },
  ];
  return categories.sort((a, b) => b.value - a.value)[0]?.label ?? 'Contributor';
}

function contributorSummary(contributor: ContributorInsight) {
  const parts = [];
  if (contributor.prsMerged) parts.push(`${pluralize(contributor.prsMerged, 'merged PR')}`);
  if (contributor.commits) parts.push(`${pluralize(contributor.commits, 'commit')}`);
  if (contributor.reviews) parts.push(`${pluralize(contributor.reviews, 'review')}`);
  if (contributor.changedLines) parts.push(`${contributor.changedLines} changed lines`);
  return parts.length ? parts.join(' · ') : 'Activity captured, but no detailed payload yet';
}

function buildContributorInsights(rows: RepoEventRow[]) {
  const contributors = new Map<number, ContributorInsight>();
  const highlights: Highlight[] = [];

  for (const row of rows) {
    const payload = asPayload(row.payload);
    const createdAt = eventDate(row.created_at);
    const existing = contributors.get(row.contributor_id);
    const contributor = existing ?? {
      id: row.contributor_id,
      username: row.username,
      avatarUrl: row.avatar_url,
      score: 0,
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      reviews: 0,
      issues: 0,
      releases: 0,
      changedLines: 0,
      lastActive: null,
      role: 'Contributor',
      summary: '',
      highlights: [],
      events: [],
    };

    if (row.type === 'push') contributor.commits += asNumber(payload.commit_count);
    if (row.type === 'pr_opened') contributor.prsOpened += 1;
    if (row.type === 'pr_merged') {
      contributor.prsMerged += 1;
      contributor.changedLines += asNumber(payload.additions) + asNumber(payload.deletions);
    }
    if (row.type === 'review_submitted') contributor.reviews += 1;
    if (row.type.startsWith('issue_')) contributor.issues += 1;
    if (row.type === 'release') contributor.releases += 1;

    if (!contributor.lastActive || createdAt > contributor.lastActive) contributor.lastActive = createdAt;
    contributor.events.push({
      type: row.type,
      payload,
      created_at: createdAt.toISOString(),
    });

    const highlight = describeEvent(row.type, payload);
    if (highlight) {
      contributor.highlights.push(highlight);
      highlights.push({ date: createdAt, username: row.username, text: highlight });
    }

    contributors.set(row.contributor_id, contributor);
  }

  const ranked = Array.from(contributors.values()).map(contributor => {
    const score = computeContributionScore(contributor.events).total;
    const nextContributor = { ...contributor, score };
    return {
      ...nextContributor,
      role: contributorRole(nextContributor),
      summary: contributorSummary(nextContributor),
      highlights: contributor.highlights.slice(0, 3),
    };
  }).sort((a, b) => b.score - a.score);

  return {
    contributors: ranked,
    highlights: highlights.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8),
  };
}

function topBy(contributors: ContributorInsight[], getValue: (contributor: ContributorInsight) => number) {
  return contributors.filter(contributor => getValue(contributor) > 0).sort((a, b) => getValue(b) - getValue(a))[0];
}

function StatCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card p-6 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-indigo-300">
        {icon}
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-sm text-zinc-400 leading-relaxed">{detail}</p>
    </div>
  );
}

function ContributorAvatar({ src, username, size = 40 }: { src: string | null; username: string; size?: number }) {
  if (!src) return <div className="rounded-full bg-white/10 border border-white/10" style={{ width: size, height: size }} />;
  return <Image src={src} alt={`${username} avatar`} className="rounded-full border border-white/10" width={size} height={size} />;
}

export default async function RepoAnalysisBoard(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const { owner, name } = params;

  const repoQuery = await sql`
    SELECT r.id, r.github_repo_id, r.default_branch, i.github_installation_id
    FROM repositories r
    JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
  `;

  if (repoQuery.length === 0) {
    return <div>Repository not found or access denied.</div>;
  }

  const repoId = repoQuery[0].id;
  let eventsQuery = (await sql`
    SELECT e.event_type as type, e.payload, e.created_at, c.id as contributor_id, c.username, c.avatar_url
    FROM github_events e
    JOIN github_contributors c ON e.contributor_id = c.id
    WHERE e.repo_id = ${repoId}
    ORDER BY e.created_at DESC
  `) as RepoEventRow[];

  if (eventsQuery.length === 0) {
    await backfillRepoActivity({
      id: repoQuery[0].id,
      github_installation_id: repoQuery[0].github_installation_id,
      owner,
      name,
    });

    eventsQuery = (await sql`
      SELECT e.event_type as type, e.payload, e.created_at, c.id as contributor_id, c.username, c.avatar_url
      FROM github_events e
      JOIN github_contributors c ON e.contributor_id = c.id
      WHERE e.repo_id = ${repoId}
      ORDER BY e.created_at DESC
    `) as RepoEventRow[];
  }

  const { contributors, highlights } = buildContributorInsights(eventsQuery);
  const topContributor = contributors[0];
  const topReviewer = topBy(contributors, contributor => contributor.reviews);
  const topShipper = topBy(contributors, contributor => contributor.prsMerged * 3 + contributor.commits);
  const totalCommits = contributors.reduce((sum, contributor) => sum + contributor.commits, 0);
  const totalReviews = contributors.reduce((sum, contributor) => sum + contributor.reviews, 0);
  const totalMergedPrs = contributors.reduce((sum, contributor) => sum + contributor.prsMerged, 0);

  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar />
      
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 mt-8">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3 text-sm text-zinc-400 mb-3">
              <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
              <span>/</span>
              <span>{owner}</span>
            </div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
              <GitBranch className="w-8 h-8 text-indigo-400" />
              {owner} / {name}
            </h1>
            <p className="text-zinc-400 max-w-2xl">
              Compare contributors by shipped work, reviews, planning activity, and concrete highlights from GitHub events.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 w-fit">
            Default branch: <span className="font-semibold text-white">{repoQuery[0].default_branch ?? 'main'}</span>
          </div>
        </div>

        {contributors.length === 0 ? (
          <div className="glass-card p-10 text-center max-w-3xl mx-auto mt-20">
            <Sparkles className="w-10 h-10 text-indigo-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-3">No contributor activity captured yet</h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              The app is installed for this repo, but the analysis board needs GitHub activity events before it can compare contributors. Push commits, open or merge PRs, submit reviews, or redeliver recent GitHub webhooks to populate real highlights.
            </p>
            <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold">
              Back to repositories <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <StatCard
                title="Most impact"
                value={topContributor?.username ?? '—'}
                detail={topContributor ? `${topContributor.score} impact points · ${topContributor.summary}` : 'No contributor activity yet'}
                icon={<Award className="w-5 h-5" />}
              />
              <StatCard
                title="Shipping lead"
                value={topShipper?.username ?? '—'}
                detail={topShipper ? `${pluralize(topShipper.commits, 'commit')} · ${pluralize(topShipper.prsMerged, 'merged PR')}` : `${totalCommits} commits and ${totalMergedPrs} merged PRs captured`}
                icon={<Code2 className="w-5 h-5" />}
              />
              <StatCard
                title="Review anchor"
                value={topReviewer?.username ?? '—'}
                detail={topReviewer ? `${pluralize(topReviewer.reviews, 'review')} submitted` : `${totalReviews} reviews captured so far`}
                icon={<MessageSquareText className="w-5 h-5" />}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6 mb-10">
              <section className="glass-card p-6">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold">Contributor comparison</h2>
                    <p className="text-sm text-zinc-400">Ranked by quality-weighted contribution score, not raw event count.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {contributors.map((contributor, index) => (
                    <Link
                      href={`/repos/${owner}/${name}/${contributor.username}`}
                      key={contributor.id}
                      className="rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 p-5 group"
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4 min-w-0">
                          <div className="text-zinc-500 font-mono text-sm pt-3 w-7">#{index + 1}</div>
                          <ContributorAvatar src={contributor.avatarUrl} username={contributor.username} size={48} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h3 className="text-lg font-bold truncate">{contributor.username}</h3>
                              <span className="text-xs rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-1">
                                {contributor.role}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-400 leading-relaxed">{contributor.summary}</p>
                            {contributor.highlights[0] && (
                              <p className="text-sm text-zinc-300 mt-2 line-clamp-1">Latest: {contributor.highlights[0]}</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 lg:min-w-[520px]">
                          <Metric label="Score" value={contributor.score.toString()} />
                          <Metric label="Commits" value={contributor.commits.toString()} />
                          <Metric label="Merged" value={contributor.prsMerged.toString()} />
                          <Metric label="Reviews" value={contributor.reviews.toString()} />
                          <Metric label="Issues" value={contributor.issues.toString()} />
                          <Metric label="Last" value={formatRelativeDate(contributor.lastActive)} compact />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>

              <section className="glass-card p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-5 h-5 text-purple-300" />
                  <div>
                    <h2 className="text-xl font-bold">Recent highlights</h2>
                    <p className="text-sm text-zinc-400">Concrete work items worth scanning.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {highlights.map((highlight, index) => (
                    <div key={`${highlight.username}-${highlight.date.toISOString()}-${index}`} className="border-l border-indigo-500/30 pl-4 py-1">
                      <div className="text-sm font-semibold text-white">{highlight.username}</div>
                      <p className="text-sm text-zinc-300 leading-relaxed">{highlight.text}</p>
                      <div className="text-xs text-zinc-500 mt-1">{formatRelativeDate(highlight.date)}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <BreakdownCard title="Code shipped" value={`${totalCommits} commits`} detail={`${totalMergedPrs} merged PRs across ${contributors.length} contributors`} icon={<GitCommit className="w-5 h-5" />} />
              <BreakdownCard title="Review coverage" value={`${totalReviews} reviews`} detail="Useful for spotting people who unblock others, not just authors." icon={<MessageSquareText className="w-5 h-5" />} />
              <BreakdownCard title="Open collaboration" value={`${contributors.reduce((sum, contributor) => sum + contributor.prsOpened, 0)} PRs opened`} detail="Shows who is creating reviewable work for the team." icon={<GitPullRequest className="w-5 h-5" />} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-xl bg-black/20 border border-white/5 px-3 py-2 text-center">
      <div className={`${compact ? 'text-sm' : 'text-base'} font-bold text-white truncate`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}

function BreakdownCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 text-pink-300 mb-3">
        {icon}
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <div className="text-2xl font-bold mb-2">{value}</div>
      <p className="text-sm text-zinc-400 leading-relaxed">{detail}</p>
    </div>
  );
}
