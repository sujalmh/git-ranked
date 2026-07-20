import type { ClassificationItem } from './ai/types';
import { workAreasForEvent } from './contributor-insights';

export type EventRow = {
  id: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date | string;
  contributor_id: number;
  username: string;
  classification?: unknown;
};

export type ContributorStats = {
  contributorId: number;
  username: string;
  avatarUrl: string | null;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  issues: number;
  releases: number;
  fixes: number;
  changedLines: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  firstSeen: Date;
  lastSeen: Date;
  reviewWordsTotal: number;
  approvalsGiven: number;
  changesRequested: number;
  prsReceivedReviews: number;
  collaborationScore: number;
  workDistribution: Record<string, number>;
  velocity: number[];
  velocityLabels: string[];
  reviewedBy: Array<{ reviewerId: number; reviewer: string; count: number }>;
  reviewedByCount: number;
  reviewedOthers: Array<{ authorId: number; author: string; count: number }>;
  reviewedOthersCount: number;
  collaborators: string[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function eventDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function dateKey(d: Date) {
  return d.toISOString().split('T')[0];
}

function weekKey(d: Date) {
  const monday = new Date(d);
  const day = monday.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday.toISOString().split('T')[0];
}

function computeStreaks(dates: Date[]): { currentStreak: number; longestStreak: number; activeDays: number } {
  if (dates.length === 0) return { currentStreak: 0, longestStreak: 0, activeDays: 0 };

  const sorted = Array.from(new Set(dates.map(dateKey))).sort();
  const activeDays = sorted.length;

  let longestStreak = 1;
  let currentRun = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00Z');
    const curr = new Date(sorted[i] + 'T00:00:00Z');
    const diff = Math.round((curr.getTime() - prev.getTime()) / MS_PER_DAY);
    if (diff === 1) {
      currentRun++;
      longestStreak = Math.max(longestStreak, currentRun);
    } else {
      currentRun = 1;
    }
  }

  const today = new Date();
  const todayKey = dateKey(today);
  const lastActive = sorted[sorted.length - 1];
  const lastDate = new Date(lastActive + 'T00:00:00Z');
  const daysSinceLast = Math.round((today.getTime() - lastDate.getTime()) / MS_PER_DAY);

  let currentStreak = 0;
  if (daysSinceLast <= 1) {
    currentStreak = currentRun;
    if (daysSinceLast === 1 && sorted[sorted.length - 1] !== todayKey) {
      currentStreak = currentRun;
    }
  }

  return { currentStreak, longestStreak, activeDays };
}

function computeVelocity(events: Array<{ type: string; createdAt: Date }>, weeks = 8): { values: number[]; labels: string[] } {
  const now = new Date();
  const buckets: Array<{ label: string; start: Date; end: Date; count: number }> = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * MS_PER_DAY);
    const start = new Date(end.getTime() - 7 * MS_PER_DAY);
    buckets.push({ label: weekKey(end), start, end, count: 0 });
  }

  for (const e of events) {
    for (const b of buckets) {
      if (e.createdAt >= b.start && e.createdAt < b.end) {
        b.count++;
        break;
      }
    }
  }

  return {
    values: buckets.map((b) => b.count),
    labels: buckets.map((b) => {
      const d = new Date(b.start);
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    }),
  };
}

function parseClassification(raw: unknown): ClassificationItem | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as ClassificationItem;
}

function getWorkType(type: string, payload: Record<string, unknown>, classification?: ClassificationItem): string {
  if (classification?.work_type) return classification.work_type;
  if (type === 'review_submitted') return 'Code Review';
  if (type.startsWith('issue_')) return 'Planning';
  if (type === 'release') return 'Release';
  const title = (asString(payload.title) || asString(payload.message)).toLowerCase();
  if (['fix', 'bug', 'error'].some((w) => title.includes(w))) return 'Bug Fix';
  if (['refactor', 'cleanup'].some((w) => title.includes(w))) return 'Refactor';
  if (['test', 'spec'].some((w) => title.includes(w))) return 'Testing';
  if (['doc', 'readme'].some((w) => title.includes(w))) return 'Documentation';
  if (['perf', 'optim', 'speed'].some((w) => title.includes(w))) return 'Performance';
  if (type === 'pr_merged' || type === 'pr_opened' || type === 'push') return 'Feature';
  return 'Other';
}

