"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Summary } from "@/lib/api";
import { bytesParts, fmtBytes, fmtINR, fmtNum } from "@/lib/format";
import { Wordmark } from "@/components/ui";
import { ScoreRing } from "@/components/widgets";
import { useWorkspace } from "@/components/workspace";

const WRAP = "mx-auto box-border max-w-[1280px] px-[clamp(16px,4vw,48px)]";
const Arrow = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
);
const Em = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <span className={`serif-em ${className}`}>{children}</span>;

const TICKER = [
  { file: "customer_data_final2.csv", action: "DELETE", color: "#FF8A4C" },
  { file: "Report_FINAL_REAL_NEW.xlsx", action: "KEEP", color: "#C9F25C" },
  { file: "marketing_old.zip", action: "ARCHIVE", color: "#F2C94C" },
  { file: "customer_backup_2023.csv", action: "SECURE", color: "#FF8A4C" },
  { file: "orders_backup_03.csv", action: "DELETE", color: "#FF8A4C" },
  { file: "crm.db → fax_number", action: "ARCHIVE", color: "#F2C94C" },
  { file: "customers_master.csv rows", action: "CLEAN", color: "#ECEDE6" },
  { file: "Report_final2.xlsx", action: "ARCHIVE", color: "#F2C94C" },
  { file: ".env.bak", action: "SECURE", color: "#FF8A4C" },
];

const VERBS = [
  { n: "01", w: "Keep", d: "Business-critical data, verified and indexed." },
  { n: "02", w: "Clean", d: "Duplicate rows merged, version chains collapsed." },
  { n: "03", w: "Archive", d: "Cold data moved out of expensive storage." },
  { n: "04", w: "Secure", d: "PII, keys and passwords locked down.", c: "text-risk" },
  { n: "05", w: "Delete", d: "True redundancy removed — only with your approval.", strike: true },
];

