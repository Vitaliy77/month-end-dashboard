// api/src/accountOwnersStore.ts
import { q } from "./db.js";

export type AccountOwner = {
  id: string;
  org_id: string;
  account_type: "tb" | "pnl" | "bs";
  account_number?: string;
  account_name_contains?: string;
  owner_name: string;
  owner_email: string;
  owner_role?: string;
  notes?: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AccountForMatching = {
  account_number?: string;
  account_name?: string;
  account_type: "tb" | "pnl" | "bs";
};

// Clean and validate an account owner
function cleanAccountOwner(x: any, orgId: string): AccountOwner | null {
  if (!x) return null;
  const id = String(x.id ?? "").trim();
  if (!id) return null;

  const accountType = String(x.account_type ?? "").toLowerCase();
  if (accountType !== "tb" && accountType !== "pnl" && accountType !== "bs") {
    return null;
  }

  const ownerName = String(x.owner_name ?? "").trim();
  const ownerEmail = String(x.owner_email ?? "").trim();
  if (!ownerName && !ownerEmail) {
    return null; // Require at least one
  }

  const accountNumber = x.account_number ? String(x.account_number).trim() : undefined;
  const accountNameContains = x.account_name_contains
    ? String(x.account_name_contains).trim()
    : undefined;

  if (!accountNumber && !accountNameContains) {
    return null; // Require at least one selector
  }

  return {
    id,
    org_id: orgId,
    account_type: accountType as "tb" | "pnl" | "bs",
    account_number: accountNumber || undefined,
    account_name_contains: accountNameContains || undefined,
    owner_name: ownerName,
    owner_email: ownerEmail,
    owner_role: x.owner_role ? String(x.owner_role) : undefined,
    notes: x.notes ? String(x.notes) : undefined,
    enabled: Boolean(x.enabled !== false), // Default true
    created_at: x.created_at ? String(x.created_at) : undefined,
    updated_at: x.updated_at ? String(x.updated_at) : undefined,
  };
}

// Normalize string for case-insensitive matching
function norm(s: string): string {
  return s.toLowerCase().trim();
}

// Resolve owner for an account
export function resolveOwnerForAccount(
  owners: AccountOwner[],
  account: AccountForMatching
): AccountOwner | null {
  if (!owners || owners.length === 0) return null;
  if (!account) return null;

  // Filter to enabled owners matching the account type
  const candidates = owners.filter((o) => {
    if (!o.enabled) return false;
    if (o.account_type !== account.account_type) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Priority 1: Exact account_number match
  if (account.account_number) {
    const numberMatch = candidates.find(
      (o) => o.account_number && norm(o.account_number) === norm(account.account_number)
    );
    if (numberMatch) return numberMatch;
  }

  // Priority 2: account_name_contains match (case-insensitive)
  if (account.account_name) {
    const accountNameNorm = norm(account.account_name);
    const nameMatches = candidates.filter((o) => {
      if (!o.account_name_contains) return false;
      const selectorNorm = norm(o.account_name_contains);
      return accountNameNorm.includes(selectorNorm) || selectorNorm.includes(accountNameNorm);
    });

    if (nameMatches.length > 0) {
      // Prefer the longest account_name_contains (most specific)
      nameMatches.sort((a, b) => {
        const aLen = (a.account_name_contains || "").length;
        const bLen = (b.account_name_contains || "").length;
        return bLen - aLen; // Descending
      });
      return nameMatches[0];
    }
  }

  return null;
}

// Get account owners for an org
export async function getAccountOwnersForOrg(orgId: string): Promise<AccountOwner[]> {
  try {
    const result = await q<{ owners_json: string }>(
      `SELECT owners_json FROM org_account_owners WHERE org_id = $1`,
      [orgId]
    );

    if (!result || result.length === 0) {
      return [];
    }

    const jsonStr = result[0].owners_json;
    if (!jsonStr) return [];

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    const cleaned = parsed
      .map((x) => cleanAccountOwner(x, orgId))
      .filter((x): x is AccountOwner => x !== null);

    return cleaned;
  } catch (e: any) {
    console.error("getAccountOwnersForOrg failed:", e);
    return [];
  }
}

// Save account owners for an org
export async function saveAccountOwnersForOrg(
  orgId: string,
  owners: AccountOwner[]
): Promise<boolean> {
  try {
    // Validate all owners
    const cleaned = owners
      .map((x) => cleanAccountOwner(x, orgId))
      .filter((x): x is AccountOwner => x !== null);

    const jsonStr = JSON.stringify(cleaned);

    // Upsert
    await q(
      `INSERT INTO org_account_owners (org_id, owners_json, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (org_id) DO UPDATE SET
         owners_json = $2,
         updated_at = CURRENT_TIMESTAMP`,
      [orgId, jsonStr]
    );

    return true;
  } catch (e: any) {
    console.error("saveAccountOwnersForOrg failed:", e);
    return false;
  }
}

