import { sql } from './db';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'tencent/hy3:free';

type GitHubEventSummaryRow = {
  event_type: string;
  payload: unknown;
  created_at: Date | string;
  username: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function generateSummary(
  repoId: number,
  summaryType: string,
  dateFrom: string,
  dateTo: string,
  contributorId?: number
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  // 1. Check cache first
  const cacheQuery = contributorId 
    ? await sql`
        SELECT summary_text FROM ai_summaries 
        WHERE repo_id = ${repoId} 
          AND contributor_id = ${contributorId}
          AND summary_type = ${summaryType}
          AND date_from = ${dateFrom}
          AND date_to = ${dateTo}
          AND generated_at > NOW() - INTERVAL '1 hour'
        ORDER BY generated_at DESC LIMIT 1
      `
    : await sql`
        SELECT summary_text FROM ai_summaries 
        WHERE repo_id = ${repoId} 
          AND contributor_id IS NULL
          AND summary_type = ${summaryType}
          AND date_from = ${dateFrom}
          AND date_to = ${dateTo}
          AND generated_at > NOW() - INTERVAL '1 hour'
        ORDER BY generated_at DESC LIMIT 1
      `;
      
  if (cacheQuery.length > 0) {
    return cacheQuery[0].summary_text;
  }

  // 2. Fetch events
  const events = contributorId
    ? await sql`
        SELECT e.event_type, e.payload, e.created_at, c.username
        FROM github_events e
        JOIN github_contributors c ON e.contributor_id = c.id
        WHERE e.repo_id = ${repoId}
          AND e.contributor_id = ${contributorId}
          AND e.created_at >= ${dateFrom}::date
          AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
        ORDER BY e.created_at ASC
      `
    : await sql`
        SELECT e.event_type, e.payload, e.created_at, c.username
        FROM github_events e
        JOIN github_contributors c ON e.contributor_id = c.id
        WHERE e.repo_id = ${repoId}
          AND e.created_at >= ${dateFrom}::date
          AND e.created_at < ${dateTo}::date + INTERVAL '1 day'
        ORDER BY e.created_at ASC
      `;

  if (events.length === 0) {
    return "No activity found for this period.";
  }

  // 3. Prepare prompt
  const typedEvents = events as GitHubEventSummaryRow[];
  
  // Filter out raw commits to avoid token bloat unless specifically requested
  const meaningfulEvents = typedEvents.filter(e => e.event_type !== 'push').slice(-100);
  const eventContext = meaningfulEvents.map(event => 
    `[${new Date(event.created_at).toISOString()}] ${event.username} - ${event.event_type}: ${JSON.stringify(event.payload)}`
  ).join('\n');

  let prompt = '';
  if (summaryType === 'team_insights') {
    prompt = `
You are an AI Engineering Intelligence bot.
Analyze the following events and detect: review bottlenecks, single-owner modules, rising contributors, and quiet repositories.
Provide a clear, concise bulleted list of insights.
Events:
${eventContext}
`.trim();
  } else if (summaryType === 'release_notes') {
    prompt = `
You are a Product Manager writing release notes.
Extract features, fixes, and improvements from these events to create user-facing release notes.
Events:
${eventContext}
`.trim();
  } else if (summaryType === 'areas_of_contribution') {
    prompt = `
You are an engineering manager categorizing work.
Determine the areas of contribution (e.g., Backend, Frontend, API, Database, CI/CD, Documentation, Testing) for this contributor based on their events.
List only the categories as comma-separated values, nothing else.
Events:
${eventContext}
`.trim();
  } else {
    prompt = `
You are an expert technical manager reviewing a team's GitHub activity.
Analyze the following events and provide a concise, insightful summary of what was accomplished.
Focus on the *impact* and *quality* of the work. Do not just list events.
Events:
${eventContext}

Format your response in clean Markdown. Use bullet points for key achievements.
`.trim();
  }

  // 4. Call OpenRouter
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gitranked.dev', // Required by OpenRouter
      'X-Title': 'GitRanked',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are an expert technical manager and code reviewer.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('OpenRouter API error:', err);
    throw new Error('Failed to generate AI summary');
  }

  const data = (await response.json()) as OpenRouterResponse;
  const summaryText = data.choices?.[0]?.message?.content?.trim();
  if (!summaryText) {
    throw new Error('OpenRouter returned an empty summary');
  }

  // 5. Cache result
  if (contributorId) {
    await sql`
      INSERT INTO ai_summaries (repo_id, contributor_id, summary_type, date_from, date_to, summary_text, model_used)
      VALUES (${repoId}, ${contributorId}, ${summaryType}, ${dateFrom}, ${dateTo}, ${summaryText}, ${MODEL})
    `;
  } else {
    await sql`
      INSERT INTO ai_summaries (repo_id, summary_type, date_from, date_to, summary_text, model_used)
      VALUES (${repoId}, ${summaryType}, ${dateFrom}, ${dateTo}, ${summaryText}, ${MODEL})
    `;
  }

  return summaryText;
}
