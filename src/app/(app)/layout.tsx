import { getCurrentSession } from "@/server/auth/session";
import { pageContext } from "@/server/page-context";
import { listNotifications } from "@/server/services/notifications";
import { getRunningTimer } from "@/server/services/tasks";
import { listProjectOptions } from "@/server/services/projects";
import { AppShell } from "@/components/shell/app-shell";
import { todayISO } from "@/lib/dates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageContext();
  const session = (await getCurrentSession())!;
  const [notifications, timer, projects] = await Promise.all([listNotifications(ctx), getRunningTimer(ctx), listProjectOptions(ctx)]);
  return (
    <AppShell
      user={session.user}
      role={ctx.role}
      workspaceName={session.workspace!.name}
      notifications={notifications.items}
      unread={notifications.unread}
      timer={timer}
      projects={projects}
      today={todayISO(ctx.timezone)}
    >
      {children}
    </AppShell>
  );
}
