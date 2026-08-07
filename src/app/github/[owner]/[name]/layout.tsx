import { Metadata } from 'next';
import { getPublicRepositoryCached } from '@/lib/github-api';

export async function generateMetadata(
  props: { params: Promise<{ owner: string; name: string }> }
): Promise<Metadata> {
  const params = await props.params;
  const { owner, name } = params;

  const repo = await getPublicRepositoryCached(owner, name);
  if (!repo) {
    return {
      title: 'Repository Not Found | GitRanked',
    };
  }

  const title = `${repo.full_name} - GitHub Analytics & Insights | GitRanked`;
  const description = repo.description 
    ? `View engineering metrics, contributor analytics, and PR review insights for ${repo.full_name}. ${repo.description}`
    : `Deep GitHub analytics, code quality metrics, and contributor insights for ${repo.full_name}.`;
  const path = `/github/${owner}/${name}`;

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: path,
      images: [
        {
          url: '/opengraph-image.png',
          width: 1200,
          height: 630,
          alt: 'GitRanked dashboard overview',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/opengraph-image.png'],
    }
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
