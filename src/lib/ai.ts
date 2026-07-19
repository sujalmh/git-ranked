import { sql } from './db';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'tencent/hy3:free';

export async function generateSummary(
  repoId: number,
  dateFrom: string,
  dateTo: string,
  contributorId?: number
): Promise<string> {
  // 1. Check cache first
  const cacheQuery = contributorId 
    ? await sql`
        SELECT summary_text FROM ai_summaries 
        WHERE repo_id = ${repoId} 
          AND contributor_id = ${contributorId}
          AND date_from = ${dateFrom}
          AND date_to = ${dateTo}
          AND generated_at > NOW() - INTERVAL '1 hour'
        ORDER BY generated_at DESC LIMIT 1
      `
    : await sql`
        SELECT summary_text FROM ai_summaries 
        WHERE repo_id = ${repoId} 
          AND contributor_id IS NULL
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
  const eventContext = events.map(e => 
    `[${e.created_at.toISOString()}] ${e.username} - ${e.event_type}: ${JSON.stringify(e.payload)}`
  ).join('\n');

  const prompt = `
You are an expert technical manager reviewing a team's GitHub activity.
Analyze the following events and provide a concise, insightful summary of what was accomplished.
Focus on the *impact* and *quality* of the work, not just listing commits.
If this is for a specific contributor, summarize their specific contributions. If for the whole repo, summarize the team's progress.

Events:
${eventContext}

Format your response in clean Markdown. Use bullet points for key achievements.
  `.trim();

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

  const data = await response.json();
  const summaryText = data.choices[0].message.content;

  // 5. Cache result
  if (contributorId) {
    await sql`
      INSERT INTO ai_summaries (repo_id, contributor_id, date_from, date_to, summary_text, model_used)
      VALUES (${repoId}, ${contributorId}, ${dateFrom}, ${dateTo}, ${summaryText}, ${MODEL})
    `;
  } else {
    await sql`
      INSERT INTO ai_summaries (repo_id, date_from, date_to, summary_text, model_used)
      VALUES (${repoId}, ${dateFrom}, ${dateTo}, ${summaryText}, ${MODEL})
    `;
  }

  return summaryText;
}
