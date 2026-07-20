import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitRanked - Code Analysis & Review Board",
  description: "AI-powered repository analysis and contributor insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3467317810690972"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body className="bg-black text-zinc-50 antialiased min-h-screen selection:bg-indigo-500/30">
        {children}
      </body>
    </html>
  );
}
