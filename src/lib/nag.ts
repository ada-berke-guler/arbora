export type NagLevel = "never" | "due" | "ok";
const WEEK_MS = 7 * 86_400_000;

export function backupNag(lastBackupAt: string | undefined, nowMs: number): NagLevel {
  if (!lastBackupAt) return "never";
  const at = Date.parse(lastBackupAt);
  if (Number.isNaN(at)) return "never";
  return nowMs - at > WEEK_MS ? "due" : "ok";
}

export function daysSince(iso: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 86_400_000));
}
