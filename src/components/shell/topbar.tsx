"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, Clock, FolderKanban, LogOut, Menu, Plus, Search, Square } from "lucide-react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/cn";
import { timeAgo, formatDate } from "@/lib/format";
import { ROLE } from "@/lib/status";
import { roleHas, type Permission } from "@/server/authz/permissions";
import type { ActionState } from "@/server/action-state";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { logoutAction } from "@/features/auth/actions";
import { logTimeAction, markAllNotificationsReadAction, markNotificationReadAction, stopTimerAction } from "@/features/shell/actions";

export interface ShellNotification {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export interface ShellTimer {
  startedAt: string;
  task: { id: string; key: string; title: string } | null;
  projectName: string;
}

function useOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onOutside]);
  return ref;
}

function Menu_({ trigger, children, align = "right", open, setOpen }: { trigger: ReactNode; children: ReactNode; align?: "left" | "right"; open: boolean; setOpen: (o: boolean) => void }) {
  const ref = useOutside(() => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      {trigger}
      {open && (
        <div className={cn("absolute z-40 mt-1 rounded-md border border-line bg-surface shadow-lg", align === "right" ? "right-0" : "left-0")} onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,[data-close]")) setOpen(false);
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

const QUICK_ADD: { label: string; href?: string; action?: "logTime"; key?: string; permission: Permission }[] = [
  { label: "New Project", href: "/projects/new", key: "P", permission: "project.create" },
  { label: "New Client", href: "/clients/new", permission: "client.edit" },
  { label: "New Task", href: "/tasks/new", key: "T", permission: "task.create" },
  { label: "Log Time", action: "logTime", permission: "time.log" },
  { label: "New Bug", permission: "bug.create" },
  { label: "Upload Document", permission: "document.upload" },
  { label: "New Change Request", permission: "changeRequest.manage" },
  { label: "Create Invoice", permission: "invoice.create" },
  { label: "Record Payment", permission: "payment.record" },
  { label: "Log Expense", permission: "expense.manage" },
];

export function Topbar({
  user,
  role,
  workspaceName,
  notifications,
  unread,
  timer,
  projects,
  today,
  onOpenSearch,
  onOpenMobileNav,
}: {
  today: string;
  user: { name: string; email: string; avatarColor: string | null };
  role: Role;
  workspaceName: string;
  notifications: ShellNotification[];
  unread: number;
  timer: ShellTimer | null;
  projects: { id: string; name: string; code: string }[];
  onOpenSearch: () => void;
  onOpenMobileNav: () => void;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [logTimeOpen, setLogTimeOpen] = useState(false);
  const [, startTransition] = useTransition();

  // "N" opens Quick Add (ignored while typing).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setAddOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const quick = QUICK_ADD.filter((q) => roleHas(role, q.permission));

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-4">
      <button type="button" className="rounded p-1.5 text-ink-2 hover:bg-black/5 lg:hidden" onClick={onOpenMobileNav} aria-label="Open menu">
        <Menu className="size-4" />
      </button>

      <Menu_
        open={projOpen}
        setOpen={setProjOpen}
        align="left"
        trigger={
          <button type="button" onClick={() => setProjOpen(!projOpen)} className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink-2 hover:bg-black/5 md:flex" aria-expanded={projOpen}>
            <FolderKanban className="size-3.5 text-ink-3" />
            <span className="max-w-40 truncate">{workspaceName}</span>
            <ChevronDown className="size-3.5 text-ink-4" />
          </button>
        }
      >
        <div className="w-72 py-1">
          <p className="px-3 pt-1.5 pb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">Workspace</p>
          <p className="px-3 pb-2 text-[13px] font-medium">{workspaceName}</p>
          <div className="border-t border-line" />
          <p className="px-3 pt-2 pb-1 text-2xs font-medium uppercase tracking-wide text-ink-4">Jump to project</p>
          <div className="max-h-72 overflow-y-auto">
            {projects.length === 0 && <p className="px-3 py-2 text-xs text-ink-3">No projects yet.</p>}
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px] hover:bg-subtle">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 font-mono text-2xs text-ink-4">{p.code}</span>
              </Link>
            ))}
          </div>
        </div>
      </Menu_>

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-subtle px-2.5 text-[13px] text-ink-4 hover:border-line-strong md:max-w-md"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="truncate">Search…</span>
        <span className="ml-auto hidden sm:inline">
          <Kbd>⌘K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        {timer && <TimerChip timer={timer} />}

        {quick.length > 0 && (
          <Menu_
            open={addOpen}
            setOpen={setAddOpen}
            trigger={
              <Button variant="primary" size="sm" onClick={() => setAddOpen(!addOpen)} aria-expanded={addOpen} aria-keyshortcuts="N">
                <Plus className="size-3.5" />
                <span className="hidden sm:inline">Add</span>
              </Button>
            }
          >
            <div className="w-56 py-1">
              {quick.map((q) =>
                q.href ? (
                  <Link key={q.label} href={q.href} className="flex items-center justify-between px-3 py-1.5 text-[13px] hover:bg-subtle">
                    {q.label}
                  </Link>
                ) : q.action === "logTime" ? (
                  <button key={q.label} type="button" data-close onClick={() => setLogTimeOpen(true)} className="flex w-full px-3 py-1.5 text-left text-[13px] hover:bg-subtle">
                    {q.label}
                  </button>
                ) : (
                  <span key={q.label} className="flex items-center justify-between px-3 py-1.5 text-[13px] text-ink-4" title="Arrives with its module in a later phase">
                    {q.label}
                    <span className="text-2xs">Soon</span>
                  </span>
                ),
              )}
              <div className="mt-1 border-t border-line px-3 pt-1.5 pb-1 text-2xs text-ink-4">
                Press <Kbd>N</Kbd> anywhere
              </div>
            </div>
          </Menu_>
        )}

        <Menu_
          open={bellOpen}
          setOpen={setBellOpen}
          trigger={
            <button type="button" onClick={() => setBellOpen(!bellOpen)} className="relative rounded-md p-2 text-ink-2 hover:bg-black/5" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="size-4" />
              {unread > 0 && <span className="absolute top-1 right-1 flex min-w-3.5 items-center justify-center rounded-full bg-bad px-1 text-[9px] font-semibold leading-3.5 text-white">{unread}</span>}
            </button>
          }
        >
          <div className="w-80">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <p className="text-[13px] font-semibold">Notifications</p>
              {unread > 0 && (
                <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => startTransition(() => markAllNotificationsReadAction())}>
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && <li className="px-3 py-8 text-center text-xs text-ink-3">You&apos;re all caught up.</li>}
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    data-close
                    onClick={() => {
                      startTransition(async () => {
                        if (!n.read) await markNotificationReadAction(n.id);
                        if (n.href) router.push(n.href);
                      });
                    }}
                    className="flex w-full gap-2.5 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-subtle"
                  >
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[13px]", n.read ? "text-ink-2" : "font-medium text-ink")}>{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-ink-3">{n.body}</span>}
                      <span className="mt-0.5 block text-2xs text-ink-4">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Menu_>

        <Menu_
          open={userOpen}
          setOpen={setUserOpen}
          trigger={
            <button type="button" onClick={() => setUserOpen(!userOpen)} className="flex items-center rounded-full p-0.5 hover:ring-2 hover:ring-line" aria-label="Account menu">
              <Avatar name={user.name} color={user.avatarColor} size="sm" />
            </button>
          }
        >
          <div className="w-56 py-1">
            <div className="border-b border-line px-3 pt-1.5 pb-2">
              <p className="truncate text-[13px] font-medium">{user.name}</p>
              <p className="truncate text-xs text-ink-3">{user.email}</p>
              <p className="mt-1 text-2xs text-ink-4">{ROLE[role]}</p>
            </div>
            <Link href="/settings" className="block px-3 py-1.5 text-[13px] hover:bg-subtle">
              Settings
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-subtle">
                <LogOut className="size-3.5" /> Sign out
              </button>
            </form>
          </div>
        </Menu_>
      </div>

      <LogTimeDialog open={logTimeOpen} onClose={() => setLogTimeOpen(false)} projects={projects} today={today} />
    </header>
  );
}

