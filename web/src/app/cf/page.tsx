"use client";

import { CashFlowView } from "@/components/reports/CashFlowView";

export default function CashFlowPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-none px-3 sm:px-4 lg:px-6 py-6 space-y-4">
        <CashFlowView />
      </main>
    </div>
  );
}
