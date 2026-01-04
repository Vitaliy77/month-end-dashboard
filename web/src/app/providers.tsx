"use client";

import React from "react";
import { OrgPeriodProvider } from "@/components/OrgPeriodProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <OrgPeriodProvider>{children}</OrgPeriodProvider>;
}

