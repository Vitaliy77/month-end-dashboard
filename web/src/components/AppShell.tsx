"use client";

import TopBar from "@/components/TopBar";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}

