"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft, ClipboardCheck, Database, FileClock, LayoutGrid, Lock, Menu, RefreshCw, ScrollText, Search, Sparkles, Wand2, X, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes, timeAgo } from "@/lib/format";
import { SummaryProvider, useSummary } from "./hooks";
import { Wordmark, useToast } from "./ui";
import { useWorkspace } from "./workspace";

type NavItem = { href: string; label: string; title: string; icon: typeof Zap; badge?: "open" | "risk" };
const MONITOR: NavItem[] = [
  { href: "/dashboard", label: "Overview", title: "Overview", icon: LayoutGrid },
  { href: "/actions", label: "Action Center", title: "AI Action Center", icon: Zap, badge: "open" },
  { href: "/sources", label: "Data Sources", title: "Data Sources", icon: Database },
  { href: "/security", label: "Security", title: "Security & Sensitive Data", icon: Lock, badge: "risk" },
];
const OPERATE: NavItem[] = [
  { href: "/clean", label: "Clean Studio", title: "Clean Studio", icon: Wand2 },
  { href: "/rules", label: "Tenant Rules", title: "Tenant Rules", icon: ScrollText },
  { href: "/audit", label: "Audit & Undo", title: "Audit Trail & Undo", icon: FileClock },
  { href: "/report", label: "DPDP Readiness", title: "DPDP Readiness Report", icon: ClipboardCheck },
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + "/") || (href === "/actions" && path.startsWith("/findings"));
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { data: s } = useSummary();
  const open = s ? s.severity.critical + s.severity.warning + s.severity.info : 0;
  const risk = s?.top_findings ? s.recommendations.exposed_sensitive + s.recommendations.secrets : 0;
  const reclaim = s ? s.totals.redundant_bytes + s.totals.stale_bytes : 0;
  const pct = s && s.totals.total_bytes ? Math.min(100, (100 * reclaim) / s.totals.total_bytes) : 0;

  const item = (n: NavItem) => {
    const on = isActive(path, n.href);
    const count = n.badge === "open" ? open : n.badge === "risk" ? risk : 0;
    return (
      <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
        className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${on ? "bg-ink-700 text-fg shadow-[inset_0_0_0_1px_rgba(236,237,230,0.08)]" : "text-fg-3 hover:text-fg"}`}>
        <n.icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
        <span className="flex-1">{n.label}</span>
        {n.badge && count > 0 && (
          <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${n.badge === "risk" ? "bg-risk/15 text-risk" : "bg-fg/10 text-fg-2"}`}>{count}</span>
        )}
      </Link>
    );
  };

  return (
    <nav aria-label="App" className="flex h-full flex-col gap-7 overflow-y-auto border-r border-line bg-ink-925 px-3.5 py-5">
      <Link href="/" className="px-2 py-1" onClick={onNavigate}><Wordmark small /></Link>
      <div className="flex flex-col gap-1">
        <span className="label px-2.5 pb-2">Monitor</span>
        {MONITOR.map(item)}
      </div>
      <div className="flex flex-col gap-1">
        <span className="label px-2.5 pb-2">Operate</span>
        {OPERATE.map(item)}
      </div>
      <div className="mt-auto flex flex-col gap-3.5 rounded-2xl border border-line bg-ink-850 p-4">
        <span className="label">Storage reclaimable</span>
        <span className="text-[26px] font-semibold leading-none tracking-[-0.03em]">
          {s?.has_scan ? fmtBytes(reclaim).replace(/ \w+$/, "") : "—"}{" "}
          <span className="text-sm text-fg-3">{s?.has_scan ? `${fmtBytes(reclaim).split(" ")[1]} of ${fmtBytes(s.totals.total_bytes)}` : ""}</span>
        </span>
        <div className="h-1.5 overflow-hidden rounded-full bg-fg/10"><div className="h-full rounded-full bg-lime transition-all duration-700" style={{ width: `${pct}%` }} /></div>
        <Link href="/" onClick={onNavigate} className="flex min-h-[32px] items-center gap-2 text-[13px] text-fg-2 hover:text-lime">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to website
        </Link>
      </div>
    </nav>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const toast = useToast();
  const { workspaces, current, setCurrent, llm } = useWorkspace();
  const { data: s, reload } = useSummary();
  const [q, setQ] = useState("");
  const title = [...MONITOR, ...OPERATE].find((n) => isActive(path, n.href))?.title ?? "DataGuardian";
  const scanning = !!s?.running_scan;

  async function runScan() {
    if (!current || scanning) return;
    try {
      await api(`/workspaces/${current.id}/scans`, { method: "POST" });
      reload();
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    }
  }

  return (
    <header className="no-print relative flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-line px-4 py-4 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button className="-ml-1 flex h-11 w-11 items-center justify-center rounded-xl text-fg-2 md:hidden" onClick={onMenu} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="label truncate">
            {current ? `${current.name} · last scan ${scanning ? "in progress" : timeAgo(s?.scan?.finished_at)}` : "No workspace"}
          </span>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
        </div>
      </div>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
        <form className="min-w-0 flex-[1_1_200px] md:max-w-xs" onSubmit={(e) => { e.preventDefault(); router.push(`/sources?q=${encodeURIComponent(q)}`); }}>
          <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-ink-850 px-3.5 text-fg-4">
            <Search className="h-4 w-4 shrink-0" />
            <span className="sr-only">Search files, tables and sources</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files, tables, sources…" className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none" />
          </label>
        </form>
        <select aria-label="Workspace" className="min-h-[44px] max-w-[13rem] rounded-xl border border-line bg-ink-850 px-3 text-sm text-fg outline-none"
          value={current?.id ?? ""} onChange={(e) => setCurrent(e.target.value)} disabled={!workspaces.length}>
          {!workspaces.length && <option value="">No workspace</option>}
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        {current?.is_demo && <span className="rounded-lg border border-dashed border-line-3 px-2.5 py-1.5 font-mono text-[11px] text-fg-2">DEMO DATA</span>}
        <span title={llm?.enabled ? `Plans and explanations by ${llm.model}` : "No ANTHROPIC_API_KEY: deterministic planner and evidence-based explanations"}
          className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] lg:inline-flex ${llm?.enabled ? "border-lime/40 text-lime" : "border-line-2 text-fg-3"}`}>
          <Sparkles className="h-3.5 w-3.5" /> {llm?.enabled ? "CLAUDE" : "OFFLINE AI"}
        </span>
        <button onClick={runScan} disabled={!current || scanning} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-lime px-[18px] text-sm font-semibold text-ink-950 transition hover:brightness-95 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} /> {scanning ? "Scanning…" : "Run scan"}
        </button>
      </div>
      {scanning && (
        <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden bg-fg/5"><div className="h-full w-2/5 animate-load bg-lime" /></div>
      )}
    </header>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SummaryProvider>
    <div className="min-h-screen bg-ink-950 text-fg md:pl-[248px]">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] md:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[264px]">
            <button className="absolute right-3 top-4 z-10 flex h-11 w-11 items-center justify-center text-fg-3" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <Topbar onMenu={() => setOpen(true)} />
      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
        <div className="animate-view">{children}</div>
      </main>
    </div>
    </SummaryProvider>
  );
}
