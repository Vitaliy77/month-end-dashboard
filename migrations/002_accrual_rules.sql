-- Migration: Add Accrual Rules table
-- Run this in your Supabase SQL editor or PostgreSQL database

CREATE TABLE IF NOT EXISTS accrual_rules (
  org_id TEXT PRIMARY KEY,
  lookback_months INTEGER NOT NULL DEFAULT 6,
  min_amount NUMERIC NOT NULL DEFAULT 50,
  confidence_threshold NUMERIC NOT NULL DEFAULT 0.7,
  min_recurrence_count INTEGER NOT NULL DEFAULT 3,
  excluded_accounts TEXT[] DEFAULT ARRAY[]::TEXT[],
  excluded_vendors TEXT[] DEFAULT ARRAY[]::TEXT[],
  include_accounts TEXT[] DEFAULT ARRAY[]::TEXT[],
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accrual_rules_org_id ON accrual_rules(org_id);

