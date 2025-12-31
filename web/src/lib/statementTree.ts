// web/src/lib/statementTree.ts
// Hierarchical grouping and formatting for financial statements (BS, P&L, CF)
// NOT used for Trial Balance (kept flat)

import { getTopLevelOrder, getPnlSectionType, type StatementType } from "./statementOrder";

export type StatementRow = {
  account_id?: string; // e.g., "35"
  account_path?: string; // e.g., "ASSETS / Current Assets / Bank Accounts / Checking"
  account_name?: string; // Fallback if path not available
  account_type?: string; // Fallback grouping
  [key: string]: any; // Other fields (monthly columns, Start, End, etc.)
};

export type StatementTreeNode = {
  key: string;
  label: string; // Display label (e.g., "35 - Checking" for leaf, "Bank Accounts" for group)
  level: number; // 0 = root level, 1 = first level, etc.
  isGroup: boolean; // true for group headers, false for leaf accounts
  isSubtotal: boolean; // true for computed subtotal rows
  isTotal: boolean; // true for statement-level totals
  accountId?: string; // Only for leaf accounts
  children: StatementTreeNode[];
  data?: StatementRow; // Original row data (only for leaf accounts)
  values: Record<string, number | null>; // Column values (computed for groups/totals)
  path: string[]; // Full path segments
};

export type FlattenedStatementRow = {
  key: string;
  label: string;
  level: number;
  indent: number; // px indent (level * 16)
  isGroup: boolean;
  isSubtotal: boolean;
  isTotal: boolean;
  accountId?: string;
  values: Record<string, number | null>;
  data?: StatementRow;
};

/**
 * Parse account path into segments.
 * Handles cases like "35ASSETS / Current Assets" by removing leading digits from first segment.
 * Also handles cases where account ID is concatenated like "35ASSETS" -> "ASSETS"
 */
/**
 * Parse account path into segments.
 * CRITICAL: Split on " / " (space-slash-space), trim each segment, remove numeric prefix from first segment.
 * Example: "35ASSETS / Current Assets / Bank Accounts / Checking" -> ["ASSETS", "Current Assets", "Bank Accounts", "Checking"]
 */
function parseAccountPath(path: string): string[] {
  if (!path) return [];
  // Split on " / " (space-slash-space) - this is the QBO path separator
  const segments = path.split(" / ").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return [];
  
  // Remove leading digits from first segment only (e.g., "35ASSETS" -> "ASSETS")
  let firstSegment = segments[0];
  // Remove leading digits followed by optional space (e.g., "35 ASSETS" -> "ASSETS")
  firstSegment = firstSegment.replace(/^\d+\s+/, "").trim();
  // If still has leading digits (concatenated like "35ASSETS"), remove them
  firstSegment = firstSegment.replace(/^\d+/, "").trim();
  
  return [firstSegment, ...segments.slice(1)];
}

/**
 * Extract column values from a row.
 * Looks for numeric fields (monthly columns, Start, End, etc.)
 */
function extractValues(row: StatementRow, columnKeys: string[]): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  
  for (const colKey of columnKeys) {
    const val = row[colKey];
    if (val == null) {
      values[colKey] = null;
    } else if (typeof val === "number") {
      values[colKey] = val;
    } else if (typeof val === "string") {
      // Parse QBO format: "(123.45)" for negatives, "$", commas
      const negByParens = /^\(.*\)$/.test(val);
      const cleaned = val.replace(/[(),$]/g, "").replace(/,/g, "").trim();
      if (!cleaned) {
        values[colKey] = null;
      } else {
        const n = Number(cleaned);
        values[colKey] = Number.isFinite(n) ? (negByParens ? -n : n) : null;
      }
    } else {
      values[colKey] = null;
    }
  }
  
  return values;
}

/**
 * Build a statement tree from flat rows.
 * 
 * @param rows - Array of statement rows
 * @param options - Configuration
 * @returns Root node with hierarchical children
 */
