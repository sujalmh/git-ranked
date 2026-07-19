import { NextResponse } from 'next/server';

export function GET(req: Request) {
  return NextResponse.redirect('https://github.com/apps/git-ranked-dev/installations/new');
}
