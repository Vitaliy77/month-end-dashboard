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

