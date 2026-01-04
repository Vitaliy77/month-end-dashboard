// api/src/recon/store.ts
// Database operations for reconciliation

import crypto from "node:crypto";
import { q } from "../db.js";
import type { ParsedLine } from "./csvParser.js";

export type ReconStatement = {
  id: string;
  org_id: string;
  kind: "bank" | "credit_card";
  account_name?: string;
  account_last4?: string;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  currency: string;
  source_filename: string;
  uploaded_at: string;
};

export type ReconStatementLine = {
  id: string;
  statement_id: string;
  posted_date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  unique_key: string;
  match_status: "unmatched" | "matched" | "ambiguous" | "ignored";
  matched_qbo_txn_id?: string;
  match_score?: number;
  has_receipt: boolean;
  receipt_url?: string;
  created_at: string;
};

/**
 * Generate unique key for a statement line
 */
export function generateUniqueKey(
  statementId: string,
  postedDate: string,
  amount: number,
  description: string
): string {
  const input = `${statementId}|${postedDate}|${amount}|${description}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

/**
 * Create a new statement and insert lines
 */
export async function createStatement(
  orgId: string,
  kind: "bank" | "credit_card",
  periodFrom: string,
  periodTo: string,
  sourceFilename: string,
  accountName?: string,
  accountLast4?: string,
  currency: string = "USD"
): Promise<{ statementId: string }> {
  const statementId = crypto.randomUUID();

  await q(
    `INSERT INTO recon_statements 
     (id, org_id, kind, account_name, account_last4, period_from, period_to, currency, source_filename, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [statementId, orgId, kind, accountName || null, accountLast4 || null, periodFrom, periodTo, currency, sourceFilename]
  );

  return { statementId };
}

/**
 * Insert statement lines
 */
export async function insertStatementLines(
  statementId: string,
  lines: ParsedLine[]
): Promise<{ linesInserted: number }> {
  if (lines.length === 0) return { linesInserted: 0 };

  // Build batch insert
  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineId = crypto.randomUUID();
    const uniqueKey = generateUniqueKey(statementId, line.postedDate, line.amount, line.description);

    const baseIndex = i * 8;
    placeholders.push(
      `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, NOW())`
    );

    values.push(
      lineId,
      statementId,
      line.postedDate,
      line.description,
      line.amount,
      uniqueKey,
      "unmatched",
      line.hasReceipt || false
    );
  }

  const query = `
    INSERT INTO recon_statement_lines 
    (id, statement_id, posted_date, description, amount, unique_key, match_status, has_receipt, created_at)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (unique_key) DO NOTHING
  `;

  await q(query, values);

  return { linesInserted: lines.length };
}

/**
 * List statements for an org
 */
export async function listStatements(
  orgId: string,
  kind?: "bank" | "credit_card",
  periodFrom?: string,
  periodTo?: string
): Promise<ReconStatement[]> {
  let query = `SELECT * FROM recon_statements WHERE org_id = $1`;
  const params: any[] = [orgId];
  let paramIndex = 2;

  if (kind) {
    query += ` AND kind = $${paramIndex}`;
    params.push(kind);
    paramIndex++;
  }

  if (periodFrom) {
    query += ` AND period_from >= $${paramIndex}`;
    params.push(periodFrom);
    paramIndex++;
  }

  if (periodTo) {
    query += ` AND period_to <= $${paramIndex}`;
    params.push(periodTo);
    paramIndex++;
  }

  query += ` ORDER BY uploaded_at DESC`;

  return await q(query, params);
}

/**
 * Get statement with line count
 */
export async function getStatementWithCounts(statementId: string): Promise<ReconStatement & { lineCount: number }> {
  const statements = await q(
    `SELECT s.*, COUNT(l.id) as line_count
     FROM recon_statements s
     LEFT JOIN recon_statement_lines l ON l.statement_id = s.id
     WHERE s.id = $1
     GROUP BY s.id`,
    [statementId]
  );

  const stmt = statements[0];
  if (!stmt) throw new Error(`Statement ${statementId} not found`);

  return {
    ...stmt,
    lineCount: parseInt(stmt.line_count || "0", 10),
  } as any;
}

/**
 * List statement lines
 */
export async function listStatementLines(
  statementId?: string,
  status?: "unmatched" | "matched" | "ambiguous" | "ignored"
): Promise<ReconStatementLine[]> {
  let query = `SELECT * FROM recon_statement_lines WHERE 1=1`;
  const params: any[] = [];
  let paramIndex = 1;

  if (statementId) {
    query += ` AND statement_id = $${paramIndex}`;
    params.push(statementId);
    paramIndex++;
  }

  if (status) {
    query += ` AND match_status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY posted_date DESC, created_at DESC`;

  return await q(query, params);
}

/**
 * Update line match status
 */
export async function updateLineMatchStatus(
  lineId: string,
  status: "unmatched" | "matched" | "ambiguous" | "ignored",
  matchedQboTxnId?: string,
  matchScore?: number
): Promise<void> {
  await q(
    `UPDATE recon_statement_lines 
     SET match_status = $1, matched_qbo_txn_id = $2, match_score = $3
     WHERE id = $4`,
    [status, matchedQboTxnId || null, matchScore || null, lineId]
  );
}

/**
 * Update line receipt status
 */
export async function updateLineReceipt(
  lineId: string,
  hasReceipt: boolean,
  receiptUrl?: string
): Promise<void> {
  await q(
    `UPDATE recon_statement_lines 
     SET has_receipt = $1, receipt_url = $2
     WHERE id = $3`,
    [hasReceipt, receiptUrl || null, lineId]
  );
}

