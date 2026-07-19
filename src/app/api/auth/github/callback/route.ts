import { NextResponse } from 'next/server';

// This route is the GitHub App "Callback URL" (User authorization callback URL).
// GitHub redirects here after installation + OAuth with:
//   ?code=...&installation_id=...&setup_action=install
//
// We do NOT forward the `code` to NextAuth because this OAuth flow was initiated
// by GitHub (not by NextAuth), so NextAuth's state/CSRF check would fail.
//
// Instead, the installation is already captured by the `installation.created` webhook
// (which fires before this redirect). We simply send the user to /setup.
// If they are already signed in, /setup shows success immediately.
// If not, /setup offers a standard NextAuth sign-in which will link the installation
// via the signIn callback (matching github_account_id to pending installations).
export function GET(req: Request) {
  return NextResponse.redirect(new URL('/setup', req.url));
}