export function buildStatementTree(
  rows: StatementRow[],
  options: {
    pathAccessor: (row: StatementRow) => string; // Function to get path string
    accountIdAccessor?: (row: StatementRow) => string | undefined; // Function to get account ID
    columnKeys: string[]; // Column keys for computing totals (e.g., ["Start", "End", "Sep 2025", "Oct 2025"])
    valueAccessor?: (row: StatementRow, colKey: string) => number | null; // Optional custom value extractor
  }
): StatementTreeNode {
  const root: StatementTreeNode = {
    key: "root",
    label: "",
    level: -1,
    isGroup: true,
    isSubtotal: false,
    isTotal: false,
    children: [],
    path: [],
    values: {},
  };

  const nodeMap = new Map<string, StatementTreeNode>();
  const leafRows: Map<string, StatementRow> = new Map();

  // First pass: create all nodes and collect leaf rows
  for (const row of rows) {
    const pathStr = options.pathAccessor(row);
    const segments = parseAccountPath(pathStr);
    
    if (segments.length === 0) continue;

    const accountId = options.accountIdAccessor ? options.accountIdAccessor(row) : row.account_id;
    const isLeaf = segments.length > 0; // All rows with paths are potential leaves

    // Build path incrementally (create parent groups)
    // For path ["ASSETS", "Current Assets", "Bank Accounts", "Checking"]:
    // - Create group nodes for indices 0, 1, 2 (ASSETS, Current Assets, Bank Accounts)
    // - Create leaf node for index 3 (Checking)
    for (let i = 0; i < segments.length; i++) {
      const segmentPath = segments.slice(0, i + 1);
      const key = segmentPath.join(" / ");
      const isLeafNode = i === segments.length - 1; // Only the last segment is a leaf
      
      if (!nodeMap.has(key)) {
        const node: StatementTreeNode = {
          key,
          label: segments[i], // Group labels are just the segment name (e.g., "ASSETS", "Current Assets")
          level: i,
          isGroup: !isLeafNode, // All segments except the last are groups
          isSubtotal: false,
          isTotal: false,
          accountId: isLeafNode ? accountId : undefined, // Only leaf nodes have account IDs
          children: [],
          path: segmentPath,
          data: isLeafNode ? row : undefined, // Only leaf nodes store the original row data
          values: {},
        };
        nodeMap.set(key, node);
        
        if (isLeafNode) {
          leafRows.set(key, row);
        }
      } else if (isLeafNode) {
        // Update existing leaf node with account ID if missing
        const node = nodeMap.get(key)!;
        if (!node.accountId && accountId) {
          node.accountId = accountId;
        }
        if (!node.data) {
          node.data = row;
        }
        leafRows.set(key, row);
      }
    }
  }

  // Second pass: build parent-child relationships and set leaf labels
  for (const node of nodeMap.values()) {
    if (node.level === 0) {
      root.children.push(node);
    } else {
      const parentPath = node.path.slice(0, -1);
      const parentKey = parentPath.join(" / ");
      const parent = nodeMap.get(parentKey);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan - add to root
        root.children.push(node);
      }
    }
    
    // Format leaf node labels: "35 - Checking"
    // CRITICAL: Only format leaf nodes (not groups), use account_name from data (not path)
    // Group labels remain as segment names (e.g., "ASSETS", "Current Assets")
    if (!node.isGroup && node.accountId && node.data) {
      // Use account_name from original data, NOT the path segment
      // This ensures we get "35 - Checking" not "35 - ASSETS / Current Assets / Bank Accounts / Checking"
      const accountName = node.data.account_name || node.label;
      node.label = `${node.accountId} - ${accountName}`;
    }
    // Groups keep their segment name as label (e.g., "ASSETS", "Current Assets", "Bank Accounts")
  }

  // Third pass: compute values for leaf nodes
  const valueAccessor = options.valueAccessor || ((row: StatementRow, colKey: string) => {
    const val = row[colKey];
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const negByParens = /^\(.*\)$/.test(val);
      const cleaned = val.replace(/[(),$]/g, "").replace(/,/g, "").trim();
      if (!cleaned) return null;
      const n = Number(cleaned);
      return Number.isFinite(n) ? (negByParens ? -n : n) : null;
    }
    return null;
  });

  for (const [key, row] of leafRows) {
    const node = nodeMap.get(key);
    if (node) {
      node.values = {};
      for (const colKey of options.columnKeys) {
        node.values[colKey] = valueAccessor(row, colKey);
      }
    }
  }

  // Fourth pass: compute totals for group nodes
  computeGroupTotals(root, options.columnKeys);

  // Sort children at each level
  sortTree(root);

  return root;
}

/**
 * Recursively compute totals for group nodes by summing children.
 */
