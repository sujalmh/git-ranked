import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gitranked.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "GitRanked — AI-Powered GitHub Repository Analytics",
    template: "%s | GitRanked",
  },
  description:
    "AI-powered GitHub repository analytics. Classify commits, PRs and reviews with AI, score contributors across Impact, Quality, Collaboration & Consistency, and surface team health insights.",
  applicationName: "GitRanked",
  keywords: [
    "github analytics",
    "github insights",
    "developer analytics",
    "engineering metrics",
    "DORA metrics",
    "contributor scoring",
    "repository health",
    "PR review metrics",
    "code review analytics",
    "AI developer analytics",
  ],
  authors: [{ name: "GitRanked" }],
  creator: "GitRanked",
  publisher: "GitRanked",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "GitRanked",
    title: "GitRanked — AI-Powered GitHub Repository Analytics",
    description:
      "Rank contributors by true impact with AI. Score teams on Impact, Quality, Collaboration & Consistency with real GitHub repository analytics.",
    url: siteUrl,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "GitRanked dashboard overview",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "GitRanked — AI-Powered GitHub Repository Analytics",
    description:
      "Rank contributors by true impact with AI across Impact, Quality, Collaboration & Consistency.",
    images: ["/opengraph-image.png"],
  },
  other: {
    "google-adsense-account": "ca-pub-3467317810690972",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="google-adsense-account" content="ca-pub-3467317810690972" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3467317810690972"
          crossOrigin="anonymous"
        ></script>
      </head>
      <body className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} bg-black text-zinc-50 antialiased min-h-screen selection:bg-accent/30 font-sans`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "GitRanked",
                url: siteUrl,
                logo: `${siteUrl}/logo.png`,
                description:
                  "AI-powered GitHub repository analytics and contributor impact scoring for engineering teams.",
                sameAs: ["https://github.com/sujalmh/git-ranked"],
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "GitRanked",
                url: siteUrl,
                description:
                  "AI-powered GitHub repository analytics, engineering metrics, and contributor impact scoring.",
                inLanguage: "en-US",
              },
              {
                "@context": "https://schema.org",
                "@type": "SoftwareApplication",
                name: "GitRanked",
                applicationCategory: "DeveloperApplication",
                operatingSystem: "Web",
                url: siteUrl,
                description:
                  "AI-powered GitHub repository analytics that classify work, score contributor impact, and surface team health insights.",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              },
            ]),
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
