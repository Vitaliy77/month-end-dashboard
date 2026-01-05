// api/scripts/gen_recon_csv.ts
// Generate sample CSV files for reconciliation testing

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(process.cwd(), "scripts", "output");

// Sample merchants/vendors for realistic data
const BANK_MERCHANTS = [
  "CHASE BANK DEPOSIT",
  "ACH TRANSFER FROM",
  "WIRE TRANSFER",
  "CHECK #1234",
  "PAYPAL TRANSFER",
  "VENMO PAYMENT",
  "ZELLE TRANSFER",
  "DIRECT DEPOSIT",
];

const CC_MERCHANTS = [
  "AMAZON.COM",
  "STARBUCKS STORE",
  "UBER TRIP",
  "NETFLIX",
  "SPOTIFY",
  "GOOGLE CLOUD",
  "AWS AMAZON",
  "OFFICE DEPOT",
  "FEDEX SHIPPING",
  "USPS POSTAGE",
  "AT&T WIRELESS",
  "VERIZON",
  "SHELL GAS STATION",
  "CHEVRON",
  "WHOLE FOODS",
  "TARGET",
  "WALMART",
  "COSTCO",
  "HOME DEPOT",
  "LOWES",
];

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${year}`;
}

function randomAmount(min: number, max: number, isDebit: boolean): number {
  const amount = Math.random() * (max - min) + min;
  return isDebit ? -amount : amount;
}

function generateBankStatement(from: string, to: string): string {
  const startDate = new Date(from + "T00:00:00Z");
  const endDate = new Date(to + "T00:00:00Z");

  const lines: string[] = [];
  lines.push("Date,Description,Amount");

  // Generate 50-150 transactions
  const count = Math.floor(Math.random() * 100) + 50;

  for (let i = 0; i < count; i++) {
    const date = randomDate(startDate, endDate);
    const merchant = BANK_MERCHANTS[Math.floor(Math.random() * BANK_MERCHANTS.length)];
    const isDebit = Math.random() > 0.3; // 70% debits
    const amount = randomAmount(10, 5000, isDebit);

    lines.push(`${formatDate(date)},${merchant} #${Math.floor(Math.random() * 10000)},${amount.toFixed(2)}`);
  }

  return lines.join("\n");
}

function generateCCStatement(from: string, to: string): string {
  const startDate = new Date(from + "T00:00:00Z");
  const endDate = new Date(to + "T00:00:00Z");

  const lines: string[] = [];
  lines.push("Date,Merchant,Amount,HasReceipt");

  // Generate 50-150 transactions
  const count = Math.floor(Math.random() * 100) + 50;

  for (let i = 0; i < count; i++) {
    const date = randomDate(startDate, endDate);
    const merchant = CC_MERCHANTS[Math.floor(Math.random() * CC_MERCHANTS.length)];
    const amount = randomAmount(5, 500, true); // CC charges are always debits
    const hasReceipt = Math.random() > 0.3 ? "true" : "false"; // 70% have receipts

    lines.push(`${formatDate(date)},${merchant},${amount.toFixed(2)},${hasReceipt}`);
  }

  return lines.join("\n");
}

// Generate files
const periodFrom = "2025-09-01";
const periodTo = "2025-11-30";

const bankCSV = generateBankStatement(periodFrom, periodTo);
const ccCSV = generateCCStatement(periodFrom, periodTo);

writeFileSync(join(OUTPUT_DIR, "bank_statement_sample.csv"), bankCSV);
writeFileSync(join(OUTPUT_DIR, "cc_statement_sample.csv"), ccCSV);

console.log("Generated sample CSV files:");
console.log(`  ${join(OUTPUT_DIR, "bank_statement_sample.csv")}`);
console.log(`  ${join(OUTPUT_DIR, "cc_statement_sample.csv")}`);
console.log(`\nPeriod: ${periodFrom} to ${periodTo}`);

