import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentSession()) redirect("/dashboard");
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white">PC</span>
          <span className="text-sm font-semibold">Project Command Center</span>
        </div>
        <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
