import { NextResponse } from 'next/server';
import { auth, createGitHubInstallSessionCredentials, signIn } from '@/lib/auth';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

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

type GitHubOAuthState = {
  installationId: number;
  nonce: string;
  exp: number;
};

const OAUTH_STATE_COOKIE = 'gitranked.github-oauth-state';

function requireGitHubOAuthConfig() {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured');
  }

  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

function getOAuthStateSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.GITHUB_CLIENT_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET, NEXTAUTH_SECRET, or GITHUB_CLIENT_SECRET must be configured');
  }

  return secret;
}

function signStatePayload(payload: string) {
  return createHmac('sha256', getOAuthStateSecret()).update(payload).digest('hex');
}

function createOAuthState(installationId: number) {
  const payload = JSON.stringify({
    installationId,
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + 10 * 60 * 1000,
  } satisfies GitHubOAuthState);

  return `${Buffer.from(payload).toString('base64url')}.${signStatePayload(payload)}`;
}

function parseOAuthState(state: string | null) {
  if (!state) {
    return null;
  }

  const [encodedPayload, signature] = state.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  try {
    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const expectedSignature = signStatePayload(payload);
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      signatureBuffer.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    ) {
      return null;
    }

    const parsed = JSON.parse(payload) as Partial<GitHubOAuthState>;
    if (
      typeof parsed.installationId !== 'number' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Date.now()
    ) {
      return null;
    }

    return parsed as GitHubOAuthState;
  } catch {
    return null;
  }
}

function createGitHubAuthorizationRedirect(req: Request, installationId: number) {
  const { clientId } = requireGitHubOAuthConfig();
  const requestUrl = new URL(req.url);
  const callbackUrl = new URL('/api/auth/github/callback', requestUrl.origin);
  const state = createOAuthState(installationId);
  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');

  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl.toString());
  authorizeUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: '/api/auth/github/callback',
    sameSite: 'lax',
    secure: requestUrl.protocol === 'https:',
  });

  return response;
}

async function exchangeCodeForGitHubUserToken(code: string, redirectUri?: string) {
  const { clientId, clientSecret } = requireGitHubOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });

  if (redirectUri) {
    body.set('redirect_uri', redirectUri);
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
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
  const setupAction = url.searchParams.get('setup_action');
  const state = url.searchParams.get('state');
  const stateCookie = req.headers
    .get('cookie')
    ?.split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=');
  const parsedState = state && stateCookie && state === decodeURIComponent(stateCookie) ? parseOAuthState(state) : null;

  if (!code) {
    const session = await auth();
    if (session) {
      return NextResponse.redirect(new URL('/setup', req.url));
    }

    const installationId = installationIdParam ? Number(installationIdParam) : null;
    if (installationIdParam && !Number.isFinite(installationId)) {
      console.error('GitHub App callback included invalid installation_id', { setupAction });
      return NextResponse.redirect(new URL('/setup?error=github_app_oauth_failed', req.url));
    }

    if (setupAction && setupAction !== 'install' && installationId) {
      console.info('GitHub App setup callback completed without OAuth code', {
        hasInstallationId: url.searchParams.has('installation_id'),
        setupAction,
      });

      return createGitHubAuthorizationRedirect(req, installationId);
    }

    console.error('GitHub App callback was invoked without OAuth code', {
      hasInstallationId: url.searchParams.has('installation_id'),
      hasSetupAction: url.searchParams.has('setup_action'),
      setupAction,
      queryKeys: Array.from(url.searchParams.keys()),
    });

    return NextResponse.redirect(new URL('/setup?error=missing_github_oauth_code', req.url));
  }

  try {
    if (state && !parsedState) {
      throw new Error('Invalid GitHub OAuth state');
    }

    const redirectUri = parsedState ? new URL('/api/auth/github/callback', url.origin).toString() : undefined;
    const accessToken = await exchangeCodeForGitHubUserToken(code, redirectUri);
    const user = await githubApi<GitHubUserResponse>('/user', accessToken);
    const installationId = installationIdParam ? Number(installationIdParam) : parsedState?.installationId ?? null;
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

    const response = NextResponse.redirect(new URL('/setup', req.url));
    response.cookies.set(OAUTH_STATE_COOKIE, '', {
      httpOnly: true,
      maxAge: 0,
      path: '/api/auth/github/callback',
      sameSite: 'lax',
      secure: url.protocol === 'https:',
    });

    return response;
  } catch (error) {
    console.error('GitHub App OAuth callback failed:', error);
    return NextResponse.redirect(new URL('/setup?error=github_app_oauth_failed', req.url));
  }
}
