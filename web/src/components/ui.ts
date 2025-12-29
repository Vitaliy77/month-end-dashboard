// web/src/components/ui.ts
export const ui = {
  // Base button styles (used by btnPrimary / btnGhost / etc.)
  btn: [
    "inline-flex items-center justify-center gap-2",
    "rounded-2xl px-4 py-2.5 text-sm font-semibold",
    "transition-transform transition-colors duration-150",
    "hover:scale-[1.03] active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100",
  ].join(" "),

  // Variants
  btnPrimary: [
    "bg-blue-600 text-white",
    "shadow-sm",
    "hover:bg-blue-700",
    "border border-blue-600",
  ].join(" "),

  btnDark: [
    "bg-slate-900 text-white",
    "shadow-sm",
    "hover:bg-slate-950",
    "border border-slate-900",
  ].join(" "),

  btnGray: [
    "bg-slate-700 text-white",
    "shadow-sm",
    "hover:bg-slate-800",
    "border border-slate-700",
  ].join(" "),

  btnGhost: [
    "bg-white text-slate-900",
    "border border-slate-200",
    "shadow-sm",
    "hover:bg-slate-50",
  ].join(" "),

  // "Link-looking" button (used for P&L / TB)
  // Keep it consistent with buttons, just slightly lighter weight.
  linkBtn: [
    "inline-flex items-center justify-center gap-2",
    "rounded-2xl px-4 py-2.5 text-sm font-semibold",
    "border border-slate-200 bg-white text-slate-900",
    "shadow-sm",
    "transition-transform transition-colors duration-150",
    "hover:bg-slate-50 hover:scale-[1.03] active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200",
  ].join(" "),
};
