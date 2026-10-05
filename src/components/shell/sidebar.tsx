"use client";

import Link from "@/components/ui/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { roleHas } from "@/server/authz/permissions";
import type { Role } from "@prisma/client";
import { NAV } from "./nav";

export function Sidebar({
  role,
  workspaceName,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  role: Role;
  workspaceName: string;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || roleHas(role, i.permission)) })).filter((g) => g.items.length);

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-zinc-950/30 lg:hidden" onClick={onMobileClose} aria-hidden />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-surface transition-[width,transform] duration-150",
          "w-60 -translate-x-full lg:translate-x-0",
          mobileOpen && "translate-x-0",
          collapsed ? "lg:w-14" : "lg:w-56",
        )}
        aria-label="Primary"
      >
        <div className={cn("flex h-12 items-center gap-2 border-b border-line px-3", collapsed && "lg:justify-center lg:px-0")}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-[11px] font-bold text-white">PC</span>
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <p className="truncate text-[13px] font-semibold leading-tight">Command Center</p>
            <p className="truncate text-2xs text-ink-3">{workspaceName}</p>
          </div>
          <button type="button" onClick={onMobileClose} className="rounded p-1 text-ink-3 hover:bg-black/5 lg:hidden" aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
          {groups.map((g, gi) => (
            <div key={gi} className={cn(gi > 0 && "mt-3")}>
              {g.label && (
                <p className={cn("px-2 pb-1 text-2xs font-medium uppercase tracking-wider text-ink-4", collapsed && "lg:hidden")}>{g.label}</p>
              )}
              {g.label && collapsed && <div className="mx-2 mb-1 hidden border-t border-line lg:block" />}
              <ul className="space-y-px">
                {g.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <li key={item.href} className="group relative">
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors",
                          active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-black/[0.04] hover:text-ink",
                          collapsed && "lg:justify-center lg:px-0",
                        )}
                      >
                        <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                        <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
                      </Link>
                      {collapsed && (
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 hidden -translate-y-1/2 rounded bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow group-hover:opacity-100 lg:block"
                        >
                          {item.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <button
          type="button"
          onClick={onToggle}
          className="hidden h-10 items-center gap-2 border-t border-line px-4 text-xs text-ink-3 hover:text-ink lg:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="mx-auto size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
        </button>
      </aside>
    </>
  );
}
