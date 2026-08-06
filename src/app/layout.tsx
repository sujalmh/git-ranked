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

export const metadata: Metadata = {
  title: "GitRanked - Code Analysis & Review Board",
  description: "AI-powered repository analysis and contributor insights",
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
        {children}
        <Analytics />
      </body>
    </html>
  );
}
