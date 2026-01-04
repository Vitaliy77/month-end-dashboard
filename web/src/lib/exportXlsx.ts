// web/src/lib/exportXlsx.ts
// Client-side Excel export utilities using xlsx

import * as XLSX from "xlsx";

/**
 * Export an array of row objects to an Excel file
 * @param filename - Name of the file (without .xlsx extension)
 * @param sheetName - Name of the worksheet
 * @param rows - Array of objects where keys are column names and values are cell values
 */
export function exportRowsToXlsx(
  filename: string,
  sheetName: string,
  rows: Record<string, any>[]
): void {
  if (!rows || rows.length === 0) {
    console.warn("[exportXlsx] No rows to export");
    return;
  }

  try {
    // Create a worksheet from the rows
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Create a workbook and add the worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Write the file
    const fileName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  } catch (error) {
    console.error("[exportXlsx] Error exporting to Excel:", error);
    alert(`Failed to export Excel file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