export function computeCollaborationAnalytics(events: EventRow[]): {
  contributors: ContributorStats[];
  reviewGraph: ReviewGraphEdge[];
  totalEvents: number;
  totalReviews: number;
  totalPRs: number;
} {
  const byContributor = new Map<number, ContributorStats & { _dates: Date[]; _events: Array<{ type: string; createdAt: Date }> }>();

  const prAuthorByNumber = new Map<string, { id: number; username: string }>();
  for (const e of events) {
    if (e.event_type === 'pr_opened' || e.event_type === 'pr_merged') {
      const prNumber = String(asNumber(e.payload.pr_number));
      if (prNumber && !prAuthorByNumber.has(prNumber)) {
        prAuthorByNumber.set(prNumber, { id: e.contributor_id, username: e.username });
      }
    }
  }

  const reviewEdges = new Map<string, ReviewGraphEdge>();

  for (const e of events) {
    const existing = byContributor.get(e.contributor_id);
    const stats = existing ?? {
      contributorId: e.contributor_id,
      username: e.username,
      avatarUrl: null,
      commits: 0,
      prsOpened: 0,
      prsMerged: 0,
      reviews: 0,
      issues: 0,
      releases: 0,
      fixes: 0,
      changedLines: 0,
      activeDays: 0,
      currentStreak: 0,
      longestStreak: 0,
      firstSeen: eventDate(e.created_at),
      lastSeen: eventDate(e.created_at),
      reviewWordsTotal: 0,
      approvalsGiven: 0,
      changesRequested: 0,
      prsReceivedReviews: 0,
      collaborationScore: 0,
      workDistribution: {},
      velocity: [],
      velocityLabels: [],
      reviewedBy: [],
      reviewedByCount: 0,
      reviewedOthers: [],
      reviewedOthersCount: 0,
      collaborators: [],
      _dates: [],
      _events: [],
    };

    const createdAt = eventDate(e.created_at);
    const payload = e.payload || {};
    const classification = parseClassification(e.classification);

    stats._dates.push(createdAt);
    stats._events.push({ type: e.event_type, createdAt });

    if (createdAt < stats.firstSeen) stats.firstSeen = createdAt;
    if (createdAt > stats.lastSeen) stats.lastSeen = createdAt;

    if (e.event_type === 'push') stats.commits += asNumber(payload.commit_count) || 1;
    if (e.event_type === 'pr_opened') stats.prsOpened += 1;
    if (e.event_type === 'pr_merged') {
      stats.prsMerged += 1;
      stats.changedLines += asNumber(payload.additions) + asNumber(payload.deletions);
    }
    if (e.event_type === 'review_submitted') {
      stats.reviews += 1;
      stats.reviewWordsTotal += asNumber(payload.word_count);
      const state = asString(payload.state).toLowerCase();
      if (state === 'approved') stats.approvalsGiven += 1;
      if (state === 'changes_requested') stats.changesRequested += 1;

      const prNumber = String(asNumber(payload.pr_number));
      const author = prAuthorByNumber.get(prNumber);
      if (author && author.id !== e.contributor_id) {
        const edgeKey = `${e.contributor_id}->${author.id}`;
        const edge = reviewEdges.get(edgeKey) ?? {
          reviewerId: e.contributor_id,
          reviewer: e.username,
          authorId: author.id,
          author: author.username,
          count: 0,
        };
        edge.count++;
        reviewEdges.set(edgeKey, edge);
      }
    }
    if (e.event_type.startsWith('issue_')) stats.issues += 1;
    if (e.event_type === 'release') stats.releases += 1;

    const workType = getWorkType(e.event_type, payload, classification);
    if (workType === 'Bug Fix') stats.fixes += 1;
    const areas = workAreasForEvent(e.event_type, payload, classification);
    for (const area of areas) {
      stats.workDistribution[area] = (stats.workDistribution[area] ?? 0) + 1;
    }

    byContributor.set(e.contributor_id, stats);
  }

  const prsByAuthor = new Map<number, Set<string>>();
  for (const e of events) {
    if (e.event_type === 'pr_opened' || e.event_type === 'pr_merged') {
      const prNumber = String(asNumber(e.payload.pr_number));
      if (prNumber) {
        if (!prsByAuthor.has(e.contributor_id)) prsByAuthor.set(e.contributor_id, new Set());
        prsByAuthor.get(e.contributor_id)!.add(prNumber);
      }
    }
  }

  const reviewGraph = Array.from(reviewEdges.values()).sort((a, b) => b.count - a.count);

  const reviewByAuthor = new Map<number, Array<{ reviewerId: number; reviewer: string; count: number }>>();
  const reviewedByMap = new Map<number, Array<{ authorId: number; author: string; count: number }>>();

  for (const edge of reviewGraph) {
    if (!reviewByAuthor.has(edge.authorId)) reviewByAuthor.set(edge.authorId, []);
    reviewByAuthor.get(edge.authorId)!.push({ reviewerId: edge.reviewerId, reviewer: edge.reviewer, count: edge.count });

    if (!reviewedByMap.has(edge.reviewerId)) reviewedByMap.set(edge.reviewerId, []);
    reviewedByMap.get(edge.reviewerId)!.push({ authorId: edge.authorId, author: edge.author, count: edge.count });
  }

  const collaboratorsByContributor = new Map<number, Set<string>>();
  for (const edge of reviewGraph) {
    if (!collaboratorsByContributor.has(edge.reviewerId)) collaboratorsByContributor.set(edge.reviewerId, new Set());
    if (!collaboratorsByContributor.has(edge.authorId)) collaboratorsByContributor.set(edge.authorId, new Set());
    collaboratorsByContributor.get(edge.reviewerId)!.add(edge.author);
    collaboratorsByContributor.get(edge.authorId)!.add(edge.reviewer);
  }

  const contributors: ContributorStats[] = [];
  for (const stats of byContributor.values()) {
    const { currentStreak, longestStreak, activeDays } = computeStreaks(stats._dates);
    const velocity = computeVelocity(stats._events);

    const reviewedOthers = (reviewedByMap.get(stats.contributorId) ?? []).sort((a, b) => b.count - a.count);
    const reviewedBy = (reviewByAuthor.get(stats.contributorId) ?? []).sort((a, b) => b.count - a.count);

    const prCount = prsByAuthor.get(stats.contributorId)?.size ?? 0;
    const reviewsReceived = reviewedBy.reduce((sum, r) => sum + r.count, 0);

    const selfWorkScore = stats.prsMerged * 3 + stats.commits + stats.changedLines / 100;
    const collaborationWorkScore = stats.reviews * 2 + stats.approvalsGiven * 1.5 + stats.issues * 1;
    const totalWork = selfWorkScore + collaborationWorkScore;
    const collaborationScore = totalWork > 0 ? Math.round((collaborationWorkScore / totalWork) * 100) : 0;

    const publicStats = { ...stats };
    delete (publicStats as Record<string, unknown>)._dates;
    delete (publicStats as Record<string, unknown>)._events;

    contributors.push({
      ...publicStats,
      currentStreak,
      longestStreak,
      activeDays,
      velocity: velocity.values,
      velocityLabels: velocity.labels,
      reviewedBy,
      reviewedByCount: reviewsReceived,
      reviewedOthers,
      reviewedOthersCount: reviewedOthers.reduce((sum, r) => sum + r.count, 0),
      collaborators: Array.from(collaboratorsByContributor.get(stats.contributorId) ?? []),
      prsReceivedReviews: prCount > 0 ? reviewsReceived : 0,
      collaborationScore,
    });
  }

  contributors.sort((a, b) => {
    const aScore = a.prsMerged * 3 + a.commits + a.reviews * 2 + a.changedLines / 100;
    const bScore = b.prsMerged * 3 + b.commits + b.reviews * 2 + b.changedLines / 100;
    return bScore - aScore;
  });

  return {
    contributors,
    reviewGraph,
    totalEvents: events.length,
    totalReviews: events.filter((e) => e.event_type === 'review_submitted').length,
    totalPRs: events.filter((e) => e.event_type === 'pr_merged').length,
  };
}

