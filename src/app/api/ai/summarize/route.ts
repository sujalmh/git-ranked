import { NextResponse } from 'next/server';
import { generateSummary } from '../../../../lib/ai';
// import { auth } from '@/lib/auth'; // Will add auth later

export async function POST(req: Request) {
  // const session = await auth();
  // if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { repoId, dateFrom, dateTo, contributorId } = body;

    if (!repoId || !dateFrom || !dateTo) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const summary = await generateSummary(repoId, dateFrom, dateTo, contributorId);
    
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Summarize API Error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
