-- Migration: Add Accruals module tables
-- Run this in your Supabase SQL editor or PostgreSQL database

-- Create accrual_candidates table
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
);

-- Create accrual_approvals table
CREATE TABLE IF NOT EXISTS accrual_approvals (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  approved_by TEXT,
  decision TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (candidate_id) REFERENCES accrual_candidates(id) ON DELETE CASCADE
);

-- Create qbo_postings table
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
);

-- Create indexes for accruals
CREATE INDEX IF NOT EXISTS idx_accrual_candidates_org_period 
ON accrual_candidates(org_id, period_from_date, period_to_date);

CREATE INDEX IF NOT EXISTS idx_accrual_candidates_status 
ON accrual_candidates(status);

CREATE INDEX IF NOT EXISTS idx_qbo_postings_candidate 
ON qbo_postings(candidate_id);

