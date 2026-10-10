"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type Finding } from "@/lib/api";
import { ACTION_STYLE, FILTER_GROUPS, fmtBytes, fmtINR, fmtNum, KIND_LABEL, SOURCE_META } from "@/lib/format";
import { useSummary, useWsResource } from "@/components/hooks";
import { Confidence, ConfirmDialog, Empty, Kpi, Loading, SeverityPill, Spinner, useToast } from "@/components/ui";

type Pending = { f: Finding; action: "APPLY" | "KEEP" | "IGNORE" } | null;

function sizeLabel(f: Finding) {
  if (f.bytes_affected > 0 && f.category !== "quality" && f.category !== "risk") return fmtBytes(f.bytes_affected);
  if (f.records_affected > 0) return `${fmtNum(f.records_affected)} ${f.kind === "secret_exposed" ? "secrets" : "rows"}`;
  return fmtBytes(f.bytes_affected);
}

function ActionCenter() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const filter = params.get("filter") ?? "all";
  const { data, reload, wsId } = useWsResource<Finding[]>("/findings?status=all");
  const { data: s, reload: reloadSummary } = useSummary();
  const [busy, setBusy] = useState<string>("");
  const [confirm, setConfirm] = useState<Pending>(null);
  const [bulk, setBulk] = useState<{ would_apply: number; savings_inr_year: number; titles: string[] } | null>(null);

  const rows = useMemo(() => {
    const g = FILTER_GROUPS.find((x) => x.id === filter);
    const list = (data ?? []).filter((f) => !g || g.id === "all" || g.kinds.includes(f.kind));
    const rank = (f: Finding) => (f.status === "open" ? 0 : f.status === "resolved" ? 1 : 2);
    return [...list].sort((a, b) => rank(a) - rank(b) || b.priority - a.priority);
  }, [data, filter]);
  const counts = useMemo(() => Object.fromEntries(FILTER_GROUPS.map((g) => [g.id,
    (data ?? []).filter((f) => f.status === "open" && (g.id === "all" || g.kinds.includes(f.kind))).length])), [data]);
  const pending = (data ?? []).filter((f) => f.status === "open").length;
  const resolved = (data ?? []).length - pending;

  async function refreshAll() {
    await Promise.all([reload(), reloadSummary()]);
  }

  async function act(f: Finding, action: "APPLY" | "KEEP" | "IGNORE") {
    setBusy(f.id);
    try {
      const r = await api<{ action_id: string; note: string }>(`/workspaces/${wsId}/findings/${f.id}/actions`, { method: "POST", json: { action, confirm: true } });
      setConfirm(null);
      await refreshAll();
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
      await refreshAll();
      toast({ kind: "info", text: "Undone. Files, access and statuses are restored." });
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    }
  }

  async function previewBulk() {
    try {
      const r = await api<{ would_apply: number; savings_inr_year: number; titles: string[] }>(`/workspaces/${wsId}/findings/bulk-apply`, { method: "POST", json: { min_confidence: 0.95 } });
      if (!r.would_apply) toast({ kind: "info", text: "No open archive / delete / secure recommendations at ≥ 95% confidence." });
      else setBulk(r);
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    }
  }

  async function runBulk() {
    setBusy("bulk");
    try {
      const r = await api<{ applied: number; skipped: number }>(`/workspaces/${wsId}/findings/bulk-apply`, { method: "POST", json: { min_confidence: 0.95, confirm: true } });
      setBulk(null);
      await refreshAll();
      toast({ kind: "success", text: `Approved ${r.applied} recommendations${r.skipped ? ` (${r.skipped} already handled)` : ""}. Each one can be undone from the table or the audit log.` });
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  if (!data) return <Loading />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
        <Kpi label="Pending review" value={pending} />
        <Kpi label="Resolved in this scan" value={resolved} />
        <Kpi label="Savings from approved actions" value={fmtINR(s?.resolved.savings_inr_year ?? 0)} unit="/yr" tone="lime" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter findings" className="flex flex-wrap gap-1.5">
          {FILTER_GROUPS.map((g) => (
            <button key={g.id} aria-pressed={filter === g.id} className={`pill ${filter === g.id ? "pill-on" : ""}`}
              onClick={() => router.replace(g.id === "all" ? "/actions" : `/actions?filter=${g.id}`)}>
              {g.label} <span className="opacity-60">{counts[g.id]}</span>
            </button>
          ))}
        </div>
        <button onClick={previewBulk} className="flex min-h-[40px] items-center rounded-full border border-lime px-4 text-[13px] font-semibold text-lime hover:bg-lime/10">
          Approve all ≥ 95% confidence
        </button>
      </div>

      {!rows.length ? <Empty title="Nothing in this category" body="No recommendations match this filter." /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-ink-875">
          <table className="w-full min-w-[1040px] border-collapse">
            <thead>
              <tr>
                <th className="th pl-[18px]">Finding</th><th className="th">Severity</th><th className="th">Source</th><th className="th">Size</th>
                <th className="th">Saving</th><th className="th">Confidence</th><th className="th pr-[18px] text-right">AI recommendation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const st = ACTION_STYLE[f.action];
                const done = f.status !== "open";
                const doneLabel = f.status === "dismissed" ? (f.resolution === "KEEP" ? "Kept" : "Ignored") : f.resolution === "AUTO" ? "Resolved by another action" : ACTION_STYLE[f.resolution as keyof typeof ACTION_STYLE]?.done ?? f.resolution;
                return (
                  <tr key={f.id} className={`row-hover ${f.status === "dismissed" ? "opacity-55" : ""}`}>
                    <td className="td max-w-[380px] pl-[18px]">
                      <Link href={`/findings/${f.id}`} className="flex flex-col gap-0.5 hover:text-lime">
                        <span className="font-mono text-[13px] text-fg">{f.title}</span>
                        <span className="line-clamp-1 text-xs text-fg-3">{KIND_LABEL[f.kind]} · {f.summary}</span>
                      </Link>
                    </td>
                    <td className="td"><SeverityPill severity={f.severity} /></td>
                    <td className="td whitespace-nowrap">{SOURCE_META[f.source ?? ""]?.name ?? "—"}</td>
                    <td className="td whitespace-nowrap font-mono text-[13px] text-fg">{sizeLabel(f)}</td>
                    <td className="td whitespace-nowrap font-mono text-[13px] text-fg">
                      {f.savings_inr_year >= 1 ? `${fmtINR(f.savings_inr_year)}/yr` : f.category === "risk" ? <span className="text-risk">Risk ↓</span> : "—"}
                    </td>
                    <td className="td"><Confidence value={f.confidence} /></td>
                    <td className="td pr-[18px]">
                      {!done ? (
                        <div className="flex justify-end gap-1.5">
                          {f.action === "CLEAN" || f.action === "KEEP" ? (
                            <Link href={`/findings/${f.id}`} className="btn-light btn-sm">{f.action === "CLEAN" ? "Clean" : "Review"}</Link>
                          ) : (
                            <button className={`btn-sm ${f.action === "DELETE" ? "btn-danger" : "btn-light"}`} disabled={!!busy}
                              onClick={() => (f.action === "DELETE" ? setConfirm({ f, action: "APPLY" }) : act(f, "APPLY"))}>
                              {busy === f.id ? <Spinner /> : st.verb}
                            </button>
                          )}
                          <button className="btn-secondary btn-sm px-3" disabled={!!busy} onClick={() => act(f, "KEEP")}>Keep</button>
                          <button className="btn-ghost btn-sm px-3" disabled={!!busy} onClick={() => act(f, "IGNORE")}>Ignore</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2.5">
                          <span className={`font-mono text-xs ${f.status === "resolved" ? "text-lime" : "text-fg-2"}`}>✓ {doneLabel}</span>
                          {f.action_id && <button className="btn-secondary btn-sm px-3 text-fg-2" onClick={() => undo(f.action_id!)}>Undo</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[13px] text-fg-3">Nothing changes in your storage until you approve it. Deletes go to a restorable trash, and every action is logged and reversible.</p>

      <ConfirmDialog open={!!confirm} danger busy={!!busy} title={`Delete: ${confirm?.f.title ?? ""}`} confirmLabel="Move to trash"
        body={<>Targets move to a <b className="text-fg">restorable trash</b>, not a permanent delete. You can undo this from the toast, this table or the audit log.</>}
        onClose={() => setConfirm(null)} onConfirm={() => confirm && act(confirm.f, confirm.action)} />
      <ConfirmDialog open={!!bulk} busy={busy === "bulk"} title={`Approve ${bulk?.would_apply ?? 0} high-confidence recommendations?`} confirmLabel="Approve all"
        body={bulk && <>
          <p>Applies every open archive / delete / secure recommendation with ≥ 95% confidence{bulk.savings_inr_year ? `, saving about ${fmtINR(bulk.savings_inr_year)}/yr` : ""}. Clean-ups that need review are not included.</p>
          <ul className="mt-3 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-fg-3">{bulk.titles.map((t) => <li key={t}>{t}</li>)}</ul>
        </>}
        onClose={() => setBulk(null)} onConfirm={runBulk} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><ActionCenter /></Suspense>;
}
