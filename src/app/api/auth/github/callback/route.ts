import { NextResponse } from 'next/server';
import { createGitHubInstallSessionCredentials, signIn } from '@/lib/auth';

type GitHubAccessTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string | null;
};

type GitHubInstallation = {
  id: number;
  account: {
    id: number;
    login: string;
    type?: string | null;
  };
  target_type?: string | null;
};

type GitHubInstallationsResponse = {
  installations: GitHubInstallation[];
};

function requireGitHubOAuthConfig() {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured');
  }

  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

async function exchangeCodeForGitHubUserToken(code: string) {
  const { clientId, clientSecret } = requireGitHubOAuthConfig();

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed with ${response.status}`);
  }

  const data = (await response.json()) as GitHubAccessTokenResponse;
  if (!data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub token exchange did not return an access token');
  }

  return data.access_token;
}

async function githubApi<T>(path: string, accessToken: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API request to ${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function findAuthorizedInstallation(accessToken: string, installationId: number) {
  for (let page = 1; page <= 10; page += 1) {
    const data = await githubApi<GitHubInstallationsResponse>(
      `/user/installations?per_page=100&page=${page}`,
      accessToken
    );
    const installation = data.installations.find(item => item.id === installationId);

    if (installation) {
      return installation;
    }

    if (data.installations.length < 100) {
      break;
    }
  }

  throw new Error(`GitHub user token is not authorized for installation ${installationId}`);
}

// This route is the GitHub App "Callback URL" (User authorization callback URL).
// GitHub redirects here after installation + OAuth with:
//   ?code=...&installation_id=...&setup_action=install
//
// Because GitHub starts this OAuth flow as part of installation, Auth.js did not
// create its own state cookie via signIn("github"). We consume GitHub's code here,
// verify that the installation is visible to the authorized user, then ask Auth.js
// to mint the normal app session through a private signed credentials handoff.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const installationIdParam = url.searchParams.get('installation_id');

  if (!code) {
    return NextResponse.redirect(new URL('/setup?error=missing_github_oauth_code', req.url));
  }

  try {
    const accessToken = await exchangeCodeForGitHubUserToken(code);
    const user = await githubApi<GitHubUserResponse>('/user', accessToken);
    const installationId = installationIdParam ? Number(installationIdParam) : null;
    if (installationIdParam && !Number.isFinite(installationId)) {
      throw new Error(`Invalid GitHub installation_id: ${installationIdParam}`);
    }

    const installation = installationId ? await findAuthorizedInstallation(accessToken, installationId) : null;
    const credentials = createGitHubInstallSessionCredentials({
      githubId: user.id,
      username: user.login,
      email: user.email,
      avatarUrl: user.avatar_url,
      installation,
    });

    await signIn('github-installation', {
      ...credentials,
      redirect: false,
      redirectTo: '/setup',
    });

    return NextResponse.redirect(new URL('/setup', req.url));
  } catch (error) {
    console.error('GitHub App OAuth callback failed:', error);
    return NextResponse.redirect(new URL('/setup?error=github_app_oauth_failed', req.url));
  }
}
