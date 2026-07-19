import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { sql } from './db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
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
          // Upsert the app user and get their internal ID
          const dbUser = await sql`
            INSERT INTO app_users (github_id, username, email, avatar_url, last_login_at)
            VALUES (${githubId}, ${username}, ${email}, ${avatarUrl}, NOW())
            ON CONFLICT (github_id) DO UPDATE
            SET username = ${username}, email = ${email}, avatar_url = ${avatarUrl}, last_login_at = NOW()
            RETURNING id
          `;
          const appUserId = dbUser[0].id;

          // Also upsert as a contributor
          await sql`
            INSERT INTO github_contributors (github_id, username, avatar_url, last_seen_at)
            VALUES (${githubId}, ${username}, ${avatarUrl}, NOW())
            ON CONFLICT (github_id) DO UPDATE
            SET username = ${username}, avatar_url = ${avatarUrl}, last_seen_at = NOW()
          `;

          // Link any pending installations for this GitHub account.
          // This handles both flows:
          // 1. Install-then-login: webhook stored 'pending', now we link on sign-in
          // 2. Login-then-install: webhook fires after, sees app_user exists, links immediately
          await sql`
            UPDATE installations
            SET linked_user_id = ${appUserId},
                status = 'active',
                updated_at = NOW()
            WHERE github_account_id = ${githubId}
              AND status = 'pending'
          `;
        } catch (error) {
          console.error('Error saving user during sign in:', error);
        }
      }
      return true;
    },

    async session({ session, token }) {
      if (token.sub) {
        try {
          const dbUser = await sql`
            SELECT id, github_id FROM app_users WHERE email = ${session.user.email}
          `;
          if (dbUser.length > 0) {
            session.user.id = dbUser[0].id.toString();
            // @ts-ignore
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
