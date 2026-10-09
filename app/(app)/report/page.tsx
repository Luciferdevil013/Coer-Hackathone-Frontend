"use client";

import Link from "next/link";
import { CheckCircle2, Printer, XCircle } from "lucide-react";
import { fmtDate, fmtNum } from "@/lib/format";
import { useWsResource } from "@/components/hooks";
import { ActionBadge, Empty, PageHeader, Spinner } from "@/components/ui";

interface Report {
  has_scan: boolean; scan_finished_at: string; readiness_pct: number; total_records: number; disclaimer: string;
  workspace: { name: string; industry: string };
  checks: { id: string; title: string; detail: string; passed: boolean; ref: string }[];
  inventory: { finding_id: string; asset: string; path: string; kind: string; entities: Record<string, number>; records: number;
    shared_with: number; encrypted: boolean; days_since_use: number; past_retention: boolean; risk: number; severity: string;
    status: string; resolution: string; recommended: string }[];
}

export default function ReportPage() {
  const { data } = useWsResource<Report>("/reports/dpdp");
  if (!data) return <div className="flex justify-center py-24 text-fg-4"><Spinner className="h-6 w-6" /></div>;
  if (!data.has_scan) return <Empty title="No scan yet" body="Run a scan to generate the DPDP readiness report." />;
  const color = data.readiness_pct >= 80 ? "text-lime" : data.readiness_pct >= 50 ? "text-warn" : "text-risk";
  return (
    <>
      <PageHeader subtitle={<>{data.workspace.name} · generated from the scan of {fmtDate(data.scan_finished_at)}</>}
        actions={<button className="btn-secondary no-print" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / Save as PDF</button>} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="label">Technical readiness</div>
          <div className={`mt-2 text-5xl font-semibold ${color}`}>{data.readiness_pct}%</div>
          <div className="mt-1 text-sm text-fg-3">{data.checks.filter((c) => c.passed).length} of {data.checks.length} controls passing</div>
        </div>
        <div className="card p-5">
          <div className="label">Personal data records found</div>
          <div className="mt-2 text-4xl font-semibold">{fmtNum(data.total_records)}</div>
          <div className="mt-1 text-sm text-fg-3">across {data.inventory.filter((i) => i.kind === "sensitive_data").length} datasets</div>
        </div>
        <div className="card p-5 text-sm text-fg-2">
          <div className="label">Why this matters</div>
          <p className="mt-2">The Digital Personal Data Protection Rules, 2025 phase in by ~May 2027. Penalties reach ₹250 crore for failing to protect personal data, and data must be erased once its purpose is served.</p>
        </div>
      </div>

      <div className="card mt-4 divide-y divide-line">
        {data.checks.map((c) => (
          <div key={c.id} className="flex items-start gap-3 px-5 py-3">
            {c.passed ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-lime" /> : <XCircle className="mt-0.5 h-5 w-5 text-risk" />}
            <div className="flex-1">
              <div className="font-medium text-fg">{c.title}</div>
              <div className="text-sm text-fg-3">{c.detail}</div>
            </div>
            <span className="hidden text-xs text-fg-4 sm:block">{c.ref}</span>
          </div>
        ))}
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-line px-5 py-3 font-semibold">Personal data inventory</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-ink-850"><tr><th className="th">Dataset</th><th className="th">Data types</th><th className="th">Records</th><th className="th">Access</th><th className="th">Last used</th><th className="th">Recommendation</th><th className="th">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.inventory.map((i) => (
                <tr key={i.finding_id}>
                  <td className="td"><Link href={`/findings/${i.finding_id}`} className="font-medium text-fg hover:underline">{i.asset}</Link><div className="text-xs text-fg-4">{i.path}</div></td>
                  <td className="td text-xs">{Object.entries(i.entities ?? {}).map(([k, v]) => `${k} (${fmtNum(v)})`).join(", ")}</td>
                  <td className="td">{fmtNum(i.records)}</td>
                  <td className="td">{i.shared_with} users{i.encrypted ? " · enc" : ""}</td>
                  <td className="td">{i.days_since_use != null ? `${fmtNum(i.days_since_use)} days` : "—"}{i.past_retention && <div className="text-xs font-medium text-warn">past retention</div>}</td>
                  <td className="td"><ActionBadge action={i.recommended as never} /></td>
                  <td className="td text-xs">{i.status === "open" ? <span className="text-risk">open</span> : <span className="text-lime">{i.status} · {i.resolution}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-4 text-xs text-fg-3">{data.disclaimer}</p>
    </>
  );
}
