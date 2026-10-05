// Structured JSON logger. Swap the sink for a log drain / APM in production.
type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, event: string, data: Record<string, unknown> = {}) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (e: string, d?: Record<string, unknown>) => log("debug", e, d),
  info: (e: string, d?: Record<string, unknown>) => log("info", e, d),
  warn: (e: string, d?: Record<string, unknown>) => log("warn", e, d),
  error: (e: string, d?: Record<string, unknown>) => log("error", e, d),
};
