"use client";
import { useSearchParams } from "next/navigation";

export default function ConnectPage() {
  const sp = useSearchParams();
  const ok = sp.get("ok");
  const realmId = sp.get("realmId");

  return (
    <main>
      <h1>QuickBooks Connect</h1>
      {ok ? (
        <p>✅ Redirect worked. realmId: {realmId || "(none)"} (Next step: token exchange + store connection)</p>
      ) : (
        <p>Not connected yet.</p>
      )}
      <p><a href="/">Back</a></p>
    </main>
  );
}
