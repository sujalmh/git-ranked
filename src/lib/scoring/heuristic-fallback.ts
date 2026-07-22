import type { Facts, Scope, WorkType } from './types';

export const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /test\//,
  /tests\//,
];

export const MIGRATION_PATTERNS = [
  /migrations?\//,
  /schema\./,
  /\.sql$/,
  /db\/migrate/,
];

export const DOC_PATTERNS = [
  /\.mdx?$/,
  /docs?\//,
  /LICENSE/,
  /README/,
];

export const AUTH_PATTERNS = [
  /auth/i,
  /session/i,
  /login/i,
  /password/i,
  /jwt/i,
  /token/i,
  /permission/i,
  /role/i,
];

export const DISTRIBUTED_STATE_PATTERNS = [
  /redis/i,
  /cache/i,
  /queue/i,
  /kafka/i,
  /rabbitmq/i,
  /worker/i,
  /pubsub/i,
  /broadcast/i,
];

export function determineScope(changedFiles = 0, totalLines = 0): Scope {
  if (changedFiles <= 2 && totalLines <= 20) return 'trivial';
  if (changedFiles <= 5 && totalLines <= 100) return 'small';
  if (changedFiles <= 15 && totalLines <= 400) return 'medium';
  if (changedFiles <= 35 && totalLines <= 1000) return 'large';
  return 'system_wide';
}

export function classifyWorkTypeFromText(titleOrMessage: string): WorkType {
  const text = titleOrMessage.toLowerCase();

  if (/\b(sec|security|vulnerability|auth|token|jwt|permission)\b/.test(text)) {
    return 'Security';
  }
  if (/\b(fix|fixes|fixed|bug|bugs|patch|patched|issue|issues|error|crash)\b/.test(text)) {
    return 'BugFix';
  }
  if (/\b(perf|performance|optimize|optimization|faster|speedup)\b/.test(text)) {
    return 'Performance';
  }
  if (/\b(refactor|refactoring|cleanup|clean|structure)\b/.test(text)) {
    return 'Refactor';
  }
  if (/\b(test|tests|testing|spec|specs|coverage)\b/.test(text)) {
    return 'Testing';
  }
  if (/\b(doc|docs|documentation|readme|changelog)\b/.test(text)) {
    return 'Documentation';
  }
  if (/\b(ci|cd|infra|infrastructure|docker|k8s|kubernetes|deploy|workflow|actions)\b/.test(text)) {
    return 'Infrastructure';
  }
  if (/\b(feat|feature|add|added|implement|implementation|new)\b/.test(text)) {
    return 'Feature';
  }

  return 'Feature';
}

export function extractHeuristicFacts(
  titleOrMessage: string,
  filesChanged: string[] = [],
  additions = 0,
  deletions = 0
): Facts {
  const text = titleOrMessage.toLowerCase();
  const totalLines = additions + deletions;
  const changedFilesCount = filesChanged.length;

  const hasTestFile = filesChanged.some((f) => TEST_PATTERNS.some((p) => p.test(f)));
  const hasDocFile = filesChanged.some((f) => DOC_PATTERNS.some((p) => p.test(f)));
  const hasMigrationFile = filesChanged.some((f) => MIGRATION_PATTERNS.some((p) => p.test(f)));
  const hasAuthFile = filesChanged.some((f) => AUTH_PATTERNS.some((p) => p.test(f)));
  const hasDistStateFile = filesChanged.some((f) => DISTRIBUTED_STATE_PATTERNS.some((p) => p.test(f)));

  const scope = determineScope(changedFilesCount, totalLines);
  const user_visible = /\b(ui|ux|page|component|view|button|css|style|user|api|endpoint|route)\b/.test(text);
  const breaking_change = /\b(breaking|deprecate|deprecated|major)\b/.test(text);
  const cross_cutting = changedFilesCount > 8 || filesChanged.some((f) => f.includes('core') || f.includes('shared'));
  const testing_added = hasTestFile || /\b(test|spec)\b/.test(text);
  const documentation_updated = hasDocFile || /\b(doc|docs|readme)\b/.test(text);
  const new_algorithm_or_subsystem = /\b(new algorithm|new subsystem|engine|architecture)\b/.test(text);
  const boilerplate = /\b(bump|version|lock|generated|deps|dependency)\b/.test(text) || (totalLines > 200 && changedFilesCount === 1 && filesChanged[0]?.endsWith('.json'));
  const touches_auth = hasAuthFile || /\b(auth|login|session|jwt|token)\b/.test(text);
  const touches_data_migration = hasMigrationFile || /\b(migration|schema|db|database)\b/.test(text);
  const touches_distributed_state = hasDistStateFile || /\b(redis|cache|queue|kafka|worker)\b/.test(text);
  const touches_architecture = cross_cutting || new_algorithm_or_subsystem;

  return {
    scope,
    user_visible,
    breaking_change,
    cross_cutting,
    testing_added,
    documentation_updated,
    new_algorithm_or_subsystem,
    boilerplate,
    touches_auth,
    touches_data_migration,
    touches_distributed_state,
    touches_architecture,
  };
}

export function correctLowConfidenceFacts(
  aiFacts: Facts,
  titleOrMessage: string,
  filesChanged: string[] = []
): Facts {
  const heuristic = extractHeuristicFacts(titleOrMessage, filesChanged);

  return {
    ...aiFacts,
    testing_added: aiFacts.testing_added || heuristic.testing_added,
    documentation_updated: aiFacts.documentation_updated || heuristic.documentation_updated,
    touches_auth: aiFacts.touches_auth || heuristic.touches_auth,
    touches_data_migration: aiFacts.touches_data_migration || heuristic.touches_data_migration,
    touches_distributed_state: aiFacts.touches_distributed_state || heuristic.touches_distributed_state,
  };
}
