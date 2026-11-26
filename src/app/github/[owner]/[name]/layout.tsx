import { Metadata } from 'next';
import { getPublicRepositoryCached } from '@/lib/github-api';
import { getPublicRepoId } from '@/lib/repo-access';
import { getPublicRepoAnalysis, hasRenderablePublicAnalysis } from '@/lib/analysis';

export async function generateMetadata(
  props: { params: Promise<{ owner: string; name: string }> }
): Promise<Metadata> {
  const params = await props.params;
  const { owner, name } = params;

  const repo = await getPublicRepositoryCached(owner, name);
  if (!repo) {
    return {
      title: 'Repository Not Found',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = `${repo.full_name} - GitHub Analytics & Insights`;
  const description = repo.description
    ? `View engineering metrics, contributor analytics, and PR review insights for ${repo.full_name}. ${repo.description}`
    : `Deep GitHub analytics, code quality metrics, and contributor insights for ${repo.full_name}.`;
  const path = `/github/${owner}/${name}`;

  // Only pages with real analysis content should enter the index. Placeholder
  // pages for tracked-but-unanalysed repos stay crawlable (follow) but noindex.
  const repoId = await getPublicRepoId(owner, name);
  let indexable = false;
  if (repoId !== null) {
    const analysis = await getPublicRepoAnalysis(repoId);
    indexable = analysis.isAnalysed || hasRenderablePublicAnalysis(analysis);
  }

  return {
    title,
    description,
    robots: {
      index: indexable,
      follow: true,
    },
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
