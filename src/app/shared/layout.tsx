import type { Metadata } from 'next';

// Share links are unguessable, read-only views. They should stay out of search
// results even though they render the same dashboard as a public repo page.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
