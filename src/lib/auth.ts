import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import { createHmac, timingSafeEqual } from 'crypto';
import { sql } from './db';

type GitHubProfile = {
  githubId: number;
  username: string;
  email?: string | null;
  avatarUrl?: string | null;
  installation?: GitHubInstallation | null;
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

type GitHubInstallSessionPayload = GitHubProfile & {
  exp: number;
};

function getInstallSessionSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.GITHUB_CLIENT_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET, NEXTAUTH_SECRET, or GITHUB_CLIENT_SECRET must be configured');
  }
  return secret;
}

function signInstallSessionPayload(payload: string) {
  return createHmac('sha256', getInstallSessionSecret()).update(payload).digest('hex');
}

function isValidSignature(payload: string, signature: string) {
  const expected = signInstallSessionPayload(payload);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');

  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

function parseGitHubInstallSessionPayload(payload: string, signature: string): GitHubInstallSessionPayload | null {
  if (!isValidSignature(payload, signature)) {
    return null;
  }

  const parsed = JSON.parse(payload) as Partial<GitHubInstallSessionPayload>;

  if (
    typeof parsed.githubId !== 'number' ||
    typeof parsed.username !== 'string' ||
    typeof parsed.exp !== 'number' ||
    parsed.exp < Date.now()
  ) {
    return null;
  }

  return parsed as GitHubInstallSessionPayload;
}

export function createGitHubInstallSessionCredentials(profile: GitHubProfile) {
  const payload = JSON.stringify({
    ...profile,
    exp: Date.now() + 5 * 60 * 1000,
  } satisfies GitHubInstallSessionPayload);

  return {
    payload,
    signature: signInstallSessionPayload(payload),
  };
}

export async function upsertGitHubUserAndLinkInstallation(profile: GitHubProfile) {
  const dbUser = await sql`
    INSERT INTO app_users (github_id, username, email, avatar_url, last_login_at)
    VALUES (${profile.githubId}, ${profile.username}, ${profile.email ?? null}, ${profile.avatarUrl ?? null}, NOW())
    ON CONFLICT (github_id) DO UPDATE
    SET username = ${profile.username}, email = ${profile.email ?? null}, avatar_url = ${profile.avatarUrl ?? null}, last_login_at = NOW()
    RETURNING id
  `;
  const appUserId = dbUser[0].id;

  await sql`
    INSERT INTO github_contributors (github_id, username, avatar_url, last_seen_at)
    VALUES (${profile.githubId}, ${profile.username}, ${profile.avatarUrl ?? null}, NOW())
    ON CONFLICT (github_id) DO UPDATE
    SET username = ${profile.username}, avatar_url = ${profile.avatarUrl ?? null}, last_seen_at = NOW()
  `;

  if (profile.installation) {
    const ownerType = profile.installation.target_type || profile.installation.account.type || 'User';

    await sql`
      INSERT INTO installations (
        github_installation_id, github_account_id, owner_login, owner_type,
        status, linked_user_id, updated_at
      )
      VALUES (
        ${profile.installation.id}, ${profile.installation.account.id}, ${profile.installation.account.login}, ${ownerType},
        'active', ${appUserId}, NOW()
      )
      ON CONFLICT (github_installation_id) DO UPDATE
      SET linked_user_id = ${appUserId},
          status = 'active',
          github_account_id = ${profile.installation.account.id},
          owner_login = ${profile.installation.account.login},
          owner_type = ${ownerType},
          updated_at = NOW()
    `;
  } else {
    await sql`
      UPDATE installations
      SET linked_user_id = ${appUserId},
          status = 'active',
          updated_at = NOW()
      WHERE github_account_id = ${profile.githubId}
        AND status = 'pending'
    `;
  }

  return {
    id: appUserId,
    githubId: profile.githubId,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Credentials({
      id: 'github-installation',
      name: 'GitHub App Installation',
      credentials: {
        payload: {},
        signature: {},
      },
      async authorize(credentials) {
        const payload = typeof credentials.payload === 'string' ? credentials.payload : null;
        const signature = typeof credentials.signature === 'string' ? credentials.signature : null;

        if (!payload || !signature) {
          return null;
        }

        const profile = parseGitHubInstallSessionPayload(payload, signature);
        if (!profile) {
          return null;
        }

        await upsertGitHubUserAndLinkInstallation(profile);

        return {
          id: profile.githubId.toString(),
          name: profile.username,
          email: profile.email ?? null,
          image: profile.avatarUrl ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github') {
        const githubId = profile?.id as unknown as number;
        const username = profile?.login as string;
        const avatarUrl = user.image;
        const email = user.email;

        try {
          await upsertGitHubUserAndLinkInstallation({
            githubId,
            username,
            email,
            avatarUrl,
          });
        } catch (error) {
          console.error('Error saving user during sign in:', error);
        }
      }
      return true;
    },

    async session({ session, token }) {
      if (token.sub) {
        try {
          const githubId = Number(token.sub);
          const dbUser = await sql`
            SELECT id, github_id FROM app_users WHERE github_id = ${githubId}
          `;
          if (dbUser.length > 0) {
            session.user.id = dbUser[0].id.toString();
            session.user.githubId = dbUser[0].github_id;
          }
        } catch (e) {
          console.error('Error fetching session user:', e);
        }
      }
      return session;
    },
  },
});
