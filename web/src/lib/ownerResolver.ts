// web/src/lib/ownerResolver.ts
// Resolves account ownership for findings based on account ownership rules

import type { AccountOwner } from "@/lib/api";
import type { Finding } from "@/lib/api";

export type ResolvedOwner = {
  owner_name: string;
  owner_email: string;
  owner_role?: string;
  source: "rule" | "account" | "none";
};

/**
 * Check if an account type is considered P&L (Profit & Loss).
 * Treats expenses and income as P&L for ownership matching.
 */
function isPnLType(type?: string): boolean {
  return (
    type === "pnl" ||
    type === "income" ||
    type === "expense" ||
    type === "expenses"
  );
}

/**
 * Find the best matching account owner for a finding.
 * 
 * Matching logic:
 * - Account type matching: P&L owners match income/expense findings; BS/TB use strict matching
 * - If rule has "Account Name Contains", match substring against finding account path/name (case-insensitive, normalized)
 * - If rule has account number, match that too when available
 * - Pick the most specific match (longest "contains" string wins)
 */
export function resolveOwnerForFinding(
  finding: Finding,
  accountOwners: AccountOwner[]
): ResolvedOwner | null {
  if (!accountOwners || accountOwners.length === 0) {
    return null;
  }

  // If finding already has explicit owner from rule, use that
  if (finding.owner_name || finding.owner_email) {
    return {
      owner_name: finding.owner_name || "",
      owner_email: finding.owner_email || "",
      owner_role: finding.owner_role,
      source: "rule",
    };
  }

  // Extract account information from finding
  const accountPath = finding.meta?.account_path || finding.meta?.account_name || "";
  const accountName = Array.isArray(accountPath) 
    ? accountPath.join(" / ") 
    : String(accountPath || "");
  const accountNumber = finding.meta?.account_number || finding.meta?.account_id || "";
  const accountType = finding.meta?.account_type || "pnl"; // Default to pnl

  // Find matching owners
  const candidates: Array<{ owner: AccountOwner; specificity: number }> = [];

  for (const owner of accountOwners) {
    if (!owner.enabled) continue;

    // Check account type match
    // P&L owners match income/expense findings; BS/TB use strict matching
    if (owner.account_type) {
      if (owner.account_type === "pnl") {
        if (!isPnLType(accountType)) {
          continue;
        }
      } else {
        if (owner.account_type !== accountType) {
          continue;
        }
      }
    }

    let matches = false;
    let specificity = 0;

    // Match by account number (highest specificity)
    if (accountNumber && owner.account_number && owner.account_number === accountNumber) {
      matches = true;
      specificity = 1000; // High priority
    }

    // Match by account name contains (specificity = length of contains string)
    // Normalize strings to prevent silent failures due to capitalization, separators, whitespace
    if (owner.account_name_contains) {
      const haystack = (accountName || "").toLowerCase().trim();
      const needle = (owner.account_name_contains || "").toLowerCase().trim();
      if (needle && haystack.includes(needle)) {
        matches = true;
        specificity = Math.max(specificity, needle.length);
      }
    }

    if (matches) {
      candidates.push({ owner, specificity });
    }
  }

  // Pick the most specific match
  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.specificity - a.specificity);
  const best = candidates[0].owner;

  return {
    owner_name: best.owner_name || "",
    owner_email: best.owner_email || "",
    owner_role: best.owner_role,
    source: "account",
  };
}

/**
 * Resolve owners for multiple findings in batch.
 */
export function resolveOwnersForFindings(
  findings: Finding[],
  accountOwners: AccountOwner[]
): Map<string, ResolvedOwner | null> {
  const result = new Map<string, ResolvedOwner | null>();

  for (const finding of findings) {
    const key = finding.id || `${finding.ruleId}-${finding.title}`;
    result.set(key, resolveOwnerForFinding(finding, accountOwners));
  }

  return result;
}

