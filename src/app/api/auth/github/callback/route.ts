import { NextResponse } from 'next/server';

export function GET(req: Request) {
  // Redirect GitHub's custom callback to NextAuth's standard callback URL
  const url = new URL(req.url);
  const search = url.search;
  return NextResponse.redirect(new URL(`/api/auth/callback/github${search}`, req.url));
}
