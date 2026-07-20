import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      id: string;
      githubId?: number;
    } & DefaultSession['user'];
  }
}