function Choice({ opts, value, onPick }: { opts: { id: string; label: string }[]; value: string | null; onPick: (id: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o, i) => {
        const on = value === o.id;
        const primary = !value && i === 0;
        return (
          <button key={o.id} type="button" aria-pressed={on} onClick={() => onPick(on ? null : o.id)}
            className={`min-h-[44px] rounded-full border px-[18px] text-sm font-semibold transition ${on ? "border-lime bg-lime text-ink-950" : primary ? "border-fg bg-fg text-ink-950" : "border-line-3 text-fg"}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Landing() {
  const { current, workspaces } = useWorkspace();
  const [live, setLive] = useState<Summary | null>(null);
  const [row, setRow] = useState<string | null>(null);
  const [rec, setRec] = useState<string | null>(null);

  useEffect(() => {
    const ws = current ?? workspaces[0];
    if (!ws) return;
    api<Summary>(`/workspaces/${ws.id}/summary`).then((s) => setLive(s.has_scan ? s : null)).catch(() => setLive(null));
  }, [current, workspaces]);

  // Live numbers from the current workspace when a scan exists; the design's sample otherwise.
  const L = live;
  const score = L?.health_score ?? 78;
  const sev = L ? L.severity : { critical: 347, warning: 1284, info: 0 };
  const healthy = L ? `${Math.round(L.healthy_pct)}%` : "72%";
  const total = L ? L.totals.total_bytes : 4.8 * 1024 ** 4;
  const [totalNum, totalUnit] = bytesParts(total);
  const useful = L ? L.totals.useful_bytes : 2.9 * 1024 ** 4;
  const redundant = L ? L.totals.redundant_bytes : 1.1 * 1024 ** 4;
  const cold = L ? Math.min(L.totals.stale_bytes, Math.max(0, total - redundant)) : 0.4 * 1024 ** 4;
  const waste = L ? L.recommendations.annual_waste_inr : 42000;
  const wb = L ? L.waste_breakdown : { redundant: 438 * 1024 ** 3, backups: 712 * 1024 ** 3, stale: 291 * 1024 ** 3, unused_columns: 184 * 1024 ** 3 };
  const wbRows = [["Duplicates & old versions", wb.redundant], ["Old backups", wb.backups], ["Cold / unused files", wb.stale], ["Unused DB columns", wb.unused_columns]] as const;
  const wbMax = Math.max(1, ...wbRows.map((r) => r[1]));
  const reclaimTotal = wbRows.reduce((a, r) => a + r[1], 0);
  const recs = L
    ? [["Duplicate data & versions", fmtBytes(L.recommendations.duplicate_bytes)], ["Old backups", fmtBytes(L.recommendations.backup_bytes)],
       ["Duplicate files", fmtNum(L.recommendations.duplicate_files)], ["Sensitive datasets, excess access", String(L.recommendations.exposed_sensitive)]]
    : [["Duplicate data", "438 GB"], ["Old backups", "712 GB"], ["Duplicate files", "1,842"], ["Sensitive datasets, excess access", "27"]];
  const queue = L?.top_findings.slice(0, 4).map((f) => ({
    sev: f.severity === "critical" ? "HIGH" : f.severity === "warning" ? "MED" : "LOW", title: f.title, href: `/findings/${f.id}`,
    meta: f.savings_inr_year >= 1 ? `Save ${fmtINR(f.savings_inr_year)} / yr` : f.category === "risk" ? "Risk: high" : "Needs review",
    risk: f.savings_inr_year < 1,
  })) ?? [
    { sev: "HIGH", title: "438 GB duplicate datasets", meta: "Save ₹12,400 / yr", risk: false, href: "/dashboard" },
    { sev: "HIGH", title: "27 sensitive files exposed to unnecessary users", meta: "Risk: high", risk: true, href: "/dashboard" },
    { sev: "MED", title: "712 GB obsolete backups", meta: "Save ₹18,200 / yr", risk: false, href: "/dashboard" },
    { sev: "MED", title: "1,842 duplicate files", meta: "Save ₹6,700 / yr", risk: false, href: "/dashboard" },
  ];
  const sampleTag = L ? `LIVE · ${L.workspace.name.toUpperCase()}` : "SAMPLE SCAN";

  const rowMsg = { merge: "Merged into one customer · change logged for audit", keep: "Kept both · marked as distinct customers", ignore: "Ignored for this scan" } as Record<string, string>;
  const recMsg = { archive: "Queued · moving to cold storage after your approval", keep: "Kept · this file won’t be flagged again", ignore: "Ignored for this scan" } as Record<string, string>;

  return (
    <div className="overflow-x-hidden bg-ink-950 text-base leading-normal text-fg">
      {/* NAV */}
      <header className="sticky top-0 z-30 border-b border-line bg-ink-950/80 backdrop-blur-[14px]">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-3.5`}>
          <Link href="#top" aria-label="DataGuardian AI home"><Wordmark /></Link>
          <nav aria-label="Primary" className="flex flex-wrap gap-x-7 gap-y-2 text-sm text-fg-2">
            <a href="#platform" className="hover:text-lime">Platform</a>
            <a href="#detectors" className="hover:text-lime">Detectors</a>
            <a href="#explainable" className="hover:text-lime">Explainable AI</a>
            <a href="#action-center" className="hover:text-lime">Action Center</a>
            <Link href="/dashboard" className="hover:text-lime">Dashboard</Link>
          </nav>
          <Link href="/dashboard" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-lime px-5 text-sm font-semibold text-ink-950 hover:brightness-95">Run a scan <Arrow /></Link>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative pb-[72px] pt-[clamp(64px,9vw,128px)]">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className={`${WRAP} relative flex flex-col gap-12`}>
          <div className="flex animate-rise flex-wrap items-center gap-x-6 gap-y-3 font-mono text-xs uppercase tracking-[0.1em] text-fg-3">
            <span className="flex items-center gap-2.5 text-fg"><span className="inline-block h-2 w-2 animate-pulsedot rounded-full bg-lime" />AI-powered data lifecycle management</span>
            <span>Keep · Clean · Archive · Secure · Delete</span>
          </div>
          <h1 className="max-w-[13ch] animate-rise2 font-semibold leading-[0.92] tracking-[-0.045em] [text-wrap:balance]" style={{ fontSize: "clamp(46px, 8.4vw, 132px)" }}>
            Companies don’t have a data <Em className="text-fg-3">shortage.</Em>
          </h1>
          <div className="flex animate-rise3 flex-wrap items-end justify-between gap-10">
            <h2 className="max-w-[15ch] font-semibold leading-[0.98] tracking-[-0.04em]" style={{ fontSize: "clamp(32px, 4.6vw, 68px)" }}>
              They have a data <Em className="text-lime">overload</Em> problem.
            </h2>
            <div className="flex max-w-[460px] flex-[1_1_340px] flex-col gap-7">
              <p className="text-lg leading-[1.55] text-fg-2 [text-wrap:pretty]">DataGuardian AI connects to your files, databases and cloud storage, finds what’s redundant, obsolete, risky or low-value — and tells you exactly what to keep, clean, archive, secure or delete.</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/dashboard" className="inline-flex min-h-[52px] items-center gap-2.5 rounded-full bg-lime px-[26px] font-semibold text-ink-950 hover:brightness-95">Scan your data <Arrow /></Link>
                <a href="#platform" className="inline-flex min-h-[52px] items-center rounded-full border border-line-3 px-[26px] font-medium hover:border-lime/60">See how it works</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VERB STRIP */}
      <section aria-label="The five decisions" className="border-y border-[rgba(236,237,230,0.1)]">
        <div className={`${WRAP} relative`}>
          <div className="relative grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] overflow-hidden">
            <div aria-hidden="true" className="absolute inset-y-0 z-[2] w-0.5 animate-scan bg-lime shadow-[0_0_24px_4px_rgba(201,242,92,0.45)]" />
            {VERBS.map((v, i) => (
              <div key={v.w} className={`flex flex-col gap-3.5 py-8 ${i === 0 ? "pr-6" : i === VERBS.length - 1 ? "pl-6" : "px-6"} ${i < VERBS.length - 1 ? "border-r border-[rgba(236,237,230,0.1)]" : ""}`}>
                <span className="font-mono text-xs text-fg-3">{v.n}</span>
                <span className={`relative self-start text-[44px] font-semibold leading-none tracking-[-0.04em] ${v.c ?? ""}`}>
                  {v.w}{v.strike && <span aria-hidden="true" className="absolute left-0 top-[52%] block h-[3px] animate-strike bg-fg" />}
                </span>
                <span className="text-sm text-fg-3 [text-wrap:pretty]">{v.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORM PREVIEW */}
      <section id="platform" className="pt-[clamp(80px,10vw,140px)]">
        <div className={`${WRAP} flex flex-col gap-14`}>
          <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
            <div className="flex max-w-[760px] flex-col gap-5">
              <span className="eyebrow">01 — The platform</span>
              <h2 className="font-semibold leading-none tracking-[-0.04em] [text-wrap:balance]" style={{ fontSize: "clamp(36px, 5vw, 72px)" }}>One control centre for your <Em>entire</Em> data lifecycle.</h2>
            </div>
            <p className="max-w-[380px] text-fg-3 [text-wrap:pretty]">Connect a source and get a Data Health Score, a breakdown of what’s useful versus what’s dead weight, and a ranked list of actions — in one screen.</p>
          </div>

          <div className="overflow-hidden rounded-panel border border-[rgba(236,237,230,0.12)] bg-gradient-to-b from-[#121513] to-[#0E100F] shadow-[0_60px_120px_-40px_rgba(0,0,0,0.8)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
              <div className="flex items-center gap-2.5 text-sm font-semibold">
                <Wordmark small /> <span className="font-mono text-xs font-normal text-fg-3">/ Overview</span>
              </div>
              <span className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${L ? "border-lime/40 text-lime" : "border-dashed border-line-3 text-fg-2"}`}>{sampleTag}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4 p-[clamp(16px,2.4vw,28px)]">
              <div className="flex flex-col gap-5 rounded-card border border-line bg-ink-950 p-6">
                <span className="label text-xs text-fg-3">Data health score</span>
                <div className="self-center"><ScoreRing score={score} /></div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="flex flex-col gap-0.5 rounded-xl bg-risk/10 px-1 py-3"><span className="text-[22px] font-semibold text-risk">{fmtNum(sev.critical)}</span><span className="text-[11px] text-fg-2">Critical</span></div>
                  <div className="flex flex-col gap-0.5 rounded-xl bg-warn/10 px-1 py-3"><span className="text-[22px] font-semibold text-warn">{fmtNum(sev.warning)}</span><span className="text-[11px] text-fg-2">Warning</span></div>
                  <div className="flex flex-col gap-0.5 rounded-xl bg-lime/10 px-1 py-3"><span className="text-[22px] font-semibold text-lime">{healthy}</span><span className="text-[11px] text-fg-2">Healthy</span></div>
                </div>
              </div>
              <div className="flex flex-col gap-6 rounded-card border border-line bg-ink-950 p-6">
                <span className="label text-xs text-fg-3">Total data scanned</span>
                <div className="flex items-baseline gap-2"><span className="text-[72px] font-semibold leading-[0.9] tracking-[-0.05em]">{totalNum}</span><span className="text-2xl text-fg-3">{totalUnit}</span></div>
                <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-full">
                  <div className="bg-lime" style={{ width: `${(100 * useful) / total}%` }} />
                  <div className="bg-warn" style={{ width: `${(100 * redundant) / total}%` }} />
                  <div className="bg-risk" style={{ width: `${(100 * cold) / total}%` }} />
                  <div className="flex-1 bg-ink-600" />
                </div>
                <div className="flex flex-col gap-3 text-sm">
                  {([["Useful data", useful, "bg-lime"], ["Redundant data", redundant, "bg-warn"], [L ? "Cold / stale data" : "Risky data", cold, "bg-risk"]] as const).map(([k, v, c]) => (
                    <div key={k} className="flex justify-between gap-3"><span className="flex items-center gap-2.5 text-fg-2"><span className={`h-2.5 w-2.5 rounded-[3px] ${c}`} />{k}</span><span className="font-mono">{fmtBytes(v)}</span></div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-4 rounded-card border border-line bg-ink-950 p-6">
                <span className="label text-xs text-fg-3">AI recommendations</span>
                <div className="flex flex-col">
                  {recs.map(([k, v], i) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-[rgba(236,237,230,0.07)] py-3 text-sm"><span className="text-fg-2">{k}</span><span className={`font-mono ${i === 3 ? "text-risk" : ""}`}>{v}</span></div>
                  ))}
                  <div className="flex justify-between gap-3 py-3 text-sm"><span className="text-fg-2">Est. storage waste</span><span className="font-mono text-lime">{fmtINR(waste)}/yr</span></div>
                </div>
                <Link href="/actions" className="mt-auto flex min-h-[48px] items-center justify-center rounded-xl bg-fg text-sm font-semibold text-ink-950 hover:bg-white">Review all</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <section aria-label="Files DataGuardian finds" className="mt-[clamp(80px,10vw,140px)] overflow-hidden border-y border-[rgba(236,237,230,0.1)] py-[22px]">
        <div className="flex w-max animate-marquee gap-12 whitespace-nowrap font-mono text-[15px]">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="flex items-center gap-3.5"><span className="text-fg-2">{t.file}</span><span style={{ color: t.color }}>→ {t.action}</span></span>
          ))}
        </div>
      </section>

      {/* COST */}
      <section className="py-[clamp(80px,10vw,140px)]">
        <div className={`${WRAP} flex flex-wrap items-start gap-16`}>
          <div className="flex flex-[1_1_460px] flex-col gap-6">
            <span className="eyebrow">02 — The real cost</span>
            <h2 className="font-semibold leading-none tracking-[-0.04em]" style={{ fontSize: "clamp(36px, 5vw, 72px)" }}>How much money are we <Em>wasting?</Em></h2>
            <p className="max-w-[460px] text-fg-3 [text-wrap:pretty]">“You have 1.2 TB of redundant data” doesn’t move a CFO. A rupee figure does. DataGuardian prices every finding, so cleanup becomes a business decision — and under India’s DPDP Act, old personal data is a legal liability too.</p>
            <div className="mt-4 flex flex-col gap-1">
              <span className="font-semibold leading-[0.9] tracking-[-0.06em] text-lime" style={{ fontSize: "clamp(64px, 10vw, 152px)" }}>{fmtINR(waste)}</span>
              <span className="font-mono text-[13px] text-fg-3">ESTIMATED ANNUAL STORAGE WASTE · {sampleTag}</span>
            </div>
          </div>
          <div className="flex flex-[1_1_420px] flex-col gap-7 rounded-panel border border-[rgba(236,237,230,0.1)] bg-ink-900 p-[clamp(20px,3vw,36px)]">
            {wbRows.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-2.5">
                <div className="flex justify-between text-[15px]"><span>{k}</span><span className="font-mono">{fmtBytes(v)}</span></div>
                <div className="h-1.5 rounded-full bg-fg/[0.07]"><div className="h-full rounded-full bg-fg" style={{ width: `${(100 * v) / wbMax}%` }} /></div>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t border-[rgba(236,237,230,0.12)] pt-6">
              <span className="label text-xs text-fg-3">Total reclaimable</span>
              <span className="text-[40px] font-semibold tracking-[-0.04em]">{fmtBytes(reclaimTotal)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 font-mono text-[13px] text-fg-2">
              <span className="rounded-lg border border-line-2 px-3 py-2">Data</span><span aria-hidden="true">→</span>
              <span className="rounded-lg border border-line-2 px-3 py-2">AI</span><span aria-hidden="true">→</span>
              <span className="rounded-lg bg-lime px-3 py-2 text-ink-950">Business value</span>
            </div>
          </div>
        </div>
      </section>

      {/* DETECTORS */}
      <section id="detectors" className="pb-[clamp(80px,10vw,140px)]">
        <div className={`${WRAP} flex flex-col gap-14`}>
          <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
            <div className="flex max-w-[760px] flex-col gap-5">
              <span className="eyebrow">03 — Detectors</span>
              <h2 className="font-semibold leading-none tracking-[-0.04em] [text-wrap:balance]" style={{ fontSize: "clamp(36px, 5vw, 72px)" }}>Specialised detectors, <Em>not</Em> one giant prompt.</h2>
            </div>
            <p className="max-w-[380px] text-fg-3 [text-wrap:pretty]">Each detector does one job: checksums and RapidFuzz for records, an Isolation Forest for anomalies, all-MiniLM-L6-v2 embeddings for reworded duplicates. Their findings flow into the Data Decision Engine — numbers from code, words from AI.</p>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(520px,100%),1fr))] gap-4">
            <Card n="01" title="Duplicate datasets">
              <div className="flex flex-col gap-2 font-mono text-[13px]">
                {[["customer_data_2024.csv", "ARCHIVE"], ["customer_data_final.csv", "ARCHIVE"], ["customer_data_final2.csv", "DELETE"], ["customer_data_latest.csv", "KEEP"]].map(([f, a]) => (
                  <div key={f} className={`flex justify-between gap-3 rounded-[10px] bg-ink-950 px-3.5 py-2.5 ${a === "KEEP" ? "outline outline-1 outline-lime" : ""}`}>
                    <span className={a === "DELETE" ? "text-fg-3 line-through" : ""}>{f}</span>
                    <span className={a === "KEEP" ? "text-lime" : a === "DELETE" ? "text-risk" : "text-warn"}>{a}</span>
                  </div>
                ))}
              </div>
              <Stats items={[["97.1%", "Content similarity"], ["Rows + schema", "Compared, not filenames"]]} />
              <p className="text-sm text-fg-3">Compares contents and metadata — not just filenames — before suggesting anything.</p>
            </Card>

            <Card n="02" title="Duplicate rows">
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[380px] border-collapse font-mono text-[13px]">
                  <thead><tr className="text-left text-fg-3">{["ID", "Name", "Email"].map((h) => <th key={h} className="border-b border-line px-3.5 py-2.5 font-normal">{h}</th>)}</tr></thead>
                  <tbody>{[["101", "Rahul"], ["102", "Rahul Sharma"], ["103", "Rahul"]].map(([id, n]) => (
                    <tr key={id} className="bg-lime/[0.06]"><td className="px-3.5 py-2.5">{id}</td><td className="px-3.5 py-2.5">{n}</td><td className="px-3.5 py-2.5">rahul@gmail.com</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col"><span className="text-[28px] font-semibold tracking-[-0.03em]">96%</span><span className="text-[13px] text-fg-3">Duplicate confidence</span></div>
                <Choice opts={[{ id: "merge", label: "Merge" }, { id: "keep", label: "Keep both" }, { id: "ignore", label: "Ignore" }]} value={row} onPick={setRow} />
              </div>
              <p className={`min-h-[21px] text-sm ${row ? "text-lime" : "text-fg-3"}`}>{row ? rowMsg[row] : "Never merged automatically — and never when verified IDs like PAN conflict."}</p>
            </Card>

            <Card n="03" title="Unused columns">
              <div className="flex flex-wrap gap-2 font-mono text-[13px]">
                {["customer_id", "name", "email", "phone", "address", "age"].map((c) => <span key={c} className="rounded-lg bg-ink-950 px-3 py-2">{c}</span>)}
                <span className="rounded-lg border border-dashed border-warn px-3 py-2 text-warn">fax_number</span>
                <span className="rounded-lg bg-ink-950 px-3 py-2 text-fg-3">middle_name</span>
                <span className="rounded-lg bg-ink-950 px-3 py-2 text-fg-3">old_customer_code</span>
              </div>
              <Stats items={[["3 yrs ago", "Last referenced"], ["0 systems", "Used by"], ["Query log", "Evidence"]]} small />
              <p className="font-serif text-xl italic leading-[1.35] text-fg-2">“fax_number has not been referenced by any detected workflow for 36 months.” <span className="font-mono text-xs not-italic text-warn">→ ARCHIVE</span></p>
            </Card>

            <Card n="04" title="Old file versions">
              <div className="flex flex-col font-mono text-[13px]">
                <div className="flex items-center gap-3.5 py-[7px] text-fg-3"><span className="h-[9px] w-[9px] flex-none rounded-full border-[1.5px] border-fg-3" />Report.xlsx</div>
                {["Report_v2.xlsx", "Report_final.xlsx", "Report_final2.xlsx", "Report_FINAL_REAL.xlsx"].map((r) => (
                  <div key={r} className="ml-1 border-l-[1.5px] border-line-2 py-[7px] pl-[18px] text-fg-3">{r}</div>
                ))}
                <div className="mt-1.5 flex items-center justify-between gap-3.5 rounded-[10px] px-3.5 py-3 outline outline-1 outline-lime">
                  <span className="flex items-center gap-3"><span className="h-[9px] w-[9px] flex-none rounded-full bg-lime" />Report_FINAL_REAL_NEW.xlsx</span>
                  <span className="text-[11px] text-lime">LATEST</span>
                </div>
              </div>
              <p className="text-sm text-fg-3">Everyone has seen this folder. DataGuardian reconstructs the version chain, confirms it by content, and surfaces the latest meaningful file.</p>
            </Card>

            <Card n="05" title="Redundant backups">
              <div className="flex flex-col gap-1.5 font-mono text-[13px]">
                {([["backup_05", "#ECEDE6", "latest", "text-fg"], ["backup_04", "#C9F25C", "useful", "text-lime"], ["backup_03", "#FF8A4C", "100% same", "text-fg-2"],
                  ["backup_02", "#FF8A4C", "99.95% same", "text-fg-2"], ["backup_01", "#3A403B", "obsolete", "text-fg-3"]] as const).map(([n, c, l, tc]) => (
                  <div key={n} className="grid grid-cols-[100px_minmax(0,1fr)_96px] items-center gap-3.5"><span>{n}</span><span className="h-1.5 rounded-full" style={{ background: c }} /><span className={`text-right ${tc}`}>{l}</span></div>
                ))}
              </div>
              <Stats items={[["Keep 2", "Distinct restore points"], ["Delete / archive", "The rest, with undo"]]} />
            </Card>

            <Card n="06" title="Huge files, little value">
              <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-ink-950 p-6">
                <div className="flex flex-col gap-1.5"><span className="font-mono text-sm">marketing_old.zip</span><span className="text-[13px] text-fg-3">Contains 2019 campaign assets</span></div>
                <span className="text-[64px] font-semibold leading-[0.85] tracking-[-0.05em]">4<span className="text-[22px] tracking-normal text-fg-3"> yrs cold</span></span>
              </div>
              <Stats items={[["1,459 days", "Last accessed"], ["2 users", "With access"], ["Low", "Business value"]]} small warnLast />
              <p className="text-sm text-fg-3">Smarter than sorting by size: weighs cost against usage and audience. Suggested: archive to cold storage at ~4% of the cost.</p>
            </Card>

            <article className="lift flex flex-col gap-6 rounded-panel border border-risk/30 bg-[linear-gradient(160deg,rgba(255,138,76,0.09),#101311_55%)] p-[clamp(20px,3vw,32px)]">
              <div className="flex items-baseline justify-between gap-4"><h3 className="text-[26px] font-semibold tracking-[-0.03em]">Sensitive data</h3><span className="font-mono text-xs text-fg-3">07</span></div>
              <div className="flex flex-wrap gap-2 font-mono text-xs">
                {["Aadhaar (Verhoeff)", "PAN", "Phone numbers", "Emails", "Bank info", "API keys", "Passwords"].map((p) => (
                  <span key={p} className="rounded-full border border-risk/45 px-[11px] py-[7px] text-risk-soft">{p}</span>
                ))}
              </div>
              <div className="flex flex-col gap-3.5 rounded-2xl bg-ink-950 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-sm">customer_backup_2023.csv</span><span className="rounded-md bg-risk px-2.5 py-1 font-mono text-[11px] font-medium text-ink-950">RISK: HIGH</span></div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(120px,100%),1fr))] gap-3 text-[13px] text-fg-3">
                  <span><span className="block text-xl font-semibold text-fg">45,000</span>Aadhaar records</span>
                  <span><span className="block text-xl font-semibold text-fg">3.7 yrs</span>unused (DPDP)</span>
                  <span><span className="block text-xl font-semibold text-risk">14 users</span>current access</span>
                </div>
              </div>
              <p className="text-sm text-fg-3">Suggested: restrict access · encrypt · erase after the DPDP retention window.</p>
            </article>

            <Card n="08" title="Anomalous values">
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[380px] border-collapse font-mono text-[13px]">
                  <thead><tr className="text-left text-fg-3">{["Column", "Value", "Median", "Robust z"].map((h) => <th key={h} className="border-b border-line px-3.5 py-2.5 font-normal">{h}</th>)}</tr></thead>
                  <tbody>{[["age", "250", "45", "+9.9"], ["lifetime_value_inr", "9,85,00,000", "14,687", "+12.8 log"], ["monthly_salary_inr", "9", "2,20,214", "100× below"]].map(([c, v, m, z]) => (
                    <tr key={c}><td className="px-3.5 py-2.5">{c}</td><td className="px-3.5 py-2.5 text-risk">{v}</td><td className="px-3.5 py-2.5 text-fg-3">{m}</td><td className="px-3.5 py-2.5 text-warn">{z}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <Stats items={[["Isolation Forest", "Fitted per dataset"], ["+ robust z", "Explains which value"]]} />
              <p className="text-sm text-fg-3">A customer aged 250 or a ₹9.85-crore lifetime value is flagged only when the forest and the statistics agree, then quarantined for review, never silently “fixed”.</p>
            </Card>

            <article className="lift flex flex-col justify-between gap-8 rounded-panel border border-[rgba(236,237,230,0.1)] bg-fg p-[clamp(20px,3vw,32px)] text-ink-950 [grid-column:1/-1]">
              <div className="flex items-baseline justify-between gap-4"><h3 className="text-[26px] font-semibold tracking-[-0.03em]">Data Decision Engine</h3><span className="font-mono text-xs text-fg-ink">09</span></div>
              <p className="font-serif leading-[1.1] tracking-[-0.01em] [text-wrap:balance]" style={{ fontSize: "clamp(28px, 3vw, 40px)" }}>Every detector feeds one engine that weighs value against risk and cost — and returns a single, explainable verdict.</p>
              <div className="flex flex-wrap gap-2 font-mono text-[13px] font-medium">
                {["KEEP", "CLEAN", "ARCHIVE", "SECURE", "DELETE"].map((v) => <span key={v} className="rounded-[10px] bg-ink-950 px-3.5 py-2.5 text-fg">{v}</span>)}
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* EXPLAINABLE */}
      <section id="explainable" className="border-y border-line bg-ink-900 py-[clamp(80px,10vw,140px)]">
        <div className={`${WRAP} flex flex-wrap items-center gap-16`}>
          <div className="flex flex-[1_1_440px] flex-col gap-7">
            <span className="eyebrow">04 — Explainable by design</span>
            <h2 className="font-semibold leading-[0.95] tracking-[-0.045em]" style={{ fontSize: "clamp(40px, 6vw, 88px)" }}>AI that <Em className="text-lime">shows</Em> its work.</h2>
            <p className="max-w-[480px] text-lg text-fg-2 [text-wrap:pretty]">It never just says “DELETE THIS FILE.” Every recommendation comes with its evidence, a confidence score, and a human making the final call. Trustworthy, not dangerous.</p>
            <div className="flex flex-col border-t border-[rgba(236,237,230,0.1)]">
              {[["A", "Nothing is deleted automatically — deletes go to a restorable trash."], ["B", "Every action lists the signals behind it."], ["C", "Keep, ignore or undo in one click."]].map(([k, t]) => (
                <div key={k} className="flex gap-5 border-b border-[rgba(236,237,230,0.1)] py-[18px]"><span className="pt-[3px] font-mono text-xs text-fg-3">{k}</span><span>{t}</span></div>
              ))}
            </div>
          </div>
          <div className="flex max-w-[560px] flex-[1_1_460px] flex-col gap-6 rounded-[28px] border border-[rgba(236,237,230,0.12)] bg-ink-950 p-[clamp(24px,3vw,36px)] shadow-[0_50px_100px_-40px_rgba(0,0,0,0.9)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-[13px] text-fg-2">marketing_old.zip · cold 4 years</span>
              <span className="font-mono text-xs text-fg-3">Confidence <span className="text-sm text-lime">95%</span></span>
            </div>
            <div className="flex flex-col gap-1"><span className="text-[13px] text-fg-3">Recommended action</span><span className="text-[52px] font-semibold leading-none tracking-[-0.045em]">Archive</span></div>
            <div className="h-1 rounded-full bg-fg/[0.08]"><div className="h-full w-[95%] rounded-full bg-lime" /></div>
            <div className="flex flex-col gap-1">
              <span className="label mb-2 text-xs text-fg-3">Why?</span>
              {[["Last accessed", "1,459 days ago"], ["Contains", "27 files from 2019"], ["Users with access", "2"], ["Owner", "Marketing"], ["Sensitive information", "None detected"], ["Cold-tier cost", "~4% of today’s"]].map(([k, v], i, a) => (
                <div key={k} className={`flex justify-between gap-4 py-[9px] text-[15px] ${i < a.length - 1 ? "border-b border-dashed border-[rgba(236,237,230,0.1)]" : ""}`}><span className="text-fg-2">{k}</span><span>{v}</span></div>
              ))}
            </div>
            <Choice opts={[{ id: "archive", label: "Archive" }, { id: "keep", label: "Keep" }, { id: "ignore", label: "Ignore" }]} value={rec} onPick={setRec} />
            <p className={`min-h-[21px] text-sm ${rec ? "text-lime" : "text-fg-3"}`}>{rec ? recMsg[rec] : "Waiting for your decision."}</p>
          </div>
        </div>
      </section>

      {/* ACTION CENTER */}
      <section id="action-center" className="py-[clamp(80px,10vw,140px)]">
        <div className={`${WRAP} flex flex-col gap-12`}>
          <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
            <div className="flex max-w-[760px] flex-col gap-5">
              <span className="eyebrow">05 — AI Action Center</span>
              <h2 className="font-semibold leading-none tracking-[-0.04em] [text-wrap:balance]" style={{ fontSize: "clamp(36px, 5vw, 72px)" }}>Thousands of files. <Em>Five</Em> decisions.</h2>
            </div>
            <p className="max-w-[380px] text-fg-3 [text-wrap:pretty]">Instead of inspecting files one by one, your team reviews a prioritised queue — ranked by risk and rupees saved.{L && " These are the live top items from your workspace."}</p>
          </div>
          <div className="flex flex-col border-t border-[rgba(236,237,230,0.14)]">
            {queue.map((q, i) => (
              <div key={i} className="row-hover flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-[rgba(236,237,230,0.14)] px-2 py-7">
                <span className={`flex-none rounded-md px-2.5 py-1 font-mono text-[11px] font-medium text-ink-950 ${q.sev === "HIGH" ? "bg-risk" : q.sev === "MED" ? "bg-warn" : "bg-fg-3"}`}>{q.sev}</span>
                <span className="flex-[1_1_320px] font-medium tracking-[-0.025em]" style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}>{q.title}</span>
                <span className={`flex-[0_1_220px] font-mono text-sm ${q.risk ? "text-risk" : "text-lime"}`}>{q.meta}</span>
                <Link href={q.href} className={`inline-flex min-h-[44px] items-center rounded-full px-5 text-sm ${i === queue.length - 1 ? "bg-fg font-semibold text-ink-950" : "border border-line-3 font-medium hover:border-lime/60"}`}>
                  {i === queue.length - 1 ? "Review all" : "Review"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="relative overflow-hidden bg-lime py-[clamp(96px,12vw,180px)] text-ink-950">
        <div className={`${WRAP} flex flex-col gap-10`}>
          <span className="font-mono text-xs uppercase tracking-[0.1em]">From data overload to actionable intelligence</span>
          <h2 className="max-w-[12ch] font-semibold leading-[0.9] tracking-[-0.055em]" style={{ fontSize: "clamp(48px, 9vw, 148px)" }}>Know what to <Em>keep.</Em></h2>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <p className="max-w-[520px] text-lg [text-wrap:pretty]">Connect a folder, a database or a bucket. Get your Data Health Score and a ranked action plan in minutes.</p>
            <Link href="/dashboard" className="inline-flex min-h-[60px] items-center gap-3 rounded-full bg-ink-950 px-8 text-[17px] font-semibold text-fg hover:text-lime">Run your first scan <Arrow s={18} /></Link>
          </div>
        </div>
      </section>

      <footer className="py-10">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-4 text-sm text-fg-3`}>
          <Wordmark small />
          <span>Built for the COER Hackathon · India DPDP-ready</span>
          <span className="font-mono text-xs">Keep · Clean · Archive · Secure · Delete</span>
        </div>
      </footer>
    </div>
  );
}

function Card({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <article className="lift flex flex-col gap-6 rounded-panel border border-[rgba(236,237,230,0.1)] bg-ink-900 p-[clamp(20px,3vw,32px)]">
      <div className="flex items-baseline justify-between gap-4"><h3 className="text-[26px] font-semibold tracking-[-0.03em]">{title}</h3><span className="font-mono text-xs text-fg-3">{n}</span></div>
      {children}
    </article>
  );
}

function Stats({ items, small, warnLast }: { items: [string, string][]; small?: boolean; warnLast?: boolean }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(120px,100%),1fr))] gap-4 border-t border-line pt-5">
      {items.map(([v, l], i) => (
        <div key={l} className="flex flex-col">
          <span className={`font-semibold tracking-[-0.03em] ${small ? "text-[22px]" : "text-[28px]"} ${warnLast && i === items.length - 1 ? "text-warn" : ""}`}>{v}</span>
          <span className="text-[13px] text-fg-3">{l}</span>
        </div>
      ))}
    </div>
  );
}
