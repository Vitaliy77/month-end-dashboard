// web/src/lib/hierarchy.ts
// Utilities for building and rendering hierarchical financial report structures

export type HierarchyNode = {
  key: string;
  label: string;
  level: number;
  isGroup: boolean;
  isTotal?: boolean;
  children: HierarchyNode[];
  data?: any; // Original row data for leaf nodes
  values?: Record<string, number>; // Column values (for leafs and computed totals)
  path: string[]; // Full path segments
};

/**
 * Parse account path into segments.
 * Handles cases like "35ASSETS / Current Assets" by removing leading digits from first segment.
 */
export function parseAccountPath(path: string): string[] {
  if (!path) return [];
  const segments = path.split(" / ").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return [];
  
  // Remove leading digits from first segment only
  const firstSegment = segments[0].replace(/^\d+/, "").trim();
  return [firstSegment, ...segments.slice(1)];
}

/**
 * Build a hierarchy tree from flat rows.
 * 
 * @param rows - Array of row objects
 * @param options - Configuration
 * @returns Root node with children tree
 */
export function buildHierarchy(
  rows: any[],
  options: {
    pathAccessor: (row: any) => string; // Function to get path string from row
    valueAccessor?: (row: any, colKey: string) => number | null; // Function to get value for a column
    columns?: string[]; // Column keys for computing totals
  }
): HierarchyNode {
  const root: HierarchyNode = {
    key: "root",
    label: "",
    level: -1,
    isGroup: true,
    children: [],
    path: [],
  };

  const nodeMap = new Map<string, HierarchyNode>();

  // First pass: create all nodes
  for (const row of rows) {
    const pathStr = options.pathAccessor(row);
    const segments = parseAccountPath(pathStr);
    
    if (segments.length === 0) continue;

    // Build path incrementally
    for (let i = 0; i < segments.length; i++) {
      const segmentPath = segments.slice(0, i + 1);
      const key = segmentPath.join(" / ");
      
      if (!nodeMap.has(key)) {
        const isLeaf = i === segments.length - 1;
        const node: HierarchyNode = {
          key,
          label: segments[i],
          level: i,
          isGroup: !isLeaf,
          children: [],
          path: segmentPath,
          data: isLeaf ? row : undefined,
          values: isLeaf && options.valueAccessor
            ? Object.fromEntries(
                (options.columns || []).map((col) => [
                  col,
                  options.valueAccessor!(row, col) ?? 0,
                ])
              )
            : undefined,
        };
        nodeMap.set(key, node);
      }
    }
  }

  // Second pass: build parent-child relationships
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
  }

  // Third pass: compute totals for group nodes
  if (options.columns && options.columns.length > 0) {
    computeGroupTotals(root, options.columns);
  }

  return root;
}

/**
 * Recursively compute totals for group nodes by summing children.
 */
function computeGroupTotals(node: HierarchyNode, columns: string[]): void {
  if (!node.isGroup || node.children.length === 0) return;

  // First, compute totals for all children
  for (const child of node.children) {
    computeGroupTotals(child, columns);
  }

  // Then sum up children values
  if (!node.values) {
    node.values = {};
  }

  for (const col of columns) {
    let sum = 0;
    for (const child of node.children) {
      const childVal = child.values?.[col];
      if (typeof childVal === "number" && Number.isFinite(childVal)) {
        sum += childVal;
      }
    }
    node.values[col] = sum;
  }
}

/**
 * Flatten hierarchy tree back to array for flat view.
 */
export function flattenHierarchy(node: HierarchyNode): HierarchyNode[] {
  const result: HierarchyNode[] = [];
  
  function traverse(n: HierarchyNode) {
    if (n.key !== "root") {
      result.push(n);
    }
    for (const child of n.children) {
      traverse(child);
    }
  }
  
  traverse(node);
  return result;
}

