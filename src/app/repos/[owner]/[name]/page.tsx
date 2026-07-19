import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Brain,
  CalendarDays,
  GitBranch,
  Layers3,
  Sparkles,
  Trophy,
  WandSparkles,
  Zap,
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

type ContributionCategory = {
  label: string;
  detail: string;
  value: number;
};

type ContributorInsight = {
  id: number;
  username: string;
  avatarUrl: string | null;
  score: number;
  impactScore: number;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  issues: number;
  releases: number;
  fixes: number;
  changedLines: number;
  lastActive: Date | null;
  role: string;
  summary: string[];
  categories: ContributionCategory[];
  highlights: string[];
  events: RawEvent[];
};

type Highlight = {
  date: Date;
  username: string;
  text: string;
};

type TimelineDay = {
  key: string;
  label: string;
  date: Date;
  items: string[];
};

const FEATURE_WORDS = ['add', 'added', 'build', 'built', 'implement', 'implemented', 'create', 'created', 'feature', 'dashboard', 'page', 'ui', 'api'];
const RELIABILITY_WORDS = ['fix', 'fixed', 'bug', 'error', 'edge', 'refactor', 'harden', 'improve', 'improved', 'auth', 'oauth', 'database', 'db'];

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

function dayKey(date: Date) {
  return date.toISOString().split('T')[0];
}

function formatRelativeDate(date: Date | null) {
  if (!date) return 'No activity yet';
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function formatTimelineLabel(date: Date) {
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'short', day: 'numeric' }).format(date);
}

function cleanTopic(text: string) {
  return text
    .replace(/^(feat|fix|chore|refactor|docs|style|test|perf)(\(.+\))?:\s*/i, '')
    .replace(/^merge pull request.+$/i, 'pull request work')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max = 78) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function titleFromPayload(type: string, payload: Record<string, unknown>) {
  if (type === 'push') {
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const firstCommit = commits.find(commit => typeof commit === 'object' && commit !== null && 'message' in commit);
    if (firstCommit && typeof firstCommit === 'object' && 'message' in firstCommit && typeof firstCommit.message === 'string') {
      return cleanTopic(firstCommit.message.split('\n')[0]);
    }
  }

  return cleanTopic(
    asString(payload.title) ||
    asString(payload.name) ||
    asString(payload.tag_name) ||
    asString(payload.body) ||
    'repository work'
  );
}

function containsAny(text: string, words: string[]) {
  const lower = text.toLowerCase();
  return words.some(word => lower.includes(word));
}

function eventCategory(type: string, payload: Record<string, unknown>) {
  const title = titleFromPayload(type, payload);
  if (type === 'review_submitted') return 'Code Review';
  if (type.startsWith('issue_')) return 'Planning';
  if (type === 'release') return 'Releases';
  if (containsAny(title, RELIABILITY_WORDS)) return 'Reliability';
  if (containsAny(title, FEATURE_WORDS) || type.startsWith('pr_') || type === 'push') return 'Feature Work';
  return 'Maintenance';
}

function isFix(type: string, payload: Record<string, unknown>) {
  const title = titleFromPayload(type, payload).toLowerCase();
  return type !== 'review_submitted' && ['fix', 'bug', 'error', 'edge case', 'broken', 'issue'].some(word => title.includes(word));
}

function describeEvent(type: string, payload: Record<string, unknown>) {
  const topic = truncate(titleFromPayload(type, payload));

  if (type === 'pr_merged') return `Completed ${topic}`;
  if (type === 'pr_opened') return `Proposed ${topic}`;
  if (type === 'review_submitted') {
    const state = asString(payload.state).replace('_', ' ') || 'submitted';
    const number = asNumber(payload.pr_number);
    return `Reviewed PR #${number}${state ? ` with ${state}` : ''}`;
  }
  if (type === 'push') return `Advanced ${topic}`;
  if (type === 'issue_opened') return `Defined ${topic}`;
  if (type === 'issue_closed') return `Resolved ${topic}`;
  if (type === 'release') return `Released ${topic}`;
  return `Contributed to ${topic}`;
}