function computeGroupTotals(node: StatementTreeNode, columnKeys: string[]): void {
  if (!node.isGroup || node.children.length === 0) return;

  // First, compute totals for all children
  for (const child of node.children) {
    computeGroupTotals(child, columnKeys);
  }

  // Then sum up children values
  node.values = {};
  for (const colKey of columnKeys) {
    let sum = 0;
    for (const child of node.children) {
      const childVal = child.values?.[colKey];
      if (typeof childVal === "number" && Number.isFinite(childVal)) {
        sum += childVal;
      }
    }
    node.values[colKey] = sum;
  }
}

/**
 * Sort tree nodes: preserve natural statement order, then by account ID numeric, then by name.
 */
function sortTree(node: StatementTreeNode): void {
  if (!node.isGroup || node.children.length === 0) return;

  // Sort children
  node.children.sort((a, b) => {
    // Groups come before leaves
    if (a.isGroup !== b.isGroup) {
      return a.isGroup ? -1 : 1;
    }
    
    // For leaves, sort by account ID numeric if available
    if (!a.isGroup && !b.isGroup && a.accountId && b.accountId) {
      const aNum = Number(a.accountId);
      const bNum = Number(b.accountId);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
        return aNum - bNum;
      }
    }
    
    // Otherwise sort by label
    return a.label.localeCompare(b.label);
  });

  // Recursively sort children
  for (const child of node.children) {
    sortTree(child);
  }
}

/**
 * Flatten statement tree into display rows with subtotals.
 * 
 * @param root - Root node of the tree
 * @param options - Configuration
 * @returns Array of flattened rows ready for rendering
 */
export function flattenStatementTree(
  root: StatementTreeNode,
  options: {
    includeSubtotals?: boolean; // Add "Total X" rows after each group (default: true)
    includeStatementTotals?: boolean; // Add statement-level totals (default: true)
    indentPerLevel?: number; // Pixels per indent level (default: 16)
    statementType?: StatementType; // "bs" | "pnl" | "cf" for GAAP ordering
    columnKeys?: string[]; // Column keys for computed rows (required for P&L)
  } = {}
): FlattenedStatementRow[] {
  const {
    includeSubtotals = true,
    includeStatementTotals = true,
    indentPerLevel = 16,
    statementType,
    columnKeys = [],
  } = options;

  const result: FlattenedStatementRow[] = [];

  function traverse(node: StatementTreeNode, parentPath: string[] = []): void {
    if (node.key === "root") {
      // Sort root children by GAAP order if statementType is provided
      const sortedChildren = statementType
        ? [...node.children].sort((a, b) => {
            const orderA = getTopLevelOrder(statementType, a.label);
            const orderB = getTopLevelOrder(statementType, b.label);
            if (orderA !== orderB) return orderA - orderB;
            // Fallback to alphabetical if same priority
            return a.label.localeCompare(b.label);
          })
        : node.children;
      
      // Process root's children in sorted order
      for (const child of sortedChildren) {
        traverse(child, []);
      }
      
      // Add statement-level totals if requested (but not for P&L - we compute those separately)
      if (includeStatementTotals && node.children.length > 0 && statementType !== "pnl") {
        // Find top-level groups (Assets, Liabilities, Equity, etc.)
        for (const topLevel of sortedChildren) {
          if (topLevel.isGroup && topLevel.children.length > 0) {
            const totalRow: FlattenedStatementRow = {
              key: `${topLevel.key}#total`,
              label: `Total ${topLevel.label}`,
              level: topLevel.level,
              indent: topLevel.level * indentPerLevel,
              isGroup: false,
              isSubtotal: false,
              isTotal: true,
              values: topLevel.values || {},
            };
            result.push(totalRow);
          }
        }
      }
      return;
    }

    // CRITICAL: Emit group rows BEFORE children, leaf rows as-is
    // Add the node itself (groups AND leaves)
    const row: FlattenedStatementRow = {
      key: node.key,
      label: node.label, // Already formatted: groups = segment name, leaves = "accountId - account_name"
      level: node.level,
      indent: node.level * indentPerLevel,
      isGroup: node.isGroup, // CRITICAL: Preserve isGroup flag from tree
      isSubtotal: false,
      isTotal: false,
      accountId: node.accountId,
      values: node.values || {},
      data: node.data,
    };
    result.push(row);

    // Process children (only if this is a group with children)
    // This ensures groups are emitted BEFORE their children
    if (node.isGroup && node.children.length > 0) {
      for (const child of node.children) {
        traverse(child, [...parentPath, node.label]);
      }

      // Add subtotal row AFTER children are processed
      if (includeSubtotals && node.children.length > 0) {
        const subtotalRow: FlattenedStatementRow = {
          key: `${node.key}#subtotal`,
          label: `Total ${node.label}`,
          level: node.level,
          indent: node.level * indentPerLevel,
          isGroup: false,
          isSubtotal: true,
          isTotal: false,
          values: node.values || {},
        };
        result.push(subtotalRow);
      }
    }
  }

  traverse(root);
  
  // Post-process for P&L: add computed rows and suppress duplicate totals
  if (statementType === "pnl" && columnKeys.length > 0) {
    return postProcessPnl(result, columnKeys, indentPerLevel);
  }
  
  // Post-process for BS: make group headers non-numeric and de-duplicate totals
  if (statementType === "bs") {
    return postProcessBalanceSheetRows(result);
  }
  
  return result;
}

