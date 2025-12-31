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
        // Base sizing with padding for scale transform (20% smaller than original)
        "h-10 min-w-[113px] px-2.5",
        "inline-flex items-center justify-center",
        "rounded-2xl text-sm font-semibold",
        "border shadow-sm backdrop-blur",
        // Smooth transitions for transform and colors
        "transition-all duration-200 ease-out",
        "will-change-transform",
        // Scale 1.2 on hover (20% growth) with transform to avoid layout jitter
        "hover:scale-125 active:scale-110",
        // Focus styles for accessibility
        "focus:outline-none focus:ring-4 focus:ring-blue-300 focus:ring-offset-2",
        active
          ? "border-blue-400 bg-white text-slate-900 shadow-md"
          : "border-slate-200/80 bg-white/80 text-slate-800 hover:bg-white hover:shadow-md",
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
    { href: "/accruals", label: "Accruals" },
  ];

  return (
    <div className="sticky top-0 z-50 border-b border-blue-300/30 bg-blue-600/95 backdrop-blur shadow-md">
      <div className="mx-auto max-w-none px-3 sm:px-4 lg:px-6 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          {/* Brand */}
          <div className="flex-shrink-0">
            <div className="text-sm font-extrabold uppercase tracking-[.18em] text-white">
              Month-End Checker
            </div>
            {process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_BUILD_ID && (
              <div className="text-xs text-blue-100 font-mono mt-0.5">
                Build: {process.env.NEXT_PUBLIC_BUILD_ID}
              </div>
            )}
          </div>

          {/* Nav - responsive wrapping with proper spacing */}
          {showNav && (
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
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
            <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">{children}</div>
          ) : (
            <div className="sm:ml-auto" />
          )}
        </div>
      </div>
    </div>
  );
}