function contributorRole(contributor: ContributorInsight) {
  const categories = [
    { label: 'Builder', value: contributor.commits + contributor.prsMerged * 3 + contributor.changedLines / 100 },
    { label: 'Reviewer', value: contributor.reviews * 2.5 },
    { label: 'Stabilizer', value: contributor.fixes * 3 + contributor.changedLines / 250 },
    { label: 'Planner', value: contributor.issues + contributor.prsOpened },
    { label: 'Release Driver', value: contributor.releases * 4 },
  ];
  return categories.sort((a, b) => b.value - a.value)[0]?.label ?? 'Contributor';
}

function buildContributionCategories(contributor: ContributorInsight, categoryCounts: Map<string, number>) {
  const categories = Array.from(categoryCounts.entries())
    .map(([label, value]) => ({
      label,
      value,
      detail: categoryDetail(label, contributor, value),
    }))
    .sort((a, b) => b.value - a.value);

  return categories.slice(0, 3);
}

function categoryDetail(label: string, contributor: ContributorInsight, value: number) {
  if (label === 'Code Review') return `${pluralize(contributor.reviews, 'review')} that helped unblock teammates`;
  if (label === 'Reliability') return `${pluralize(contributor.fixes, 'fix')} or hardening change detected`;
  if (label === 'Feature Work') return `${pluralize(contributor.prsMerged + contributor.prsOpened + contributor.commits, 'shipping signal')} captured`;
  if (label === 'Planning') return `${pluralize(value, 'planning touchpoint')} through issues or PR setup`;
  if (label === 'Releases') return `${pluralize(contributor.releases, 'release')} published`;
  return `${pluralize(value, 'contribution')} in this lane`;
}

function contributorSummary(contributor: ContributorInsight) {
  const bullets: string[] = [];
  const topHighlights = contributor.highlights.slice(0, 3).map(highlight => highlight.replace(/^(Completed|Proposed|Advanced|Defined|Resolved|Released)\s+/i, ''));
  const uniqueTopics = Array.from(new Set(topHighlights)).filter(Boolean);

  if (uniqueTopics[0]) bullets.push(`${contributor.prsMerged ? 'Shipped' : 'Worked on'} ${uniqueTopics[0]}`);
  if (uniqueTopics[1]) bullets.push(`Contributed to ${uniqueTopics[1]}`);
  if (contributor.reviews) bullets.push(`Reviewed ${pluralize(contributor.reviews, 'pull request')}`);
  if (contributor.fixes) bullets.push(`Fixed ${pluralize(contributor.fixes, 'stability issue')}`);
  if (contributor.changedLines) bullets.push(`Moved ${contributor.changedLines} lines of product/code change`);
  if (!bullets.length && contributor.commits) bullets.push(`Kept the repository moving with ${pluralize(contributor.commits, 'code update')}`);

  return bullets.slice(0, 5);
}

function buildTimeline(rows: RepoEventRow[]): TimelineDay[] {
  const days = new Map<string, { date: Date; items: string[]; merged: number; reviews: number; fixes: number }>();

  for (const row of rows) {
    const date = eventDate(row.created_at);
    const key = dayKey(date);
    const payload = asPayload(row.payload);
    const day = days.get(key) ?? { date, items: [], merged: 0, reviews: 0, fixes: 0 };

    if (row.type === 'pr_merged') day.merged += 1;
    if (row.type === 'review_submitted') day.reviews += 1;
    if (isFix(row.type, payload)) day.fixes += 1;

    const item = describeEvent(row.type, payload);
    if (!day.items.includes(item) && day.items.length < 4) day.items.push(item);
    days.set(key, day);
  }

  return Array.from(days.entries())
    .map(([key, day]) => {
      const rollups = [];
      if (day.merged > 1) rollups.push(`${day.merged} PRs merged`);
      if (day.reviews > 1) rollups.push(`${day.reviews} reviews`);
      if (day.fixes > 1) rollups.push(`${day.fixes} fixes landed`);
      return {
        key,
        date: day.date,
        label: formatTimelineLabel(day.date),
        items: [...day.items, ...rollups].slice(0, 6),
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 7);
}

function buildContributorInsights(rows: RepoEventRow[]) {
  const contributors = new Map<number, ContributorInsight>();
  const categoryCountsByContributor = new Map<number, Map<string, number>>();
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
      impactScore: 0,
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      reviews: 0,
      issues: 0,
      releases: 0,
      fixes: 0,
      changedLines: 0,
      lastActive: null,
      role: 'Contributor',
      summary: [],
      categories: [],
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
    if (isFix(row.type, payload)) contributor.fixes += 1;

    const category = eventCategory(row.type, payload);
    const categoryCounts = categoryCountsByContributor.get(row.contributor_id) ?? new Map<string, number>();
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    categoryCountsByContributor.set(row.contributor_id, categoryCounts);

    if (!contributor.lastActive || createdAt > contributor.lastActive) contributor.lastActive = createdAt;
    contributor.events.push({ type: row.type, payload, created_at: createdAt.toISOString() });

    const highlight = describeEvent(row.type, payload);
    contributor.highlights.push(highlight);
    highlights.push({ date: createdAt, username: row.username, text: highlight });

    contributors.set(row.contributor_id, contributor);
  }

  const scored = Array.from(contributors.values()).map(contributor => ({
    ...contributor,
    score: computeContributionScore(contributor.events).total,
  }));
  const topScore = Math.max(...scored.map(contributor => contributor.score), 1);

  const ranked = scored.map(contributor => {
    const nextContributor = {
      ...contributor,
      impactScore: Math.max(1, Math.round((contributor.score / topScore) * 100)),
    };
    return {
      ...nextContributor,
      role: contributorRole(nextContributor),
      summary: contributorSummary(nextContributor),
      categories: buildContributionCategories(nextContributor, categoryCountsByContributor.get(contributor.id) ?? new Map()),
      highlights: contributor.highlights.slice(0, 3),
    };
  }).sort((a, b) => b.impactScore - a.impactScore);

  return {
    contributors: ranked,
    highlights: highlights.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8),
    timeline: buildTimeline(rows),
  };
}

