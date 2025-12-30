"use client";

// web/src/components/TopBar.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";

type Props = {
  children?: ReactNode;
  showNav?: boolean;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        // Same size buttons
        "h-10 min-w-[150px] px-4",
        "inline-flex items-center justify-center",
        "rounded-2xl text-sm font-semibold",
        "border shadow-sm backdrop-blur",
        "transition-transform transition-colors duration-150 will-change-transform",
        // +10% on hover and on press
        "hover:scale-110 active:scale-110",
        "focus:outline-none focus:ring-4 focus:ring-blue-200",
        active
          ? "border-blue-300 bg-white text-slate-900 shadow"
          : "border-slate-200/70 bg-white/70 text-slate-800 hover:bg-white hover:shadow",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

export default function TopBar({ children, showNav = true }: Props) {
  const pathname = usePathname() || "/";
  const { state, withParams } = useOrgPeriod();

  const links = [
    { href: "/", label: "Home" },
    { href: "/tb", label: "Trial Balance" },
    { href: "/bs", label: "Balance Sheet" },
    { href: "/pnl", label: "P&L" },
    { href: "/cf", label: "Cash Flow" },
  ];

  const orgId = state.orgId?.trim() || "";
  const orgName = state.orgName?.trim() || "";

  const orgLine = orgId
    ? orgName
      ? `orgId: ${orgId} • ${orgName}`
      : `orgId: ${orgId}`
    : "orgId: —";

  const from = state.from || "—";
  const to = state.to || "—";

  return (
    <div className="sticky top-0 z-50 border-b border-slate-200 bg-sky-50/90 backdrop-blur">
      <div className="mx-auto max-w-none px-3 sm:px-4 lg:px-6 py-2">
        <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap">
          {/* Brand + context */}
          <div className="flex flex-col pr-2">
            <div className="text-xs font-extrabold uppercase tracking-[.18em] text-slate-500">
              Month-End Checker
            </div>
            <div className="text-xs text-slate-600">
              {orgLine} • Period: {from} → {to}
              {process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_BUILD_ID && (
                <span className="ml-2 text-slate-400 font-mono">
                  Build: {process.env.NEXT_PUBLIC_BUILD_ID}
                </span>
              )}
            </div>
          </div>

          {/* Nav */}
          {showNav && (
            <div className="flex items-center gap-2">
              {links.map((l) => (
                <NavLink
                  key={l.href}
                  href={withParams(l.href)}
                  label={l.label}
                  active={isActivePath(pathname, l.href)}
                />
              ))}
            </div>
          )}

          {/* Right side slot */}
          {children ? (
            <div className="ml-auto flex items-center gap-2">{children}</div>
          ) : (
            <div className="ml-auto" />
          )}
        </div>
      </div>
    </div>
  );
}
