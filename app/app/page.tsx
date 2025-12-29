"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080/api";

export default function Home() {
  const [orgId, setOrgId] = useState<string>("");
  const [findings, setFindings] = useState<any[]>([]);

  async function createOrg() {
    const r = await fetch(`${API}/orgs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Demo Org" })
    });
    const j = await r.json();
    setOrgId(j.orgId);
  }

  async function runChecks() {
    await fetch(`${API}/runs/month-end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId })
    });
    await loadFindings();
  }

  async function loadFindings() {
    const r = await fetch(`${API}/orgs/${orgId}/findings`);
    const j = await r.json();
    setFindings(j.findings || []);
  }

  useEffect(() => {
    if (orgId) loadFindings();
  }, [orgId]);

  return (
    <main style={{ maxWidth: 900 }}>
      <h1>Month-End Checker (Starter)</h1>
      {!orgId ? (
        <button onClick={createOrg}>Create Demo Org</button>
      ) : (
        <>
          <p><b>OrgId:</b> {orgId}</p>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <a
              href={`${API}/auth/qbo/start?orgId=${encodeURIComponent(orgId)}`}
              style={{ display: "inline-block", padding: "10px 12px", border: "1px solid #111", borderRadius: 8, textDecoration: "none" }}
            >
              Connect QuickBooks
            </a>

            <button onClick={runChecks}>Run Month-End Checks (stub)</button>
          </div>

          <h2>Findings</h2>
          {findings.length === 0 ? <p>No findings yet.</p> : (
            <ul>
              {findings.map((f) => (
                <li key={f.id}>
                  <b>{f.severity}</b> — {f.title}: {f.detail}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