function topBy(contributors: ContributorInsight[], getValue: (contributor: ContributorInsight) => number) {
  return contributors.filter(contributor => getValue(contributor) > 0).sort((a, b) => getValue(b) - getValue(a))[0];
}

function ContributorAvatar({ src, username, size = 40 }: { src: string | null; username: string; size?: number }) {
  if (!src) return <div className="rounded-full bg-white/10 border border-white/10" style={{ width: size, height: size }} />;
  return <Image src={src} alt={`${username} avatar`} className="rounded-full border border-white/10" width={size} height={size} />;
}

function ImpactScore({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px]">
        <div className="h-full w-full rounded-full bg-zinc-950 flex items-center justify-center font-black text-xl">{score}</div>
      </div>
      <div>
        <div className="text-sm font-semibold text-white">AI Impact Score</div>
        <div className="text-xs text-zinc-500">Weighted by shipping, review, fixes, and collaboration</div>
      </div>
    </div>
  );
}

export default async function RepoAnalysisBoard(
  props: { params: Promise<{ owner: string; name: string }> }
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { owner, name } = params;

  const repoQuery = await sql`
    SELECT r.id, r.github_repo_id, r.default_branch, i.github_installation_id
    FROM repositories r
    JOIN installations i ON r.installation_id = i.id
    WHERE r.owner = ${owner} AND r.name = ${name} AND i.linked_user_id = ${session.user.id}
  `;

  if (repoQuery.length === 0) return <div>Repository not found or access denied.</div>;

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

  const { contributors, highlights, timeline } = buildContributorInsights(eventsQuery);
  const topContributor = contributors[0];
  const topReviewer = topBy(contributors, contributor => contributor.reviews);
  const topFixer = topBy(contributors, contributor => contributor.fixes);

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
              Spotify Wrapped meets Strava for engineering teams: who contributed what, where they helped, and what actually moved.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 w-fit">
            Default branch: <span className="font-semibold text-white">{repoQuery[0].default_branch ?? 'main'}</span>
          </div>
        </div>

        {contributors.length === 0 ? (
          <div className="glass-card p-10 text-center max-w-3xl mx-auto mt-20">
            <Sparkles className="w-10 h-10 text-indigo-300 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-3">No contribution story yet</h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              The app is installed, but GitRanked needs GitHub activity before it can build summaries, categories, highlights, and an impact timeline.
            </p>
            <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold">
              Back to repositories <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-6 mb-10">
              <div className="glass-card p-8 overflow-hidden relative">
                <div className="absolute right-0 top-0 h-48 w-48 bg-indigo-500/20 blur-3xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 text-purple-300 mb-4">
                    <Brain className="w-5 h-5" />
                    <span className="text-sm font-semibold uppercase tracking-wide">AI Contribution Summary</span>
                  </div>
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-4">
                      <ContributorAvatar src={topContributor.avatarUrl} username={topContributor.username} size={64} />
                      <div>
                        <h2 className="text-3xl font-black mb-1">{topContributor.username}</h2>
                        <p className="text-zinc-400 mb-4">{topContributor.role} · most visible impact in this repo window</p>
                        <ul className="space-y-2 text-zinc-200">
                          {topContributor.summary.map(item => (
                            <li key={item} className="flex gap-2">
                              <WandSparkles className="w-4 h-4 text-indigo-300 mt-1 shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <ImpactScore score={topContributor.impactScore} />
                  </div>
                </div>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center gap-2 text-pink-300 mb-5">
                  <Trophy className="w-5 h-5" />
                  <h2 className="text-xl font-bold text-white">Team standouts</h2>
                </div>
                <div className="space-y-4">
                  <Standout label="Highest impact" contributor={topContributor} detail={topContributor.role} />
                  {topReviewer && <Standout label="Review anchor" contributor={topReviewer} detail="Helped unblock teammates" />}
                  {topFixer && <Standout label="Stability work" contributor={topFixer} detail="Most fixes / hardening signals" />}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.6fr] gap-6 mb-10">
              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Layers3 className="w-5 h-5 text-indigo-300" />
                  <div>
                    <h2 className="text-xl font-bold">Contribution categories</h2>
                    <p className="text-sm text-zinc-400">Not just volume — each teammate&apos;s contribution lane.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {contributors.map(contributor => (
                    <Link href={`/repos/${owner}/${name}/${contributor.username}`} key={contributor.id} className="rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors p-5">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <ContributorAvatar src={contributor.avatarUrl} username={contributor.username} size={44} />
                          <div className="min-w-0">
                            <h3 className="font-bold truncate">{contributor.username}</h3>
                            <p className="text-xs text-zinc-500">{contributor.role} · {formatRelativeDate(contributor.lastActive)}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-2xl font-black text-white">{contributor.impactScore}</div>
                          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Impact</div>
                        </div>
                      </div>

                      <ul className="space-y-2 mb-4">
                        {contributor.summary.slice(0, 3).map(item => (
                          <li key={item} className="text-sm text-zinc-300 flex gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-purple-300 mt-1 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-wrap gap-2">
                        {contributor.categories.map(category => (
                          <span key={category.label} className="rounded-full bg-black/25 border border-white/10 px-3 py-1 text-xs text-zinc-300" title={category.detail}>
                            {category.label}
                          </span>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Zap className="w-5 h-5 text-yellow-300" />
                  <div>
                    <h2 className="text-xl font-bold">Highlights</h2>
                    <p className="text-sm text-zinc-400">Specific work worth mentioning.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  {highlights.map((highlight, index) => (
                    <div key={`${highlight.username}-${highlight.date.toISOString()}-${index}`} className="border-l border-yellow-500/30 pl-4 py-1">
                      <div className="text-sm font-semibold text-white">{highlight.username}</div>
                      <p className="text-sm text-zinc-300 leading-relaxed">{highlight.text}</p>
                      <div className="text-xs text-zinc-500 mt-1">{formatRelativeDate(highlight.date)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="glass-card p-6 mb-10">
              <div className="flex items-center gap-2 mb-8">
                <CalendarDays className="w-5 h-5 text-pink-300" />
                <div>
                  <h2 className="text-xl font-bold">Repository activity timeline</h2>
                  <p className="text-sm text-zinc-400">Grouped as actual work moments, not commit spam.</p>
                </div>
              </div>

              <div className="space-y-7">
                {timeline.map(day => (
                  <div key={day.key} className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4">
                    <div>
                      <div className="font-bold text-white">{day.label}</div>
                      <div className="text-xs text-zinc-500">──────</div>
                    </div>
                    <div className="space-y-2">
                      {day.items.map(item => (
                        <div key={item} className="rounded-xl bg-white/5 border border-white/5 px-4 py-3 text-sm text-zinc-200">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Standout({ label, contributor, detail }: { label: string; contributor: ContributorInsight; detail: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{label}</div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ContributorAvatar src={contributor.avatarUrl} username={contributor.username} size={36} />
          <div className="min-w-0">
            <div className="font-bold truncate">{contributor.username}</div>
            <div className="text-xs text-zinc-500 truncate">{detail}</div>
          </div>
        </div>
        <div className="text-lg font-black">{contributor.impactScore}</div>
      </div>
    </div>
  );
}
