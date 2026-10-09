"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type SecurityView } from "@/lib/api";
import { fmtCompact, fmtNum, SOURCE_META } from "@/lib/format";
import { useSummary, useWsResource } from "@/components/hooks";
import { Empty, Kpi, Loading, SeverityPill, Spinner, useToast } from "@/components/ui";

export default function SecurityPage() {
  const { data, reload, wsId } = useWsResource<SecurityView>("/security");
  const { reload: reloadSummary } = useSummary();
  const toast = useToast();
  const [busy, setBusy] = useState("");

  async function restrict(findingId: string) {
    setBusy(findingId);
    try {
      const r = await api<{ action_id: string; note: string }>(`/workspaces/${wsId}/findings/${findingId}/actions`, { method: "POST", json: { action: "SECURE", confirm: true } });
      await Promise.all([reload(), reloadSummary()]);
      toast({ kind: "success", text: r.note, action: { label: "Undo", run: () => undo(r.action_id) } });
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function undo(actionId: string) {
    try {
      await api(`/workspaces/${wsId}/actions/${actionId}/undo`, { method: "POST" });
      await Promise.all([reload(), reloadSummary()]);
      toast({ kind: "info", text: "Access restored to its previous state." });
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    }
  }

  if (!data) return <Loading />;
  if (!data.has_scan) return <Empty title="No scan yet" body="Run a scan to find personal data and exposed credentials." />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
        <Kpi label={`Datasets shared with > ${data.exposure_threshold} users`} value={data.exposed_count} tone="risk" />
        <Kpi label="Personal-data records at risk" value={fmtCompact(data.risky_records)} sub={`${fmtNum(data.risky_records)} records in open findings`} />
        <Kpi label="Secured or erased" value={data.secured_count} tone="lime" sub={`${data.open_count} still open`} />
      </div>

      <section aria-labelledby="pii-h" className="card flex flex-col gap-4 p-[22px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pii-h" className="text-base font-semibold">Sensitive data detected</h2>
          <span className="font-mono text-[11px] text-fg-3">REGEX + CHECKSUM (VERHOEFF · LUHN) · SCANNED LOCALLY</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2.5">
          {data.entities.map((e) => (
            <div key={e.label} className="flex flex-col gap-1 rounded-xl border border-line bg-ink-950 p-3.5">
              <span className="text-xs text-fg-3">{e.label}</span>
              <span className="text-xl font-semibold tracking-[-0.02em]">{fmtCompact(e.count)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="overflow-x-auto rounded-card border border-line bg-ink-875">
        <table className="w-full min-w-[920px] border-collapse">
          <thead>
            <tr><th className="th pl-[18px]">File</th><th className="th">Risk</th><th className="th">PII found</th><th className="th">Records</th>
              <th className="th">Users with access</th><th className="th pr-[18px] text-right">Action</th></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const open = r.status === "open";
              const secured = r.resolution === "SECURE";
              return (
                <tr key={r.finding_id} className="row-hover">
                  <td className="td pl-[18px]">
                    <Link href={`/findings/${r.finding_id}`} className="flex flex-col gap-0.5 hover:text-lime">
                      <span className="font-mono text-[13px] text-fg">{r.file}</span>
                      <span className="text-xs text-fg-3">{SOURCE_META[r.source]?.name ?? r.source} · {r.path}</span>
                    </Link>
                  </td>
                  <td className="td"><SeverityPill severity={r.severity} /></td>
                  <td className="td text-risk-soft">{r.pii.join(" · ")}</td>
                  <td className="td font-mono text-[13px] text-fg">{fmtNum(r.records)}</td>
                  <td className={`td font-mono text-[13px] ${secured ? "text-lime" : (r.shared_with ?? 0) > data.exposure_threshold ? "text-risk" : "text-fg"}`}>
                    {secured ? "1 (owner only)" : `${r.shared_with} users`}{!secured && !r.encrypted && <span className="text-fg-3"> · unencrypted</span>}
                  </td>
                  <td className="td pr-[18px] text-right">
                    {open ? (
                      <div className="flex items-center justify-end gap-2">
                        {r.past_retention && <Link href={`/findings/${r.finding_id}`} className="font-mono text-[11px] text-warn hover:underline">DPDP erasure candidate →</Link>}
                        <button className="btn-danger btn-sm" disabled={!!busy} onClick={() => restrict(r.finding_id)}>
                          {busy === r.finding_id ? <Spinner /> : r.kind === "secret_exposed" ? "Lock & rotate" : "Restrict access"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2.5">
                        <span className="font-mono text-xs text-lime">✓ {r.resolution === "DELETE" ? "Erased (trash)" : r.resolution === "AUTO" ? "Resolved" : r.resolution === "SECURE" ? "Restricted" : r.resolution}</span>
                        {r.action_id && <button className="btn-secondary btn-sm px-3 text-fg-2" onClick={() => undo(r.action_id!)}>Undo</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-fg-3">Restricting moves the file into an owner-only vault (chmod 600) and records it in the audit trail. Raw values are never shown or sent to an AI model.</p>
    </div>
  );
}
