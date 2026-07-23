import { auth, signIn, signOut } from '@/lib/auth';
import { NavbarClient } from './NavbarClient';

export async function Navbar() {
  const session = await auth();
  const githubAppSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || 'git-ranked-dev';

  const signOutAction = async () => {
    'use server';
    await signOut();
  };

  const signInAction = async () => {
    'use server';
    await signIn('github');
  };

  return (
    <NavbarClient
      user={session?.user ? { name: session.user.name, image: session.user.image } : null}
      githubAppSlug={githubAppSlug}
      signOutAction={signOutAction}
      signInAction={signInAction}
    />
  );
}

