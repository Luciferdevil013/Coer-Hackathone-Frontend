import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui";
import { WorkspaceProvider } from "@/components/workspace";

const instrument = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

export const metadata: Metadata = {
  title: "DataGuardian AI",
  description: "AI-powered data lifecycle management: know what to keep, clean, archive, secure or delete.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions (Storylane, Grammarly, ...) add classes/attributes to <html>/<body> before
    // hydration; suppressHydrationWarning ignores attribute diffs on these two elements only, not their children.
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${instrument.variable}`} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <WorkspaceProvider>
          <ToastProvider>{children}</ToastProvider>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
