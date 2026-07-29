import type { Metadata } from "next";
import "./globals.css";
import { BriefingProvider } from "./briefing-context";

export const metadata: Metadata = {
  title: "Legal Opposition Summarizer",
  description: "AI-powered legal opposition summarization and briefing tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <BriefingProvider>{children}</BriefingProvider>
      </body>
    </html>
  );
}
