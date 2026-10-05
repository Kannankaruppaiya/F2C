"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-zinc-950/30",
        { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size],
      )}
    >
      {open && (
        <div>
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-black/5" aria-label="Close">
              <X className="size-4" />
            </button>
          </header>
          <div className="max-h-[75vh] overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  );
}