/**
 * Post-process P&L rows: add computed subtotals (Gross Profit, Operating Income, Net Income)
 * and suppress duplicate totals at the bottom.
 */
function postProcessPnl(
  rows: FlattenedStatementRow[],
  columnKeys: string[],
  indentPerLevel: number
): FlattenedStatementRow[] {
  const result: FlattenedStatementRow[] = [];
  
  // Track section totals by finding group nodes or subtotals
  let incomeTotal: Record<string, number | null> = {};
  let cogsTotal: Record<string, number | null> = {};
  let expensesTotal: Record<string, number | null> = {};
  let otherIncomeTotal: Record<string, number | null> = {};
  let otherExpenseTotal: Record<string, number | null> = {};
  
  // Track insertion points (index after which to insert computed rows)
  let incomeEndIndex = -1;
  let cogsEndIndex = -1;
  let expensesEndIndex = -1;
  let otherEndIndex = -1;
  
  // First pass: find section groups and subtotals
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Look for top-level groups or subtotals
    if (row.level === 0) {
      let sectionType: "income" | "cogs" | "expenses" | "other" | null = null;
      let labelToCheck = row.label;
      
      if (row.isSubtotal) {
        labelToCheck = row.label.replace(/^Total\s+/i, "").trim();
        sectionType = getPnlSectionType(labelToCheck);
      } else if (row.isGroup) {
        sectionType = getPnlSectionType(row.label);
      }
      
      if (sectionType === "income") {
        incomeTotal = { ...row.values };
        incomeEndIndex = i;
      } else if (sectionType === "cogs") {
        cogsTotal = { ...row.values };
        cogsEndIndex = i;
      } else if (sectionType === "expenses") {
        expensesTotal = { ...row.values };
        expensesEndIndex = i;
      } else if (sectionType === "other") {
        // Determine if it's income or expense by checking values
        const firstValue = Object.values(row.values).find(v => v != null);
        if (firstValue != null && firstValue > 0) {
          otherIncomeTotal = { ...row.values };
        } else {
          otherExpenseTotal = { ...row.values };
        }
        otherEndIndex = i;
      }
    }
  }
  
  // Second pass: emit rows, insert computed rows, and suppress duplicate totals
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip duplicate statement-level totals at the bottom (keep only section subtotals)
    // Check if this is a total that appears after most rows have been processed
    if (row.isTotal && row.level === 0 && i > rows.length * 0.6) {
      // This is likely a duplicate total - skip it
      continue;
    }
    
    result.push(row);
    
    // Insert Gross Profit after COGS section (after its subtotal if present, or after the group)
    if (i === cogsEndIndex && Object.keys(incomeTotal).length > 0 && Object.keys(cogsTotal).length > 0) {
      const grossProfit: FlattenedStatementRow = {
        key: "gross-profit",
        label: "Gross Profit",
        level: 0,
        indent: 0,
        isGroup: false,
        isSubtotal: true,
        isTotal: false,
        values: computeDifference(incomeTotal, cogsTotal, columnKeys),
      };
      result.push(grossProfit);
    }
    
    // Insert Operating Income after Expenses section
    if (i === expensesEndIndex && Object.keys(incomeTotal).length > 0 && Object.keys(cogsTotal).length > 0 && Object.keys(expensesTotal).length > 0) {
      const grossProfit = computeDifference(incomeTotal, cogsTotal, columnKeys);
      const operatingIncome: FlattenedStatementRow = {
        key: "operating-income",
        label: "Operating Income",
        level: 0,
        indent: 0,
        isGroup: false,
        isSubtotal: true,
        isTotal: false,
        values: computeDifference(grossProfit, expensesTotal, columnKeys),
      };
      result.push(operatingIncome);
    }
    
    // Insert Net Other Income and Net Income after Other section
    if (i === otherEndIndex && (Object.keys(otherIncomeTotal).length > 0 || Object.keys(otherExpenseTotal).length > 0)) {
      const netOther: FlattenedStatementRow = {
        key: "net-other-income",
        label: "Net Other Income",
        level: 0,
        indent: 0,
        isGroup: false,
        isSubtotal: true,
        isTotal: false,
        values: computeDifference(otherIncomeTotal, otherExpenseTotal, columnKeys),
      };
      result.push(netOther);
      
      // Compute Net Income: Operating Income + Net Other Income
      const grossProfit = computeDifference(incomeTotal, cogsTotal, columnKeys);
      const operatingIncome = computeDifference(grossProfit, expensesTotal, columnKeys);
      const netOtherIncome = computeDifference(otherIncomeTotal, otherExpenseTotal, columnKeys);
      const netIncome: FlattenedStatementRow = {
        key: "net-income",
        label: "Net Income",
        level: 0,
        indent: 0,
        isGroup: false,
        isSubtotal: false,
        isTotal: true,
        values: computeSum(operatingIncome, netOtherIncome, columnKeys),
      };
      result.push(netIncome);
    }
  }
  
  return result;
}

