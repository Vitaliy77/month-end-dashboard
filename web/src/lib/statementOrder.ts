// web/src/lib/statementOrder.ts
// GAAP ordering for financial statements

export type StatementType = "bs" | "pnl" | "cf";

/**
 * Normalize a label for comparison (uppercase, trim, remove common prefixes/suffixes)
 */
export function normalizeTopLabel(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/^(TOTAL|NET)\s+/i, "") // Remove "Total" or "Net" prefix
    .replace(/\s+(TOTAL|NET)$/i, "") // Remove "Total" or "Net" suffix
    .trim();
}

/**
 * Get ordering priority for top-level sections in Balance Sheet
 */
function getBsOrder(label: string): number {
  const normalized = normalizeTopLabel(label);
  
  // Assets first
  if (normalized.includes("ASSET") && !normalized.includes("LIABILIT") && !normalized.includes("EQUITY")) {
    return 1;
  }
  
  // Liabilities and Equity second
  if (normalized.includes("LIABILIT") || normalized.includes("EQUITY")) {
    return 2;
  }
  
  // Default: sort alphabetically after known sections
  return 100;
}

/**
 * Get ordering priority for top-level sections in P&L
 */
function getPnlOrder(label: string): number {
  const normalized = normalizeTopLabel(label);
  
  // 1. Income / Revenue / Sales
  if (normalized.includes("INCOME") && !normalized.includes("NET") && !normalized.includes("OPERATING") && !normalized.includes("OTHER")) {
    return 1;
  }
  if (normalized.includes("REVENUE") || normalized.includes("SALES")) {
    return 1;
  }
  
  // 2. Cost of Goods Sold
  if (normalized.includes("COST") || normalized.includes("COGS") || (normalized.includes("GOODS") && normalized.includes("SOLD"))) {
    return 2;
  }
  
  // 3. Gross Profit (computed, will be inserted)
  if (normalized.includes("GROSS") && normalized.includes("PROFIT")) {
    return 3;
  }
  
  // 4. Operating Expenses
  if (normalized.includes("OPERATING") && normalized.includes("EXPENSE")) {
    return 4;
  }
  if (normalized.includes("EXPENSE") && !normalized.includes("OTHER") && !normalized.includes("COST")) {
    return 4;
  }
  
  // 5. Operating Income (computed, will be inserted)
  if (normalized.includes("OPERATING") && (normalized.includes("INCOME") || normalized.includes("PROFIT"))) {
    return 5;
  }
  
  // 6. Other Income/Expense
  if (normalized.includes("OTHER")) {
    return 6;
  }
  
  // 7. Net Income (computed, will be inserted)
  if (normalized.includes("NET") && (normalized.includes("INCOME") || normalized.includes("PROFIT"))) {
    return 7;
  }
  
  // Default: sort alphabetically after known sections
  return 100;
}

/**
 * Get ordering priority for top-level sections in Cash Flow
 */
function getCfOrder(label: string): number {
  const normalized = normalizeTopLabel(label);
  
  // 1. Operating Activities
  if (normalized.includes("OPERATING")) {
    return 1;
  }
  
  // 2. Investing Activities
  if (normalized.includes("INVESTING")) {
    return 2;
  }
  
  // 3. Financing Activities
  if (normalized.includes("FINANCING")) {
    return 3;
  }
  
  // 4. Net Increase/Decrease in Cash
  if (normalized.includes("NET") && (normalized.includes("INCREASE") || normalized.includes("DECREASE"))) {
    return 4;
  }
  
  // 5. Cash at Beginning
  if (normalized.includes("BEGINNING") || normalized.includes("START")) {
    return 5;
  }
  
  // 6. Cash at End
  if (normalized.includes("END") && !normalized.includes("DECREASE")) {
    return 6;
  }
  
  // Default: sort alphabetically after known sections
  return 100;
}

/**
 * Get ordering priority for a top-level section label based on statement type
 */
export function getTopLevelOrder(statementType: StatementType, label: string): number {
  switch (statementType) {
    case "bs":
      return getBsOrder(label);
    case "pnl":
      return getPnlOrder(label);
    case "cf":
      return getCfOrder(label);
    default:
      return 100;
  }
}

/**
 * Check if a label matches a known P&L section for computed row insertion
 */
export function getPnlSectionType(label: string): "income" | "cogs" | "expenses" | "other" | null {
  const normalized = normalizeTopLabel(label);
  
  if (normalized.includes("INCOME") && !normalized.includes("NET") && !normalized.includes("OPERATING") && !normalized.includes("OTHER")) {
    return "income";
  }
  if (normalized.includes("REVENUE") || normalized.includes("SALES")) {
    return "income";
  }
  
  if (normalized.includes("COST") || normalized.includes("COGS") || (normalized.includes("GOODS") && normalized.includes("SOLD"))) {
    return "cogs";
  }
  
  if (normalized.includes("OTHER")) {
    return "other";
  }
  
  if (normalized.includes("EXPENSE") && !normalized.includes("OTHER")) {
    return "expenses";
  }
  
  return null;
}

