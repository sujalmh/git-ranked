import { sql } from '../db';
import { getInstallationAccessToken, githubInstallationApi, type GitHubPullRequestFile } from '../github-api';
import type { DiffFacts } from './types';

const DIFF_FETCH_TIMEOUT_MS = 10_000;
const MAX_FILES_PER_PR = 300;

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.php': 'PHP',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.c': 'C',
  '.h': 'C/C++',
  '.scala': 'Scala',
  '.sh': 'Shell',
  '.sql': 'SQL',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.html': 'HTML',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
};

const DEPENDENCY_FILES = new Set([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'cargo.toml',
  'cargo.lock',
  'go.mod',
  'go.sum',
  'requirements.txt',
  'pipfile',
  'pipfile.lock',
  'pyproject.toml',
  'poetry.lock',
  'gemfile',
  'gemfile.lock',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'composer.lock',
  'mix.exs',
  'mix.lock',
]);

const TEST_PATTERNS = [
  /(^|\/)(test|tests|__tests__|spec|specs|__specs__)\//i,
  /\.(test|spec)\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|php|cs)$/i,
  /(^|\/)test_/i,
  /_test\.(py|go|rs)$/i,
];

const MIGRATION_PATTERNS = [
  /(^|\/)(migrations?|db\/migrate|alembic)\//i,
  /(^|\/)\d+_.+\.(sql|py|rb)$/i,
  /migration.*\.(sql|ts|js|py)$/i,
];

const DOC_PATTERNS = [
  /(^|\/)(docs?|documentation)\//i,
  /\.(md|mdx|rst|txt)$/i,
  /^readme/i,
  /^changelog/i,
  /^contributing/i,
  /^license/i,
];

function getLanguage(filename: string): string | null {
  const ext = filename.slice(filename.lastIndexOf('.'));
  if (ext && ext.length > 1) {
    return LANGUAGE_EXTENSIONS[ext.toLowerCase()] ?? null;
  }
  return null;
}

function topDirectory(filename: string): string {
  const parts = filename.split('/');
  if (parts.length <= 1) return 'root';
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/');
}

function basename(filename: string): string {
  const parts = filename.split('/');
  return parts[parts.length - 1].toLowerCase();
}

export function deriveDiffFactsFromFiles(files: GitHubPullRequestFile[]): DiffFacts {
  const directories = new Set<string>();
  const languages = new Set<string>();
  const dependencyUpdates = new Set<string>();
  let testsAdded = 0;
  let migrations = 0;
  let docsUpdated = 0;
  let renamed = 0;
  let insertions = 0;
  let deletions = 0;

  for (const file of files) {
    directories.add(topDirectory(file.filename));
    const lang = getLanguage(file.filename);
    if (lang) languages.add(lang);

    if (file.status === 'renamed' || file.status === 'copied') renamed++;
    insertions += file.additions ?? 0;
    deletions += file.deletions ?? 0;

    const base = basename(file.filename);
    if (DEPENDENCY_FILES.has(base)) {
      dependencyUpdates.add(base);
    }
    if (TEST_PATTERNS.some((p) => p.test(file.filename))) {
      testsAdded++;
    }
    if (MIGRATION_PATTERNS.some((p) => p.test(file.filename))) {
      migrations++;
    }
    if (DOC_PATTERNS.some((p) => p.test(file.filename))) {
      docsUpdated++;
    }
  }

  return {
    files_changed: files.length,
    directories: Array.from(directories).slice(0, 10),
    languages: Array.from(languages),
    insertions,
    deletions,
    renamed,
    dependency_updates: Array.from(dependencyUpdates),
    tests_added: testsAdded,
    migrations,
    docs_updated: docsUpdated,
    fetched_at: new Date().toISOString(),
  };
}

export function deriveDiffFactsFromStored(payload: Record<string, unknown>): DiffFacts | null {
  const additions = typeof payload.additions === 'number' ? payload.additions : 0;
  const deletions = typeof payload.deletions === 'number' ? payload.deletions : 0;
  const changedFiles = typeof payload.changed_files === 'number' ? payload.changed_files : 0;

  if (!additions && !deletions && !changedFiles) return null;

  const title = typeof payload.title === 'string' ? payload.title.toLowerCase() : '';
  const hasTests = /\btest\b/i.test(title);
  const hasMigration = /\bmigrat/i.test(title);
  const hasDocs = /\bdocs?\b/i.test(title);

  return {
    files_changed: changedFiles,
    directories: [],
    languages: [],
    insertions: additions,
    deletions: deletions,
    renamed: 0,
    dependency_updates: [],
    tests_added: hasTests ? 1 : 0,
    migrations: hasMigration ? 1 : 0,
    docs_updated: hasDocs ? 1 : 0,
    fetched_at: null,
  };
}

type GetDiffFactsParams = {
  eventId: number;
  repoOwner: string;
  repoName: string;
  repoId: number;
  prNumber: number;
  storedFacts?: unknown;
};

export async function getDiffFacts(params: GetDiffFactsParams): Promise<DiffFacts | undefined> {
  if (params.storedFacts && typeof params.storedFacts === 'object') {
    return params.storedFacts as DiffFacts;
  }

  if (!params.prNumber) return undefined;

  try {
    const repoQuery = await sql`
      SELECT i.github_installation_id
      FROM repositories r
      JOIN installations i ON r.installation_id = i.id
      WHERE r.id = ${params.repoId}
    `;
    if (repoQuery.length === 0) return undefined;

    const installationId = repoQuery[0].github_installation_id;
    const token = await getInstallationAccessToken(installationId);
    if (!token) return undefined;

    const owner = encodeURIComponent(params.repoOwner);
    const name = encodeURIComponent(params.repoName);
    const files = await githubInstallationApi<GitHubPullRequestFile[]>(
      `/repos/${owner}/${name}/pulls/${params.prNumber}/files?per_page=${MAX_FILES_PER_PR}`,
      token,
      DIFF_FETCH_TIMEOUT_MS
    );

    const facts = deriveDiffFactsFromFiles(files);

    await sql`
      UPDATE github_events SET diff_facts = ${JSON.stringify(facts)} WHERE id = ${params.eventId}
    `.catch(() => {});

    return facts;
  } catch (error) {
    console.error(`Failed to fetch diff facts for event ${params.eventId}:`, error);
    return undefined;
  }
}

export async function getPushDiffFacts(
  repoOwner: string,
  repoName: string,
  repoId: number,
  beforeSha: string,
  afterSha: string
): Promise<DiffFacts | undefined> {
  if (!beforeSha || !afterSha || beforeSha === afterSha) return undefined;

  try {
    const repoQuery = await sql`
      SELECT i.github_installation_id
      FROM repositories r
      JOIN installations i ON r.installation_id = i.id
      WHERE r.id = ${repoId}
    `;
    if (repoQuery.length === 0) return undefined;

    const installationId = repoQuery[0].github_installation_id;
    const token = await getInstallationAccessToken(installationId);
    if (!token) return undefined;

    const owner = encodeURIComponent(repoOwner);
    const name = encodeURIComponent(repoName);
    const compareRes = await githubInstallationApi<{ files?: GitHubPullRequestFile[] }>(
      `/repos/${owner}/${name}/compare/${beforeSha}...${afterSha}`,
      token,
      DIFF_FETCH_TIMEOUT_MS
    );

    if (!compareRes.files) return undefined;
    return deriveDiffFactsFromFiles(compareRes.files.slice(0, MAX_FILES_PER_PR));
  } catch (error) {
    console.error(`Failed to fetch push diff facts for ${beforeSha}...${afterSha}:`, error);
    return undefined;
  }
}