/**
 * Compute difference between two value sets (a - b) for each column
 */
function computeDifference(
  a: Record<string, number | null>,
  b: Record<string, number | null>,
  columnKeys: string[]
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const key of columnKeys) {
    const valA = a[key] ?? 0;
    const valB = b[key] ?? 0;
    result[key] = typeof valA === "number" && typeof valB === "number" ? valA - valB : null;
  }
  return result;
}

/**
 * Compute sum of two value sets (a + b) for each column
 */
function computeSum(
  a: Record<string, number | null>,
  b: Record<string, number | null>,
  columnKeys: string[]
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const key of columnKeys) {
    const valA = a[key] ?? 0;
    const valB = b[key] ?? 0;
    result[key] = typeof valA === "number" && typeof valB === "number" ? valA + valB : null;
  }
  return result;
}

/**
 * Post-process Balance Sheet rows: make group headers non-numeric and de-duplicate totals
 */
function postProcessBalanceSheetRows(rows: FlattenedStatementRow[]): FlattenedStatementRow[] {
  const result: FlattenedStatementRow[] = [];
  
  // Track which top-level totals we've seen (to de-duplicate)
  const seenTotals = new Set<string>();
  
  // Normalize a label for comparison (uppercase, trim, remove "Total" prefix/suffix)
  function normalizeTotalLabel(label: string): string {
    return label
      .trim()
      .toUpperCase()
      .replace(/^(TOTAL|NET)\s+/i, "")
      .replace(/\s+(TOTAL|NET)$/i, "")
      .trim();
  }
  
  for (const row of rows) {
    // Rule 1: Clear values for group header rows (non-numeric headers)
    if (row.isGroup) {
      const headerRow: FlattenedStatementRow = {
        ...row,
        values: {}, // Clear all numeric values for group headers
      };
      result.push(headerRow);
      continue;
    }
    
    // Rule 2 & 3: De-duplicate top-level totals
    if (row.isTotal || row.isSubtotal) {
      const normalizedLabel = normalizeTotalLabel(row.label);
      
      // Check if this is a top-level total we should de-duplicate
      const isTopLevelTotal = normalizedLabel === "ASSETS" || 
                              normalizedLabel === "LIABILITIES AND EQUITY" ||
                              normalizedLabel === "LIABILITIES & EQUITY";
      
      if (isTopLevelTotal && seenTotals.has(normalizedLabel)) {
        // Skip duplicate top-level totals
        continue;
      }
      
      if (isTopLevelTotal) {
        seenTotals.add(normalizedLabel);
      }
    }
    
    // All other rows (subtotals, leaf accounts) pass through unchanged
    result.push(row);
  }
  
  return result;
}

