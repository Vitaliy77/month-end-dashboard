// api/src/recon/csvParser.ts
// Simple CSV parser for bank/CC statement uploads

export type ParsedLine = {
  postedDate: string; // YYYY-MM-DD
  description: string;
  amount: number; // signed: debits negative, credits positive
  hasReceipt?: boolean; // CC only
};

/**
 * Parse CSV content into statement lines
 * Supports:
 * - Bank: date, description, amount
 * - CC: date, merchant/description, amount, has_receipt (optional)
 */
export function parseCSV(
  csvContent: string,
  kind: "bank" | "credit_card"
): ParsedLine[] {
  const lines = csvContent.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Try to detect header row (first line might be headers)
  let startIndex = 0;
  const firstLine = lines[0].toLowerCase();
  if (firstLine.includes("date") || firstLine.includes("description") || firstLine.includes("amount")) {
    startIndex = 1; // Skip header
  }

  const results: ParsedLine[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Simple CSV parsing: split by comma, handle quoted fields
    const fields = parseCSVLine(line);

    if (fields.length < 3) continue; // Need at least date, description, amount

    try {
      const postedDate = normalizeDate(fields[0]);
      const description = fields[1]?.trim() || "";
      const amount = parseAmount(fields[2]);

      if (!postedDate || !description || amount === null) {
        continue; // Skip invalid rows
      }

      const parsed: ParsedLine = {
        postedDate,
        description,
        amount,
      };

      // CC: check for receipt flag (4th column or in description)
      if (kind === "credit_card") {
        if (fields[3]?.toLowerCase() === "true" || fields[3]?.toLowerCase() === "yes") {
          parsed.hasReceipt = true;
        } else if (fields[3]?.toLowerCase() === "false" || fields[3]?.toLowerCase() === "no") {
          parsed.hasReceipt = false;
        }
      }

      results.push(parsed);
    } catch (e) {
      console.warn(`Skipping invalid CSV line ${i + 1}: ${line}`, e);
      continue;
    }
  }

  return results;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // Field separator
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  // Add last field
  fields.push(current.trim());

  return fields;
}

/**
 * Normalize date to YYYY-MM-DD format
 * Supports: MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY, etc.
 */
function normalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Remove quotes if present
  const cleaned = dateStr.replace(/^["']|["']$/g, "").trim();

  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // Try MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, part1, part2, year] = slashMatch;
    // Assume MM/DD/YYYY (US format)
    const month = part1.padStart(2, "0");
    const day = part2.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Try parsing as Date
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Parse amount: support $, commas, parentheses for negatives
 * Returns signed number: debits negative, credits positive
 */
function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;

  // Remove quotes if present
  const cleaned = amountStr.replace(/^["']|["']$/g, "").trim();

  // Check for negative (parentheses or minus sign)
  const isNegative = /^\(/.test(cleaned) || cleaned.startsWith("-");

  // Remove currency symbols, commas, parentheses
  const numericStr = cleaned.replace(/[(),$]/g, "").replace(/,/g, "").trim();

  const num = Number(numericStr);
  if (!Number.isFinite(num)) return null;

  return isNegative ? -Math.abs(num) : Math.abs(num);
}

