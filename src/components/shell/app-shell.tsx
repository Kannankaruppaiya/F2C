"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, FolderKanban, LayoutDashboard, MoreHorizontal, Users } from "lucide-react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/cn";
import { Sidebar } from "./sidebar";
import { Topbar, type ShellNotification, type ShellTimer } from "./topbar";
import { CommandPalette } from "./command-palette";

export function AppShell({
  children,
  user,
  role,
  workspaceName,
  notifications,
  unread,
  timer,
  projects,
  today,
}: {
  children: ReactNode;
  user: { name: string; email: string; avatarColor: string | null };
  role: Role;
  workspaceName: string;
  notifications: ShellNotification[];
  unread: number;
  timer: ShellTimer | null;
  projects: { id: string; name: string; code: string }[];
  today: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar:collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar:collapsed", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const bottom = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    ...(role === "CLIENT" || role === "DEVELOPER" || role === "DESIGNER" || role === "QA" ? [] : [{ href: "/clients", label: "Clients", icon: Users }]),
  ];

  return (
    <div className="min-h-dvh">
      <Sidebar role={role} workspaceName={workspaceName} collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className={cn("flex min-h-dvh flex-col transition-[padding] duration-150", collapsed ? "lg:pl-14" : "lg:pl-56")}>
        <Topbar
          user={user}
          role={role}
          workspaceName={workspaceName}
          notifications={notifications}
          unread={unread}
          timer={timer}
          projects={projects}
          today={today}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-5 pb-24 sm:px-6 lg:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Mobile">
        {bottom.map((b) => {
          const active = pathname === b.href || pathname.startsWith(b.href + "/");
          const Icon = b.icon;
          return (
            <Link key={b.href} href={b.href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-medium", active ? "text-accent" : "text-ink-3")}>
              <Icon className="size-5" strokeWidth={1.75} />
              {b.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMobileOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-medium text-ink-3">
          <MoreHorizontal className="size-5" strokeWidth={1.75} />
          More
        </button>
      </nav>

      <CommandPalette open={searchOpen} onClose={closeSearch} />
    </div>
  );
}
