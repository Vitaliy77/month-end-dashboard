# Statement Tree Implementation Summary

## Overview
Implemented hierarchical grouping and formatting system for financial statements (Balance Sheet, P&L, Cash Flow). Trial Balance remains flat (unchanged).

## Files Created/Modified

### New Files
1. **`web/src/lib/statementTree.ts`**
   - `buildStatementTree()`: Builds hierarchical tree from flat rows
   - `flattenStatementTree()`: Flattens tree with subtotals for display
   - Types: `StatementRow`, `StatementTreeNode`, `FlattenedStatementRow`

2. **`web/src/components/StatementTable.tsx`**
   - Renders hierarchical statement tables with proper formatting
   - Handles indentation, subtotals, and statement-level totals

### Modified Files
1. **`web/src/app/bs/page.tsx`** ✅
   - Updated to use `buildStatementTree` and `StatementTable`
   - Removed old `buildHierarchy` / `HierarchicalReportTable` usage

2. **`web/src/app/pnl/page.tsx`** (TODO)
3. **`web/src/app/cf/page.tsx`** (TODO)

## Input Data Structure

### From QBO API (via `flattenQboRows`)
```typescript
type FlatRow = {
  path: string; // "ASSETS / Current Assets / Bank Accounts / Checking"
  label: string; // "Checking"
  accountId?: string; // "35"
  values: Record<string, number | null>; // { "Start": 1000, "End": 1500, ... }
  isGroup: boolean;
  originalNode: QboRowNode;
};
```

### Converted to StatementRow
```typescript
type StatementRow = {
  account_id?: string; // "35"
  account_path?: string; // "ASSETS / Current Assets / Bank Accounts / Checking"
  account_name?: string; // "Checking"
  [key: string]: any; // Spread values: { "Start": 1000, "End": 1500, ... }
};
```

## Tree Building Process

1. **Parse Path**: Split "ASSETS / Current Assets / Bank Accounts / Checking" into segments
2. **Build Tree**: Create nodes for each segment level
3. **Format Labels**: 
   - Leaf accounts: "35 - Checking"
   - Groups: "Bank Accounts" (no account ID)
4. **Compute Totals**: Sum children values for each group
5. **Sort**: Preserve statement order, then by account ID numeric, then by name

## Output Structure

### FlattenedStatementRow (for rendering)
```typescript
type FlattenedStatementRow = {
  key: string;
  label: string; // "35 - Checking" or "Total Bank Accounts"
  level: number; // 0, 1, 2, 3...
  indent: number; // level * 16 (px)
  isGroup: boolean;
  isSubtotal: boolean; // true for "Total X" rows
  isTotal: boolean; // true for statement-level totals
  accountId?: string; // Only for leaf accounts
  values: Record<string, number | null>;
  data?: StatementRow; // Original row data
};
```

## Example Output

For input path: "ASSETS / Current Assets / Bank Accounts / Checking" with account_id "35"

Rendered output:
```
Assets (header, level 0, bold)
  Current Assets (header, level 1, bold, indent 16px)
    Bank Accounts (header, level 2, bold, indent 32px)
      35 - Checking (leaf, level 3, normal, indent 48px)
    Total Bank Accounts (subtotal, level 2, bold, indent 32px)
  Total Current Assets (subtotal, level 1, bold, indent 16px)
Total Assets (total, level 0, bold, top border)
```

## Formatting Rules

- **Numbers**: Thousands separators, 2 decimals, negatives in parentheses
- **Indentation**: 16px per level (pl-4 increments)
- **Group Headers**: Bold, slightly larger
- **Subtotals**: Bold, top border, "Total X" label
- **Statement Totals**: Bold, top border, "Total X" label

## Next Steps

1. Update P&L page to use new system
2. Update Cash Flow page to use new system
3. Verify Trial Balance remains unchanged
4. Test all pages render correctly