export type ReviewGraphEdge = {
  reviewerId: number;
  reviewer: string;
  authorId: number;
  author: string;
  count: number;
};

export type CollaborationSummary = {
  contributors: ContributorStats[];
  reviewGraph: ReviewGraphEdge[];
  topReviewer: ContributorStats | undefined;
  topCollaborator: ContributorStats | undefined;
  mostActive: ContributorStats | undefined;
  totalEvents: number;
  totalReviews: number;
  totalPRs: number;
  avgCollaborationScore: number;
};

export function summarizeCollaboration(events: EventRow[]): CollaborationSummary {
  const analytics = computeCollaborationAnalytics(events);
  const { contributors, reviewGraph } = analytics;

  const topReviewer = contributors
    .filter((c) => c.reviews > 0)
    .sort((a, b) => b.reviews - a.reviews)[0];

  const topCollaborator = contributors
    .filter((c) => c.collaborationScore > 0)
    .sort((a, b) => b.collaborationScore - a.collaborationScore)[0];

  const mostActive = contributors
    .filter((c) => c.activeDays > 0)
    .sort((a, b) => b.activeDays - a.activeDays)[0];

  const avgCollaborationScore = contributors.length > 0
    ? Math.round(contributors.reduce((sum, c) => sum + c.collaborationScore, 0) / contributors.length)
    : 0;

  return {
    contributors,
    reviewGraph,
    topReviewer,
    topCollaborator,
    mostActive,
    totalEvents: analytics.totalEvents,
    totalReviews: analytics.totalReviews,
    totalPRs: analytics.totalPRs,
    avgCollaborationScore,
  };
}
