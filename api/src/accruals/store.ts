// api/src/accruals/store.ts
import { q } from "../db.js";
import crypto from "crypto";

export type AccrualCandidateRow = {
  id: string;
  org_id: string;
  period_from_date: string;
  period_to_date: string;
  vendor_name: string | null;
  account_id: string;
  account_name: string;
  expected_amount: number;
  confidence_score: number;
  explanation_json: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AccrualApprovalRow = {
  id: string;
  candidate_id: string;
  org_id: string;
  approved_by: string | null;
  decision: string;
  notes: string | null;
  created_at: string;
};

export type QboPostingRow = {
  id: string;
  candidate_id: string;
  org_id: string;
  journal_entry_id: string | null;
  posting_status: string;
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function saveAccrualCandidates(
  orgId: string,
  periodFrom: string,
  periodTo: string,
  candidates: Array<{
    vendorName: string | null;
    accountId: string;
    accountName: string;
    expectedAmount: number;
    confidenceScore: number;
    explanation: any;
  }>
): Promise<void> {
  // Delete existing candidates for this org/period
  await q(
    `DELETE FROM accrual_candidates 
     WHERE org_id = $1 AND period_from_date = $2 AND period_to_date = $3`,
    [orgId, periodFrom, periodTo]
  );

  // Insert new candidates
  for (const cand of candidates) {
    await q(
      `INSERT INTO accrual_candidates 
       (id, org_id, period_from_date, period_to_date, vendor_name, account_id, account_name, 
        expected_amount, confidence_score, explanation_json, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
       ON CONFLICT (org_id, period_from_date, period_to_date, account_id, vendor_name) 
       DO UPDATE SET
         expected_amount = EXCLUDED.expected_amount,
         confidence_score = EXCLUDED.confidence_score,
         explanation_json = EXCLUDED.explanation_json,
         updated_at = CURRENT_TIMESTAMP`,
      [
        crypto.randomUUID(),
        orgId,
        periodFrom,
        periodTo,
        cand.vendorName,
        cand.accountId,
        cand.accountName,
        cand.expectedAmount,
        cand.confidenceScore,
        JSON.stringify(cand.explanation),
      ]
    );
  }
}

export async function getAccrualCandidates(
  orgId: string,
  periodFrom: string,
  periodTo: string
): Promise<AccrualCandidateRow[]> {
  const rows = await q<AccrualCandidateRow>(
    `SELECT * FROM accrual_candidates 
     WHERE org_id = $1 AND period_from_date = $2 AND period_to_date = $3
     ORDER BY confidence_score DESC, expected_amount DESC`,
    [orgId, periodFrom, periodTo]
  );
  return rows;
}

export async function getAccrualCandidateById(
  candidateId: string,
  orgId: string
): Promise<AccrualCandidateRow | null> {
  const rows = await q<AccrualCandidateRow>(
    `SELECT * FROM accrual_candidates 
     WHERE id = $1 AND org_id = $2
     LIMIT 1`,
    [candidateId, orgId]
  );
  return rows[0] || null;
}

export async function approveAccrualCandidate(
  candidateId: string,
  orgId: string,
  decision: "approved" | "rejected",
  approvedBy?: string,
  notes?: string
): Promise<void> {
  // Update candidate status
  await q(
    `UPDATE accrual_candidates 
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND org_id = $3`,
    [decision === "approved" ? "approved" : "rejected", candidateId, orgId]
  );

  // Create approval record
  await q(
    `INSERT INTO accrual_approvals 
     (id, candidate_id, org_id, approved_by, decision, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [crypto.randomUUID(), candidateId, orgId, approvedBy || null, decision, notes || null]
  );
}

export async function getAccrualHistory(
  orgId: string,
  limit: number = 50
): Promise<Array<AccrualCandidateRow & { approval?: AccrualApprovalRow; posting?: QboPostingRow }>> {
  const candidates = await q<AccrualCandidateRow>(
    `SELECT * FROM accrual_candidates 
     WHERE org_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [orgId, limit]
  );

  // Fetch approvals and postings
  const result = [];
  for (const cand of candidates) {
    const approvals = await q<AccrualApprovalRow>(
      `SELECT * FROM accrual_approvals WHERE candidate_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [cand.id]
    );
    const postings = await q<QboPostingRow>(
      `SELECT * FROM qbo_postings WHERE candidate_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [cand.id]
    );

    result.push({
      ...cand,
      approval: approvals[0] || undefined,
      posting: postings[0] || undefined,
    });
  }

  return result;
}

export async function saveQboPosting(
  candidateId: string,
  orgId: string,
  status: "pending" | "success" | "error",
  journalEntryId?: string,
  errorMessage?: string
): Promise<void> {
  // Check if posting already exists
  const existing = await q<QboPostingRow>(
    `SELECT * FROM qbo_postings WHERE candidate_id = $1 LIMIT 1`,
    [candidateId]
  );

  if (existing.length > 0) {
    // Update existing
    await q(
      `UPDATE qbo_postings 
       SET posting_status = $1, journal_entry_id = $2, error_message = $3, 
           posted_at = CASE WHEN $1 = 'success' THEN CURRENT_TIMESTAMP ELSE posted_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE candidate_id = $4`,
      [status, journalEntryId || null, errorMessage || null, candidateId]
    );
  } else {
    // Insert new
    await q(
      `INSERT INTO qbo_postings 
       (id, candidate_id, org_id, journal_entry_id, posting_status, error_message, posted_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'success' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [
        crypto.randomUUID(),
        candidateId,
        orgId,
        journalEntryId || null,
        status,
        errorMessage || null,
      ]
    );
  }
}

export async function getQboPosting(candidateId: string): Promise<QboPostingRow | null> {
  const rows = await q<QboPostingRow>(
    `SELECT * FROM qbo_postings WHERE candidate_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [candidateId]
  );
  return rows[0] || null;
}

