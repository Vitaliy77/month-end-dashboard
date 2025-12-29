import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { OrgPeriodProvider } from "@/components/OrgPeriodProvider";
import TopBar from "@/components/TopBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Month-End Checker",
  description: "Month-End review tool for QuickBooks Online",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="notebook-plane" />

        {/* Suspense boundary required because OrgPeriodProvider uses useSearchParams() */}
        <Suspense fallback={<div className="p-6">Loading…</div>}>
          <OrgPeriodProvider>
            <TopBar />
            {children}
          </OrgPeriodProvider>
        </Suspense>
      </body>
    </html>
  );
}
