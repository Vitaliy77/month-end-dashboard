// api/src/monthBuckets.ts
// Helper to compute month buckets from date range

export type MonthBucket = {
  key: string; // "2025-09"
  from: string; // "2025-09-01"
  to: string; // "2025-09-30"
};

export function monthBuckets(fromISO: string, toISO: string): MonthBucket[] {
  const from = new Date(fromISO + "T00:00:00Z");
  const to = new Date(toISO + "T23:59:59Z");

  if (from > to) {
    return [];
  }

  const buckets: MonthBucket[] = [];
  let current = new Date(from);

  while (current <= to) {
    const year = current.getUTCFullYear();
    const month = current.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;

    // First bucket: from selected start to end of that month
    if (buckets.length === 0) {
      const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
      const bucketTo = monthEnd < to ? monthEnd : to;
      buckets.push({
        key,
        from: fromISO,
        to: bucketTo.toISOString().split("T")[0],
      });
    } else {
      // Middle buckets: full months
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
      const bucketFrom = monthStart > from ? monthStart : from;
      const bucketTo = monthEnd < to ? monthEnd : to;

      buckets.push({
        key,
        from: bucketFrom.toISOString().split("T")[0],
        to: bucketTo.toISOString().split("T")[0],
      });
    }

    // Move to next month
    current = new Date(Date.UTC(year, month + 1, 1));
  }

  return buckets;
}

export function priorDay(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}


