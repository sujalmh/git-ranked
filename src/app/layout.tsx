import type { Metadata } from "next";
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
      <body className="bg-zinc-950 text-zinc-50 antialiased min-h-screen selection:bg-indigo-500/30">
        {children}
      </body>
    </html>
  );
}
