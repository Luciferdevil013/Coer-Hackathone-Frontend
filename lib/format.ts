import type { Action, Severity } from "./api";

export function fmtBytes(n: number | null | undefined, digits = 1): string {
  if (n == null || isNaN(n)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = n;
  let i = 0;
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v.toFixed(0) : v.toFixed(digits)} ${units[i]}`;
}

/** Split "4.5 TB" into ["4.5", "TB"] for big-number typography. */
export function bytesParts(n: number | null | undefined): [string, string] {
  const s = fmtBytes(n);
  const i = s.lastIndexOf(" ");
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
export function fmtINR(n: number | null | undefined): string {
  if (n == null) return "—";
  return `₹${inr.format(Math.round(n))}`;
}

/** ₹65,638 -> ₹65.6K ; ₹1,23,000 -> ₹1.2L */
export function fmtINRShort(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

export function fmtNum(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-IN").format(n);
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
}

function asDate(iso: string): Date {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = (Date.now() - asDate(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return asDate(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return asDate(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** Action colours follow the design: KEEP lime, ARCHIVE yellow, DELETE/SECURE orange, CLEAN bone. */
export const ACTION_STYLE: Record<Action | "APPLY" | "IGNORE", { cls: string; text: string; verb: string; done: string }> = {
  KEEP: { cls: "bg-lime/10 text-lime", text: "text-lime", verb: "Keep", done: "Kept" },
  CLEAN: { cls: "bg-fg/10 text-fg", text: "text-fg", verb: "Clean", done: "Cleaned" },
  ARCHIVE: { cls: "bg-warn/10 text-warn", text: "text-warn", verb: "Archive", done: "Archived" },
  SECURE: { cls: "bg-risk-soft/10 text-risk-soft", text: "text-risk-soft", verb: "Secure", done: "Secured" },
  DELETE: { cls: "bg-risk/10 text-risk", text: "text-risk", verb: "Delete", done: "Deleted" },
  APPLY: { cls: "bg-lime/10 text-lime", text: "text-lime", verb: "Apply", done: "Applied" },
  IGNORE: { cls: "bg-ink-600 text-fg-3", text: "text-fg-3", verb: "Ignore", done: "Ignored" },
};

export const SEVERITY_STYLE: Record<Severity, { cls: string; label: string; dot: string }> = {
  critical: { cls: "bg-risk text-ink-950", label: "HIGH", dot: "bg-risk" },
  warning: { cls: "bg-warn text-ink-950", label: "MED", dot: "bg-warn" },
  info: { cls: "bg-ink-600 text-fg-2", label: "LOW", dot: "bg-ink-400" },
};

export const KIND_LABEL: Record<string, string> = {
  exact_duplicate: "Duplicate files",
  near_duplicate: "Duplicate datasets",
  version_chain: "Old versions",
  redundant_backup: "Redundant backups",
  stale_large: "Cold data",
  sensitive_data: "Sensitive data",
  secret_exposed: "Exposed secrets",
  duplicate_rows: "Duplicate records",
  data_quality: "Data quality",
  unused_columns: "Unused columns",
  anomalous_values: "Anomalous values",
  pii_in_text: "Personal data in text",
  unreadable_files: "Unreadable files",
};

export const FILTER_GROUPS: { id: string; label: string; kinds: string[] }[] = [
  { id: "all", label: "All", kinds: [] },
  { id: "dup", label: "Duplicates", kinds: ["exact_duplicate", "near_duplicate", "duplicate_rows"] },
  { id: "backup", label: "Backups", kinds: ["redundant_backup"] },
  { id: "sensitive", label: "Sensitive", kinds: ["sensitive_data", "secret_exposed", "pii_in_text"] },
  { id: "unused", label: "Unused", kinds: ["unused_columns"] },
  { id: "cold", label: "Cold data", kinds: ["stale_large"] },
  { id: "versions", label: "Versions", kinds: ["version_chain"] },
  { id: "anomaly", label: "Anomalies", kinds: ["anomalous_values"] },
  { id: "quality", label: "Quality", kinds: ["data_quality", "unreadable_files"] },
];

export const SOURCE_META: Record<string, { abbr: string; name: string; kind: string }> = {
  upload: { abbr: "UP", name: "File uploads", kind: "CSV · Excel · JSON · PDF · DOCX · TXT · ZIP · SQLite" },
  "s3-inventory": { abbr: "S3", name: "AWS S3", kind: "Object storage · inventory report (metadata)" },
  "pipeline-output": { abbr: "CO", name: "Cleaned outputs", kind: "Written by Clean Studio · with lineage" },
};

export function healthColor(h: number): string {
  return h >= 80 ? "#C9F25C" : h >= 60 ? "#F2C94C" : "#FF8A4C";
}

export function scoreColor(score: number | null): string {
  return score == null ? "#8C9087" : healthColor(score);
}
