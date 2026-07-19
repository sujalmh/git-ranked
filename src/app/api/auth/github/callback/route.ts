import { NextResponse } from 'next/server';

export function GET(req: Request) {
  const url = new URL(req.url);
  const installationId = url.searchParams.get('installation_id');

  // If this is a redirect from GitHub App installation, handle it by sending to /setup
  // GitHub sends `code`, `installation_id`, and `setup_action` here.
  if (installationId) {
    return NextResponse.redirect(new URL(`/setup?installation_id=${installationId}`, req.url));
  }

  // Otherwise, fallback to NextAuth's standard callback
  const search = url.search;
  return NextResponse.redirect(new URL(`/api/auth/callback/github${search}`, req.url));
}
