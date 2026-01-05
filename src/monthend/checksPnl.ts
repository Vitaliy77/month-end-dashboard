export type Finding = {
  id: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  meta?: any;
};

type PnlLine = {
  name: string;
  value: number;
  source?: string;
  section?: string;
  group?: string;
};

type Input = {
  orgId: string;
  from: string;
  to: string;
  pnlLines: PnlLine[];
  pnlLinesPrev: PnlLine[];
  netIncomeThis: number | null;
  netIncomePrev: number | null;
};

const round2 = (x: number) => Math.round(x * 100) / 100;

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function lower(s: any): string {
  return String(s ?? "").toLowerCase();
}

function findLine(lines: PnlLine[], nameIncludes: string): PnlLine | undefined {
  const k = nameIncludes.toLowerCase();
  return lines.find((l) => lower(l.name).includes(k));
}

export function buildFindingsFromPnl(input: Input): Finding[] {
  const {
    orgId,
    from,
    to,
    pnlLines,
    pnlLinesPrev,
    netIncomeThis,
    netIncomePrev,
  } = input;

  const findings: Finding[] = [];

  // --- 1) Parse health (smarter severity)
  const hasNetIncome = netIncomeThis != null;
  const enoughLines = pnlLines.length >= 4;
  const parseSeverity: Finding["severity"] =
    !hasNetIncome || !enoughLines ? "warn" : "info";

  findings.push({
    id: "pnl-parse-health",
    severity: parseSeverity,
    title: "P&L parse health",
    detail: hasNetIncome
      ? `Parsed lines: ${pnlLines.length}. Net Income detected: ${fmtMoney(netIncomeThis!)}.`
      : `Net Income was not detected in the P&L output for ${from} to ${to}. Parsed lines: ${pnlLines.length}.`,
    meta: {
      orgId,
      from,
      to,
      pnlLinesCount: pnlLines.length,
      netIncomeThis,
      netIncomePrev,
    },
  });

  // --- 2) Executive summary: Revenue / Expenses / Net Income
  const totalIncome = findLine(pnlLines, "total income")?.value ?? null;
  const totalExpenses = findLine(pnlLines, "total expenses")?.value ?? null;
  const totalIncomePrev = findLine(pnlLinesPrev, "total income")?.value ?? null;
  const totalExpensesPrev = findLine(pnlLinesPrev, "total expenses")?.value ?? null;

  if (totalIncome != null || totalExpenses != null || netIncomeThis != null) {
    const parts: string[] = [];
    if (totalIncome != null) parts.push(`Total Income: ${fmtMoney(totalIncome)}`);
    if (totalExpenses != null) parts.push(`Total Expenses: ${fmtMoney(totalExpenses)}`);
    if (netIncomeThis != null) parts.push(`Net Income: ${fmtMoney(netIncomeThis)}`);

    findings.push({
      id: "pnl-exec-summary",
      severity: "info",
      title: "Executive summary",
      detail: parts.join(". ") + ".",
      meta: { totalIncome, totalExpenses, netIncomeThis },
    });
  }

  // --- 2b) Revenue missing / operating with zero income
  if ((totalIncome ?? 0) === 0 && (totalExpenses ?? 0) > 0) {
    const exp = totalExpenses ?? 0;
    const sev: Finding["severity"] = exp >= 1000 ? "critical" : "warn";
    findings.push({
      id: "pnl-revenue-missing",
      severity: sev,
      title: "Revenue appears to be zero",
      detail:
        `Total Income is ${fmtMoney(totalIncome ?? 0)} while Total Expenses are ${fmtMoney(exp)} for ${from} to ${to}. ` +
        `If you expected revenue, check invoice posting dates, income accounts mapping, or whether revenue was posted in a different period.`,
      meta: { totalIncome, totalExpenses, from, to },
    });
  }

  // --- 3) Top lines snapshot (exclude totals)
  const excludeNames = new Set([
    "total income",
    "total expenses",
    "gross profit",
    "net income",
    "net operating income",
  ]);

  const topAccounts = [...pnlLines]
    .filter((l) => Number.isFinite(l.value))
    .filter((l) => !excludeNames.has(lower(l.name).trim()))
    .sort((a, b) => {
      const aData = a.source === "data" ? 1 : 0;
      const bData = b.source === "data" ? 1 : 0;
      if (aData !== bData) return bData - aData;
      return Math.abs(b.value) - Math.abs(a.value);
    })
    .slice(0, 10);

  findings.push({
    id: "pnl-top-lines",
    severity: "info",
    title: "Top accounts (snapshot)",
    detail:
      topAccounts.length === 0
        ? "No account-level lines found to show (yet)."
        : `Top ${topAccounts.length} accounts by magnitude for quick review.`,
    meta: {
      top: topAccounts.map((t) => ({
        name: t.name,
        section: t.section,
        source: t.source,
        value: t.value,
        formatted: fmtMoney(t.value),
      })),
    },
  });

  // --- 3b) Expense concentration — improved severity (dollar + % based)
  if (totalExpenses != null && totalExpenses > 0) {
    const expenseAccounts = pnlLines
      .filter((l) => l.source === "data")
      .filter((l) => lower(l.section ?? "") === "expenses")
      .filter((l) => Number.isFinite(l.value) && l.value !== 0);

    const topExp = [...expenseAccounts]
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 5);

    if (topExp.length > 0) {
      const items = topExp.map((x) => {
        const pct = Math.abs(x.value) / Math.abs(totalExpenses);
        return {
          name: x.name,
          value: x.value,
          formatted: fmtMoney(x.value),
          pct,
          pctFmt: `${(pct * 100).toFixed(1)}%`,
        };
      });

      const biggest = items[0];

      let sev: Finding["severity"] = "info";
      if (biggest.pct >= 0.75 && totalExpenses >= 5000) sev = "critical";
      else if (biggest.pct >= 0.5 && totalExpenses >= 1000) sev = "warn";

      findings.push({
        id: "pnl-expense-concentration",
        severity: sev,
        title: "Expense concentration",
        detail:
          `Top expense accounts represent the majority of Total Expenses (${fmtMoney(totalExpenses)}). ` +
          `Largest: ${biggest.name} at ${biggest.pctFmt} of expenses.`,
        meta: {
          totalExpenses,
          top: items,
        },
      });
    }
  }

  // --- 4) MoM Net Income
  if (netIncomeThis != null && netIncomePrev != null) {
    const delta = round2(netIncomeThis - netIncomePrev);
    const pct = netIncomePrev === 0 ? null : round2(delta / Math.abs(netIncomePrev));

    let severity: Finding["severity"] = "info";
    if (Math.abs(delta) >= 200_000) severity = "critical";
    else if (Math.abs(delta) >= 50_000) severity = "warn";

    findings.push({
      id: "pnl-mom-net-income",
      severity,
      title: "Net Income month-over-month",
      detail:
        `This month: ${fmtMoney(netIncomeThis)}. Prior month: ${fmtMoney(netIncomePrev)}. ` +
        `Change: ${fmtMoney(delta)}${pct == null ? "" : ` (${(pct * 100).toFixed(1)}%)`}.`,
      meta: { netIncomeThis, netIncomePrev, delta, pct },
    });
  }

  // --- 4b) Total Expenses month-over-month
  if (totalExpenses != null && totalExpensesPrev != null) {
    const delta = round2(totalExpenses - totalExpensesPrev);
    const pct = totalExpensesPrev === 0 ? null : round2(delta / Math.abs(totalExpensesPrev));

    let severity: Finding["severity"] = "info";
    if (Math.abs(delta) >= 10_000) severity = "critical";
    else if (Math.abs(delta) >= 1_000) severity = "warn";

    findings.push({
      id: "pnl-mom-expenses",
      severity,
      title: "Total Expenses month-over-month",
      detail:
        `This month: ${fmtMoney(totalExpenses)}. Prior month: ${fmtMoney(totalExpensesPrev)}. ` +
        `Change: ${fmtMoney(delta)}${pct == null ? "" : ` (${(pct * 100).toFixed(1)}%)`}.`,
      meta: { totalExpenses, totalExpensesPrev, delta, pct },
    });
  }

  // --- 5) Uncategorized / Ask My Accountant detection
  const uncatKeys = ["uncategorized", "ask my accountant", "unknown"];
  const uncatHits = pnlLines.filter((l) =>
    uncatKeys.some((k) => lower(l.name).includes(k))
  );

  if (uncatHits.length > 0) {
    const total = round2(uncatHits.reduce((s, x) => s + x.value, 0));
    findings.push({
      id: "pnl-uncat",
      severity: Math.abs(total) > 1000 ? "warn" : "info",
      title: "Potentially uncategorized activity",
      detail: `Found ${uncatHits.length} line(s) that look like Uncategorized/Ask My Accountant/etc. Total impact: ${fmtMoney(total)}.`,
      meta: { hits: uncatHits, total },
    });
  }

  // --- 6) Largest account swings vs prior month — improved filtering
  const excludeNamesSwing = new Set([
    "total income",
    "total expenses",
    "gross profit",
    "net income",
    "net operating income",
  ]);

  const mapNow = new Map<string, number>();
  const mapPrev = new Map<string, number>();

  for (const l of pnlLines.filter((x) => x.source === "data")) {
    mapNow.set(l.name, (mapNow.get(l.name) ?? 0) + l.value);
  }
  for (const l of pnlLinesPrev.filter((x) => x.source === "data")) {
    mapPrev.set(l.name, (mapPrev.get(l.name) ?? 0) + l.value);
  }

  const names = new Set<string>([...mapNow.keys(), ...mapPrev.keys()]);
  const diffs = [...names].map((name) => {
    const now = mapNow.get(name) ?? 0;
    const prev = mapPrev.get(name) ?? 0;
    const delta = round2(now - prev);
    return { name, now, prev, delta };
  });

  const nonZero = diffs
    .filter((d) => d.name && d.name.trim().length > 0)
    .filter((d) => !excludeNamesSwing.has(d.name.toLowerCase().trim()))
    .filter((d) => Math.abs(d.now) + Math.abs(d.prev) > 0.01);

  const topN = 10;
  const top = [...nonZero]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, topN);

  if (top.length > 0) {
    const maxAbsDelta = Math.max(...top.map((t) => Math.abs(t.delta)));

    let sev: Finding["severity"] = "info";
    if (maxAbsDelta >= 10_000) sev = "critical";
    else if (maxAbsDelta >= 1_000) sev = "warn";

    findings.push({
      id: "pnl-largest-swings",
      severity: sev,
      title: "Largest account swings vs prior month",
      detail: `Top ${top.length} account swings by magnitude.`,
      meta: {
        maxAbsDelta,
        swings: top.map((t) => ({
          name: t.name,
          thisMonth: t.now,
          priorMonth: t.prev,
          delta: t.delta,
          thisFmt: fmtMoney(t.now),
          priorFmt: fmtMoney(t.prev),
          deltaFmt: fmtMoney(t.delta),
        })),
      },
    });
  }

  return findings;
}