function TimerChip({ timer }: { timer: ShellTimer }) {
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - new Date(timer.startedAt).getTime()) / 1000));
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <div className="flex h-8 items-center gap-1.5 rounded-md border border-ok/30 bg-ok-soft pl-2 text-xs text-ok">
      <Clock className="size-3.5" />
      {timer.task ? (
        <Link href={`/tasks/${timer.task.id}`} className="hidden max-w-36 truncate font-medium hover:underline md:inline" title={timer.task.title}>
          {timer.task.key}
        </Link>
      ) : (
        <span className="hidden md:inline">{timer.projectName}</span>
      )}
      <span className="tabular font-mono">{hh}:{mm}:{ss}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => stopTimerAction())}
        className="flex h-full items-center border-l border-ok/30 px-1.5 hover:bg-ok/10"
        aria-label="Stop timer"
        title="Stop timer"
      >
        <Square className="size-3 fill-current" />
      </button>
    </div>
  );
}

function LogTimeDialog({ open, onClose, projects, today }: { open: boolean; onClose: () => void; projects: { id: string; name: string }[]; today: string }) {
  const [state, action, pending] = useActionState(logTimeAction, { ok: false } as ActionState);
  const [projectId, setProjectId] = useState("");
  const [tasks, setTasks] = useState<{ id: string; key: string; title: string }[]>([]);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  useEffect(() => {
    if (!projectId) return setTasks([]);
    fetch(`/api/v1/projects/${projectId}/tasks?open=1`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j: { data: { id: string; key: string; title: string }[] }) => setTasks(j.data))
      .catch(() => setTasks([]));
  }, [projectId]);

  const fe = state.fieldErrors ?? {};
  return (
    <Dialog open={open} onClose={onClose} title="Log time" description="Record effort against a project or task." size="sm">
      <form action={action} className="space-y-4 p-5">
        <FormError message={state.ok ? null : state.error} />
        <Field label="Project" htmlFor="lt-project" error={fe.projectId} required>
          <Select id="lt-project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Task" htmlFor="lt-task" error={fe.taskId} hint="Optional">
          <Select id="lt-task" name="taskId" disabled={!projectId}>
            <option value="">No specific task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.key} · {t.title}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="lt-date" error={fe.date} required>
            <Input id="lt-date" name="date" type="date" defaultValue={today} max={today} />
          </Field>
          <Field label="Hours" htmlFor="lt-hours" error={fe.hours} required>
            <Input id="lt-hours" name="hours" type="number" step="0.25" min="0.25" max="24" placeholder="1.5" />
          </Field>
        </div>
        <Field label="Description" htmlFor="lt-desc" error={fe.description}>
          <Textarea id="lt-desc" name="description" rows={2} placeholder={`Work done on ${formatDate(today)}`} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Log time"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
