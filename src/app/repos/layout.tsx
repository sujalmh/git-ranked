import type { Metadata } from 'next';

// Private, authenticated workspace pages. They are disallowed in robots.txt and
// must never be indexed even if a crawler reaches them through a stale link.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function ReposLayout({ children }: { children: React.ReactNode }) {
  return children;
}
