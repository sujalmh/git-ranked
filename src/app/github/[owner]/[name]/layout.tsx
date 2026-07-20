import { Metadata } from 'next';
import { getPublicRepository } from '@/lib/github-api';
import { notFound } from 'next/navigation';

export async function generateMetadata(
  props: { params: Promise<{ owner: string; name: string }> }
): Promise<Metadata> {
  const params = await props.params;
  const { owner, name } = params;
  
  const repo = await getPublicRepository(owner, name);
  if (!repo) {
    return {
      title: 'Repository Not Found | GitRanked',
    };
  }

  const title = `${repo.full_name} - GitHub Analytics & Insights | GitRanked`;
  const description = repo.description 
    ? `View engineering metrics, contributor analytics, and PR review insights for ${repo.full_name}. ${repo.description}`
    : `Deep GitHub analytics, code quality metrics, and contributor insights for ${repo.full_name}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    }
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
