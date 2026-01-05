// api/src/accruals/qboPush.ts
import { getQboPosting, saveQboPosting } from "./store.js";
import type { AccrualCandidateRow } from "./store.js";
import { getValidQboConnection, qboApiBase } from "../lib/qboFetchForOrg.js";

/**
 * Push approved accrual candidate to QBO as a JournalEntry.
 * Idempotent: if already posted, returns existing journal entry ID.
 */
export async function pushAccrualToQbo(
  orgId: string,
  candidate: AccrualCandidateRow
): Promise<{ success: boolean; journalEntryId?: string; error?: string }> {
  // Check if already posted
  const existing = await getQboPosting(candidate.id);
  if (existing && existing.posting_status === "success" && existing.journal_entry_id) {
    console.log(`[accruals] Candidate ${candidate.id} already posted as JE ${existing.journal_entry_id}`);
    return {
      success: true,
      journalEntryId: existing.journal_entry_id,
    };
  }

  try {
    // Parse explanation to get details
    const explanation = JSON.parse(candidate.explanation_json || "{}");

    // Find liability account for credit side
    const liabilityAccountId = await findOrCreateAccrualLiabilityAccount(orgId);

    // Build JournalEntry
    // Accrual JE: Debit Expense, Credit Accrued Liabilities (or Accounts Payable)
    const journalEntry = {
      TxnDate: candidate.period_to_date,
      PrivateNote: `Accrual: ${candidate.account_name}${candidate.vendor_name ? ` - ${candidate.vendor_name}` : ""}. ${explanation.reason || ""}`,
      Line: [
        {
          Id: "0",
          Description: `Accrual for ${candidate.account_name}`,
          Amount: candidate.expected_amount,
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: {
            PostingType: "Debit",
            AccountRef: {
              value: candidate.account_id,
              name: candidate.account_name,
            },
          },
        },
        {
          Id: "1",
          Description: `Accrual liability for ${candidate.account_name}`,
          Amount: candidate.expected_amount,
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: {
            PostingType: "Credit",
            AccountRef: {
              value: liabilityAccountId,
              name: "Accrued Liabilities",
            },
          },
        },
      ],
    };

    // Post to QBO
    const conn = await getValidQboConnection(orgId);
    const base = qboApiBase(conn.realm_id);
    const url = `${base}/journalentry`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(journalEntry),
    });

    const text = await resp.text();
    let response: any = null;
    try {
      response = text ? JSON.parse(text) : null;
    } catch {
      // non-json is fine for error fallback
    }

    if (!resp.ok) {
      const msg =
        response?.Fault?.Error?.[0]?.Message ||
        response?.message ||
        `QBO request failed (${resp.status}): ${text}`;
      throw new Error(msg);
    }

    // QBO returns JournalEntry object with Id field
    const journalEntryId = response.JournalEntry?.Id || response?.Id || response?.JournalEntry?.Id;

    if (!journalEntryId) {
      const errorMsg = response?.Fault?.Error?.[0]?.Message || JSON.stringify(response);
      throw new Error(`QBO did not return journal entry ID: ${errorMsg}`);
    }

    // Save posting record
    await saveQboPosting(candidate.id, orgId, "success", journalEntryId);

    console.log(`[accruals] Successfully posted candidate ${candidate.id} as JE ${journalEntryId}`);
    return {
      success: true,
      journalEntryId,
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error(`[accruals] Failed to post candidate ${candidate.id}:`, errorMsg);

    // Save error record
    await saveQboPosting(candidate.id, orgId, "error", undefined, errorMsg);

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Find or create an Accrued Liabilities account for accrual postings.
 * TODO: Make this configurable per org, or use a standard account type.
 */
async function findOrCreateAccrualLiabilityAccount(orgId: string): Promise<string> {
  try {
    const conn = await getValidQboConnection(orgId);
    const base = qboApiBase(conn.realm_id);

    // Try to find existing Accrued Liabilities account
    const queryUrl = `${base}/query?query=SELECT * FROM Account WHERE AccountType = 'Other Current Liability' AND Name = 'Accrued Liabilities' MAXRESULTS 1`;
    const resp = await fetch(queryUrl, {
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        Accept: "application/json",
      },
    });

    if (resp.ok) {
      const accounts = await resp.json();
      if (accounts.QueryResponse?.Account?.[0]?.Id) {
        return accounts.QueryResponse.Account[0].Id;
      }
    }

    // If not found, try Accounts Payable
    const apQueryUrl = `${base}/query?query=SELECT * FROM Account WHERE AccountType = 'Accounts Payable' MAXRESULTS 1`;
    const apResp = await fetch(apQueryUrl, {
      headers: {
        Authorization: `Bearer ${conn.access_token}`,
        Accept: "application/json",
      },
    });

    if (apResp.ok) {
      const apAccounts = await apResp.json();
      if (apAccounts.QueryResponse?.Account?.[0]?.Id) {
        return apAccounts.QueryResponse.Account[0].Id;
      }
    }

    // Fallback: return a placeholder (this will fail, but provides clear error)
    throw new Error(
      "No Accrued Liabilities or Accounts Payable account found. Please create one in QBO."
    );
  } catch (error: any) {
    console.warn(`[accruals] Could not find liability account: ${error?.message}`);
    throw error;
  }
}

