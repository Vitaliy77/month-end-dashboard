"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { listOrgs } from "@/lib/api";

export type OrgPeriodState = {
  orgId: string;
  orgName: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
};

type Ctx = {
  state: OrgPeriodState;
  setState: (patch: Partial<OrgPeriodState>) => void;
  // Convenience: build links that preserve current org/period
  withParams: (
    href: string,
    extra?: Partial<Pick<OrgPeriodState, "orgId" | "from" | "to">>
  ) => string;
};

const DEFAULT_STATE: OrgPeriodState = {
  orgId: "",
  orgName: "",
  from: "2025-12-01",
  to: "2025-12-31",
};

const STORAGE_KEY = "mec_org_period_v1";

const OrgPeriodContext = createContext<Ctx | null>(null);

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    // Guard against extremely large strings that might indicate corruption
    if (s.length > 100000) {
      console.warn("[OrgPeriodProvider] localStorage value too large, clearing:", s.length);
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
      return null;
    }
    return JSON.parse(s) as T;
  } catch (e) {
    // If parsing fails, clear corrupted data
    console.warn("[OrgPeriodProvider] Failed to parse localStorage, clearing:", e);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    return null;
  }
}

export function OrgPeriodProvider({ children }: { children: React.ReactNode }) {
  const sp = useSearchParams();

  const [state, _setState] = useState<OrgPeriodState>(DEFAULT_STATE);

  // Prevent “defaults overwrite saved” on first mount
  const hydratedRef = useRef(false);

  // Helper: read orgId/from/to from URL (orgName is not in URL)
  function readUrlPatch() {
    const urlOrgId = sp.get("orgId") || "";
    const urlFrom = sp.get("from") || "";
    const urlTo = sp.get("to") || "";

    const patch: Partial<OrgPeriodState> = {};
    if (urlOrgId) patch.orgId = urlOrgId;
    if (urlFrom) patch.from = urlFrom;
    if (urlTo) patch.to = urlTo;

    return patch;
  }

  // 1) On first mount: load orgs from API and initialize state
  useEffect(() => {
    (async () => {
      const saved = safeJsonParse<OrgPeriodState>(localStorage.getItem(STORAGE_KEY));
      const urlPatch = readUrlPatch();

      // Load orgs from API
      let orgs: Array<{ id: string; name: string }> = [];
      try {
        const r = await listOrgs();
        orgs = (r?.orgs ?? []) as Array<{ id: string; name: string }>;
      } catch (e) {
        console.error("Failed to load orgs:", e);
      }

      // Determine initial orgId
      let initialOrgId = "";
      let initialOrgName = "";

      // Priority: URL params > saved (if still valid) > first org > empty
      if (urlPatch.orgId) {
        initialOrgId = urlPatch.orgId;
        const org = orgs.find((o) => o.id === initialOrgId);
        initialOrgName = org?.name ?? saved?.orgName ?? "";
      } else if (saved?.orgId) {
        // Check if saved orgId still exists in the list
        const org = orgs.find((o) => o.id === saved.orgId);
        if (org) {
          initialOrgId = saved.orgId;
          initialOrgName = org.name;
        } else if (orgs.length > 0) {
          // Saved org doesn't exist, use first available
          initialOrgId = orgs[0].id;
          initialOrgName = orgs[0].name;
        }
        // else: no orgs, keep empty
      } else if (orgs.length > 0) {
        // No saved org, use first available
        initialOrgId = orgs[0].id;
        initialOrgName = orgs[0].name;
      }
      // else: no orgs, keep empty (user needs to create one)

      const next: OrgPeriodState = {
        ...DEFAULT_STATE,
        orgId: initialOrgId,
        orgName: initialOrgName,
        from: urlPatch.from || saved?.from || DEFAULT_STATE.from,
        to: urlPatch.to || saved?.to || DEFAULT_STATE.to,
      };

      _setState(next);
      hydratedRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only once

  // 2) Whenever URL params change (navigation across tabs), patch orgId/from/to
  //    Do NOT wipe orgName.
  useEffect(() => {
    if (!hydratedRef.current) return;

    const urlPatch = readUrlPatch();
    if (!urlPatch.orgId && !urlPatch.from && !urlPatch.to) return;

    _setState((prev) => {
      const next: OrgPeriodState = {
        ...prev,
        ...urlPatch,
        orgName: prev.orgName, // protect orgName
      };

      // Avoid useless state updates
      if (
        next.orgId === prev.orgId &&
        next.from === prev.from &&
        next.to === prev.to
      ) {
        return prev;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]); // useSearchParams updates when query changes

  // 3) Persist to localStorage AFTER hydration
  useEffect(() => {
    if (!hydratedRef.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setState = (patch: Partial<OrgPeriodState>) => {
    _setState((prev) => ({ ...prev, ...patch }));
  };

  const withParams = (
    href: string,
    extra?: Partial<Pick<OrgPeriodState, "orgId" | "from" | "to">>
  ) => {
    const u = new URL(href, "http://local"); // base ignored
    const orgId = extra?.orgId ?? state.orgId;
    const from = extra?.from ?? state.from;
    const to = extra?.to ?? state.to;

    if (orgId) u.searchParams.set("orgId", orgId);
    if (from) u.searchParams.set("from", from);
    if (to) u.searchParams.set("to", to);

    return u.pathname + "?" + u.searchParams.toString();
  };

  const value = useMemo<Ctx>(() => ({ state, setState, withParams }), [state]);

  return <OrgPeriodContext.Provider value={value}>{children}</OrgPeriodContext.Provider>;
}

export function useOrgPeriod() {
  const ctx = useContext(OrgPeriodContext);
  if (!ctx) throw new Error("useOrgPeriod must be used within OrgPeriodProvider");
  return ctx;
}
