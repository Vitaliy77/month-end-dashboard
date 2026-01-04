// api/src/db/schema.ts
import { q } from "../db.js";

export async function initSchema() {
  try {
    // Create orgs table
    await q(`
      CREATE TABLE IF NOT EXISTS orgs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create oauth_states table
    await q(`
      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create qbo_connections table
    await q(`
      CREATE TABLE IF NOT EXISTS qbo_connections (
        org_id TEXT PRIMARY KEY,
        realm_id TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        refresh_expires_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create org_rules table (this is also done in rulesStore, but ensuring it exists here too)
    await q(`
      CREATE TABLE IF NOT EXISTS org_rules (
        org_id TEXT PRIMARY KEY,
        rules_json TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create org_account_owners table
    await q(`
      CREATE TABLE IF NOT EXISTS org_account_owners (
        org_id TEXT PRIMARY KEY,
        owners_json TEXT NOT NULL DEFAULT '[]',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create accrual_candidates table
    await q(`
      CREATE TABLE IF NOT EXISTS accrual_candidates (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        period_from_date TEXT NOT NULL,
        period_to_date TEXT NOT NULL,
        vendor_name TEXT,
        account_id TEXT,
        account_name TEXT,
        expected_amount NUMERIC NOT NULL,
        confidence_score NUMERIC NOT NULL,
        explanation_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_candidate UNIQUE(org_id, period_from_date, period_to_date, account_id, vendor_name)
      )
    `);

    // Create accrual_approvals table
    await q(`
      CREATE TABLE IF NOT EXISTS accrual_approvals (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        approved_by TEXT,
        decision TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (candidate_id) REFERENCES accrual_candidates(id) ON DELETE CASCADE
      )
    `);

    // Create qbo_postings table
    await q(`
      CREATE TABLE IF NOT EXISTS qbo_postings (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        journal_entry_id TEXT,
        posting_status TEXT NOT NULL,
        error_message TEXT,
        posted_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (candidate_id) REFERENCES accrual_candidates(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for accruals
    await q(`
      CREATE INDEX IF NOT EXISTS idx_accrual_candidates_org_period 
      ON accrual_candidates(org_id, period_from_date, period_to_date)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS idx_accrual_candidates_status 
      ON accrual_candidates(status)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS idx_qbo_postings_candidate 
      ON qbo_postings(candidate_id)
    `);

    // Create accrual_rules table
    await q(`
      CREATE TABLE IF NOT EXISTS accrual_rules (
        org_id TEXT PRIMARY KEY,
        lookback_months INTEGER NOT NULL DEFAULT 6,
        min_amount NUMERIC NOT NULL DEFAULT 50,
        confidence_threshold NUMERIC NOT NULL DEFAULT 0.7,
        min_recurrence_count INTEGER NOT NULL DEFAULT 3,
        excluded_accounts TEXT[] DEFAULT ARRAY[]::TEXT[],
        excluded_vendors TEXT[] DEFAULT ARRAY[]::TEXT[],
        include_accounts TEXT[] DEFAULT ARRAY[]::TEXT[],
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS idx_accrual_rules_org_id ON accrual_rules(org_id)`);

    // === Reconciliation tables ===
    // recon_statements: uploaded bank/CC statements
    await q(`
      CREATE TABLE IF NOT EXISTS recon_statements (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('bank', 'credit_card')),
        account_name TEXT,
        account_last4 TEXT,
        period_from DATE NOT NULL,
        period_to DATE NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        source_filename TEXT NOT NULL,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // recon_statement_lines: individual transactions from statements
    await q(`
      CREATE TABLE IF NOT EXISTS recon_statement_lines (
        id TEXT PRIMARY KEY,
        statement_id TEXT NOT NULL,
        posted_date DATE NOT NULL,
        description TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        unique_key TEXT NOT NULL UNIQUE,
        match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'ambiguous', 'ignored')),
        matched_qbo_txn_id TEXT,
        match_score NUMERIC,
        has_receipt BOOLEAN NOT NULL DEFAULT false,
        receipt_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY (statement_id) REFERENCES recon_statements(id) ON DELETE CASCADE
      )
    `);

    // Indexes for reconciliation tables
    await q(`
      CREATE INDEX IF NOT EXISTS idx_recon_statements_org_kind_period 
      ON recon_statements(org_id, kind, period_from, period_to)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS idx_recon_statement_lines_statement 
      ON recon_statement_lines(statement_id)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS idx_recon_statement_lines_match_status 
      ON recon_statement_lines(match_status)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS idx_recon_statement_lines_posted_date 
      ON recon_statement_lines(posted_date)
    `);

    console.log("Database schema initialized successfully");
  } catch (error: any) {
    // Check if error is due to table already existing (PostgreSQL specific)
    if (error?.code === "42P07" || error?.message?.includes("already exists")) {
      console.log("Database tables already exist, skipping schema creation");
    } else {
      console.error("Failed to initialize database schema:", error);
      throw error;
    }
  }
}

