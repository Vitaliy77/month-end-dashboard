"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ConnectPage() {
  const [params, setParams] = useState<{ ok?: string; orgId?: string; realmId?: string }>({});

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setParams({
      ok: sp.get("ok") ?? undefined,
      orgId: sp.get("orgId") ?? undefined,
      realmId: sp.get("realmId") ?? undefined,
    });
  }, []);

  const ok = params.ok === "1";

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>QuickBooks Connection</h1>

      <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div style={{ fontWeight: 600 }}>Status</div>
        <div style={{ marginTop: 6 }}>
          {ok ? "Connected ✅" : "Not connected (or missing ok=1) ❌"}
        </div>

        <div style={{ marginTop: 10, fontSize: 14 }}>
          <div>
            <b>orgId:</b> {params.orgId ?? "—"}
          </div>
          <div>
            <b>realmId:</b> {params.realmId ?? "—"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href="/"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #333",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          Back to Home
        </Link>

        {params.orgId && (
          <Link
            href={`/?orgId=${encodeURIComponent(params.orgId)}`}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #333",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            Use this orgId on Home
          </Link>
        )}
      </div>
    </main>
  );
}
