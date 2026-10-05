import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink shadow-xs placeholder:text-ink-4 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-subtle aria-[invalid=true]:border-bad aria-[invalid=true]:ring-bad/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-9 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

/** Label + control + hint/error, wired for accessibility. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string[] | string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink-2">
        {label}
        {required && <span className="ml-0.5 text-bad">*</span>}
      </label>
      {children}
      {message ? (
        <p id={`${htmlFor}-error`} className="mt-1 text-xs text-bad">
          {message}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-4">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-line px-5 py-5 last:border-0 md:grid-cols-[200px_1fr] md:gap-8">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-bad/20 bg-bad-soft px-3 py-2 text-[13px] text-bad">
      {message}
    </div>
  );
}
