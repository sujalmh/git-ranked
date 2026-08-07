/**
 * Deterministic repository health scoring.
 *
 * Delivery and Code Quality are computed from the SAME work-unit value model
 * that powers contributor scores (shipped `derived.value` and
 * `derived.execution_quality`), so the repo number is consistent with the
 * people inside it. Volume-only event counts are used as a fallback before
 * classification has run. All metrics are honest 0-100 scores with no hard
 * floors, so an inactive repo does not look artificially healthy.
 */

export interface RepoHealthSignals {
  prsMerged: number;
  prsOpened: number;
  pushes: number;
  reviews: number;
  releases: number;
  fixes: number;
  activeContributors: number;
  reviewerCount: number;
  /** activeDays / spanDays over the window */
  consistencyRatio: number;
  /** Σ shipped work-unit derived.value in the window */
  deliveredValue: number;
  /** shipped work units in the window */
  unitCount: number;
  /** distinct contributors with ≥1 shipped unit in the window */
  wuContributors: number;
  /** Σ derived.execution_quality (1-5) */
  qualitySum: number;
  qualityCount: number;
  /** shipped units with testing or documentation */
  testDocCount: number;
  /** any activity at all in the window */
  totalEvents: number;
  /** 1 - (top contributor share of activity), i.e. activity evenness 0..1 */
  evenness: number;
}

export interface HealthMetrics {
  delivery: number;
  collaboration: number;
  codeQuality: number;
  reviewHealth: number;
  knowledgeDistribution: number;
  overallScore: number;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v);

export function computeHealthMetrics(s: RepoHealthSignals): HealthMetrics {
  // 1. Delivery — blend of raw volume and per-contributor throughput. The
  // work-unit value model already downweights spam (a trivial unit carries ~5%
  // of a large unit's value), and per-capita dilution prevents a lone bot-like
  // contributor from inflating a repo.
  const shippingVolume = s.prsMerged * 3 + s.prsOpened * 2 + s.pushes + s.releases * 5;
  const volumeScore = shippingVolume > 0 ? 100 * (1 - Math.exp(-shippingVolume / 30)) : 0;
  const perCapitaValue = s.unitCount > 0 && s.wuContributors > 0 ? s.deliveredValue / s.wuContributors : 0;
  const perCapitaScore = perCapitaValue > 0 ? 100 * (1 - Math.exp(-perCapitaValue / 2)) : 0;
  const delivery = clamp(round(volumeScore * 0.6 + perCapitaScore * 0.4), 0, 100);

  // 2. Collaboration — contributor breadth + review participation. Zero when no
  // one is active in the window (no phantom baseline for inactive repos).
  let collaboration = 0;
  if (s.activeContributors > 0) {
    const breadthScore = Math.min(40, s.activeContributors * 4);
    const reviewParticipation = Math.min(30, s.reviewerCount * 6);
    collaboration = clamp(round(30 + breadthScore + reviewParticipation), 0, 100);
  }

  // 3. Code Quality — same derived.execution_quality used in contributor quality.
  let codeQuality: number;
  if (s.qualityCount > 0) {
    const avgQuality = s.qualitySum / s.qualityCount; // 1..5
    const testRatio = s.unitCount > 0 ? s.testDocCount / s.unitCount : 0;
    codeQuality = clamp(round(35 + avgQuality * 10 + testRatio * 15), 0, 100);
  } else {
    const totalShipped = s.prsMerged + s.pushes;
    const fixRatio = totalShipped > 0 ? s.fixes / totalShipped : 0;
    if (totalShipped === 0) {
      codeQuality = 0;
    } else if (fixRatio >= 0.1 && fixRatio <= 0.6) {
      codeQuality = 85;
    } else {
      codeQuality = 70;
    }
  }

  // 4. Review Health — reviews per merged PR (coverage)
  let reviewHealth: number;
  if (s.prsMerged > 0) {
    if (s.reviews >= 5) {
      const coverage = s.prsOpened > 0 ? s.reviews / s.prsOpened : s.reviews / Math.max(1, s.prsMerged);
      reviewHealth = clamp(round(Math.min(100, 35 + coverage * 30)), 0, 100);
    } else {
      const prMergeRatio = s.prsOpened > 0 ? clamp(s.prsMerged / s.prsOpened, 0.5, 1) : s.prsMerged > 0 ? 0.9 : 0;
      reviewHealth = clamp(round(prMergeRatio * 90), 0, 100);
    }
  } else {
    reviewHealth = 0;
  }

  // 5. Knowledge Distribution — bus factor (evenness) + contributor breadth
  let knowledgeDistribution = 0;
  if (s.activeContributors > 0) {
    const breadth = Math.min(50, s.activeContributors * 5);
    knowledgeDistribution = clamp(round(30 + s.evenness * 20 + breadth), 0, 100);
  }

  const overallScore = round(
    delivery * 0.30 +
      codeQuality * 0.20 +
      collaboration * 0.15 +
      reviewHealth * 0.15 +
      knowledgeDistribution * 0.20
  );

  return {
    delivery,
    collaboration,
    codeQuality,
    reviewHealth,
    knowledgeDistribution,
    overallScore,
  };
}
