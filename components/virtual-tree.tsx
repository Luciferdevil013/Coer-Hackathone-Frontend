"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, CheckCircle2, CircleAlert, Info, RotateCcw, ShieldCheck, Terminal, XCircle } from "lucide-react";
import { api, type DiffResponse, type DiffRow, type ImpactResponse, type PatchOp, type VaultCommit, type VirtualTreeMeta } from "@/lib/api";
import { fmtBytes, fmtNum, fmtTime } from "@/lib/format";
import { ConfirmDialog, Spinner, useToast } from "@/components/ui";

/** Diff colours: red = removed from the file, yellow = identifier masked, green = value normalized. */
export const OP_STYLE: Record<PatchOp, { label: string; chip: string; cell: string; glyph: string }> = {
  DELETE: { label: "Deleted (duplicate)", chip: "border-risk/40 bg-risk/10 text-risk", cell: "bg-risk/10", glyph: "−" },
  QUARANTINE: { label: "Quarantined", chip: "border-risk-soft/40 bg-risk-soft/10 text-risk-soft", cell: "bg-risk-soft/10", glyph: "⊘" },
  REDACT: { label: "Masked PII", chip: "border-warn/40 bg-warn/10 text-warn", cell: "bg-warn/10", glyph: "~" },
  NORMALIZE: { label: "Normalized", chip: "border-lime/40 bg-lime/10 text-lime", cell: "bg-lime/10", glyph: "~" },
};

export function MutationStrip({ vdt }: { vdt: VirtualTreeMeta }) {
  const m = vdt.virtual_mutations;
  const delta = m.storage_delta_bytes;
  const items: [string, React.ReactNode, string?][] = [
    ["Records mounted", fmtNum(vdt.total_records)],
    ["Duplicates pruned", fmtNum(m.pruned_duplicates), m.pruned_duplicates ? "text-risk" : undefined],
    ["Quarantined", fmtNum(m.quarantined_rows), m.quarantined_rows ? "text-risk-soft" : undefined],
    ["PII cells masked", fmtNum(m.masked_pii_cells), m.masked_pii_cells ? "text-warn" : undefined],
    ["Cells normalized", fmtNum(m.normalized_cells), m.normalized_cells ? "text-lime" : undefined],
    ["Storage delta", delta == null ? "n/a" : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${fmtBytes(Math.abs(delta))}`, delta != null && delta < 0 ? "text-lime" : undefined],
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([k, v, tone]) => (
        <div key={k} className="bg-ink-950 p-3.5">
          <div className="label">{k}</div>
          <div className={`mt-1 text-xl font-semibold tracking-[-0.03em] ${tone ?? "text-fg"}`}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/** Make invisible differences visible: leading/trailing/double spaces become ␣. */
export function visible(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (!s) return "∅";
  return s.replace(/^ +| +$/g, (m) => "␣".repeat(m.length)).replace(/ {2,}/g, (m) => "␣".repeat(m.length));
}

const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function DiffInspector({ wsId, runId }: { wsId: string; runId: string }) {
  const toast = useToast();
  const [op, setOp] = useState<PatchOp | "">("");
  const [data, setData] = useState<DiffResponse | null>(null);
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ offset: String(offset), limit: "40", ...(op ? { op } : {}) });
      const d = await api<DiffResponse>(`/workspaces/${wsId}/runs/${runId}/diff?${q}`);
      setData(d);
      setRows((cur) => (offset === 0 ? d.rows : [...cur, ...d.rows]));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [wsId, runId, op]);

  useEffect(() => { setRows([]); load(0); }, [load]);
  useEffect(() => { if (error) toast({ kind: "error", text: error }); }, [error, toast]);

  if (!data) return <div className="flex justify-center p-10 text-fg-4">{error ? <span className="text-sm text-risk">{error}</span> : <Spinner />}</div>;
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const cols = data.columns;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-2.5">
        <FilterChip active={op === ""} onClick={() => setOp("")} cls="border-line-3 text-fg-2">All · {fmtNum(total)}</FilterChip>
        {(Object.keys(OP_STYLE) as PatchOp[]).map((k) => (
          <FilterChip key={k} active={op === k} onClick={() => setOp(k)} cls={OP_STYLE[k].chip} disabled={!data.counts[k]}>
            {OP_STYLE[k].label} · {fmtNum(data.counts[k])}
          </FilterChip>
        ))}
        {data.dropped_columns.length > 0 && <span className="ml-auto text-xs text-risk">Columns dropped: {data.dropped_columns.join(", ")}</span>}
      </div>
      {!rows.length ? <div className="p-8 text-center text-sm text-fg-3">{loading ? <Spinner /> : "No changes of this kind."}</div> : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full border-separate border-spacing-0 font-mono text-xs">
            <thead className="sticky top-0 z-10 bg-ink-850">
              <tr>
                <th className="th w-6 px-2" aria-label="change" />
                <th className="th whitespace-nowrap px-2">row</th>
                {cols.map((c) => <th key={c} className={`th whitespace-nowrap px-2 ${data.dropped_columns.includes(c) ? "text-risk line-through" : ""}`}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <DiffLine key={r.row_id} row={r} cols={cols} />)}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-xs text-fg-3">
        Showing {fmtNum(rows.length)} of {fmtNum(data.total_rows)} affected rows
        {rows.length < data.total_rows && (
          <button className="btn-ghost btn-sm min-h-0 px-2 py-1" onClick={() => load(rows.length)} disabled={loading}>
            {loading ? <Spinner className="h-3 w-3" /> : null} Load more
          </button>
        )}
        <span className="ml-auto">Identifiers are shown masked (••); only their shape changes are visible.</span>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, cls, disabled, children }: { active: boolean; onClick: () => void; cls: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-35 ${cls} ${active ? "ring-1 ring-current" : "opacity-70 hover:opacity-100"}`}>
      {children}
    </button>
  );
}

function DiffLine({ row, cols }: { row: DiffRow; cols: string[] }) {
  const removed = row.status === "DELETE" || row.status === "QUARANTINE";
  const st = removed ? OP_STYLE[row.status as PatchOp] : null;
  const glyph = st ? st.glyph : "~";
  return (
    <>
      <tr className={st ? st.cell : ""}>
        <td className={`border-b border-line px-2 py-2 text-center font-bold ${st ? (row.status === "DELETE" ? "text-risk" : "text-risk-soft") : "text-fg-4"}`}>{glyph}</td>
        <td className="whitespace-nowrap border-b border-line px-2 py-2 text-fg-4">{row.row_id}</td>
        {cols.map((c) => {
          const cell = row.cells[c];
          if (removed) return <td key={c} className="whitespace-nowrap border-b border-line px-2 py-2 text-fg-3 line-through decoration-risk/60">{clip(row.values[c] ?? "")}</td>;
          if (!cell) return <td key={c} className="whitespace-nowrap border-b border-line px-2 py-2 text-fg-4">{clip(row.values[c] ?? "")}</td>;
          const s = OP_STYLE[cell.op];
          return (
            <td key={c} className={`whitespace-nowrap border-b border-line px-2 py-1.5 ${s.cell}`} title={`${cell.operator} (${cell.step})`}>
              <div className="whitespace-pre text-fg-4 line-through">{clip(visible(cell.before))}</div>
              <div className={`whitespace-pre font-medium ${cell.op === "REDACT" ? "text-warn" : "text-lime"}`}>{clip(visible(cell.after))}</div>
            </td>
          );
        })}
      </tr>
      {removed && (
        <tr className={st!.cell}>
          <td className="border-b border-line" />
          <td colSpan={cols.length + 1} className={`border-b border-line px-2 pb-2 text-[11px] ${row.status === "DELETE" ? "text-risk" : "text-risk-soft"}`}>
            {row.status === "DELETE" ? "DELETE" : "QUARANTINE"} · {row.reason}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------- downstream impact

const CHECK_ICON = {
  pass: <CheckCircle2 className="h-4 w-4 shrink-0 text-lime" />,
  warn: <CircleAlert className="h-4 w-4 shrink-0 text-warn" />,
  fail: <XCircle className="h-4 w-4 shrink-0 text-risk" />,
  info: <Info className="h-4 w-4 shrink-0 text-fg-3" />,
};

export function ImpactPanel({ wsId, runId }: { wsId: string; runId: string }) {
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    api<ImpactResponse>(`/workspaces/${wsId}/runs/${runId}/impact`).then(setData).catch((e) => setError((e as Error).message));
  }, [wsId, runId]);
  if (error) return <div className="p-4 text-sm text-risk">{error}</div>;
  if (!data) return <div className="flex justify-center p-6 text-fg-4"><Spinner /></div>;
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div>
        <div className="label mb-2">Pipeline contract checks</div>
        <ul className="space-y-2">
          {data.checks.map((c, i) => (
            <li key={i} className="flex gap-2.5 rounded-lg border border-line bg-ink-950 p-2.5 text-sm">
              {CHECK_ICON[c.status]}
              <div><div className="font-medium text-fg">{c.name}</div><div className="text-xs text-fg-3">{c.detail}</div></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        {data.aggregates.length > 0 && (
          <div>
            <div className="label mb-2">Aggregates analytics would see</div>
            <table className="w-full text-xs">
              <thead><tr><th className="th px-2">column</th><th className="th px-2">sum before → after</th><th className="th px-2">mean drift</th><th className="th px-2">median drift</th></tr></thead>
              <tbody>{data.aggregates.map((a) => (
                <tr key={a.column}><td className="td px-2 py-2 font-mono">{a.column}</td>
                  <td className="td px-2 py-2">{fmtNum(a.sum_before)} → {fmtNum(a.sum_after)}</td>
                  <td className={`td px-2 py-2 ${Math.abs(a.mean_drift_pct) > 5 ? "text-warn" : "text-fg-2"}`}>{a.mean_drift_pct > 0 ? "+" : ""}{a.mean_drift_pct}%</td>
                  <td className={`td px-2 py-2 ${Math.abs(a.median_drift_pct) > 5 ? "text-warn" : "text-fg-2"}`}>{a.median_drift_pct > 0 ? "+" : ""}{a.median_drift_pct}%</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {data.distributions.map((d) => (
          <div key={d.column}>
            <div className="label mb-2">{d.column} · share before → after (max shift {d.max_share_shift_pp} pp)</div>
            <div className="space-y-1.5">
              {d.top.map((t) => (
                <div key={t.value} className="grid grid-cols-[110px_1fr_88px] items-center gap-2 text-xs">
                  <span className="truncate font-mono text-fg-2">{t.value}</span>
                  <span className="relative h-2 overflow-hidden rounded-full bg-fg/10">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-fg/30" style={{ width: `${t.before}%` }} />
                    <span className="absolute inset-y-0 left-0 rounded-full border-r-2 border-lime" style={{ width: `${t.after}%` }} />
                  </span>
                  <span className="text-right text-fg-3">{t.before}% → {t.after}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!data.aggregates.length && !data.distributions.length && <div className="text-sm text-fg-3">No numeric or categorical columns to compare.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- vault

export function CommitReceipt({ vc, onRollback, busy }: { vc: VaultCommit; onRollback?: () => void; busy?: boolean }) {
  return (
    <div className="rounded-xl border border-lime/30 bg-lime/5 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ShieldCheck className="h-4 w-4 text-lime" />
        <span className="font-semibold text-fg">{vc.status === "committed" ? "Patch committed in place" : "Rolled back"}</span>
        <code className="text-xs text-fg-4">commit {vc.id}</code>
        {onRollback && vc.status === "committed" && (
          <button className="btn-secondary btn-sm ml-auto" onClick={onRollback} disabled={busy}><RotateCcw className="h-3.5 w-3.5" /> Roll back</button>
        )}
      </div>
      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
        <div><div className="label">Original snapshot</div><div className="mt-1 text-fg-2">{fmtBytes(vc.original_bytes)} → {fmtBytes(vc.vault_bytes)} ({vc.codec}, {vc.compression_ratio}×)</div>
          <div className="truncate font-mono text-fg-4" title={vc.original_sha256}>sha256 {vc.original_sha256.slice(0, 16)}…</div></div>
        <div><div className="label">Vault location</div><div className="mt-1 truncate font-mono text-fg-2" title={vc.vault_file}>{vc.vault_file}</div></div>
        <div><div className="label">Swapped in</div><div className="mt-1 text-fg-2">{fmtBytes(vc.new_bytes)} via atomic rename</div>
          <div className="truncate font-mono text-fg-4" title={vc.new_sha256}>sha256 {vc.new_sha256.slice(0, 16)}…</div></div>
      </div>
      {vc.status === "committed" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-ink-950 px-3 py-2 font-mono text-xs text-fg-2">
          <Terminal className="h-3.5 w-3.5 text-fg-4" /> ./dataguardian rollback {vc.id}
        </div>
      )}
    </div>
  );
}

export function VaultHistory({ wsId, refreshKey, onChange }: { wsId: string; refreshKey: number; onChange?: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<VaultCommit[] | null>(null);
  const [pending, setPending] = useState<VaultCommit | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api<VaultCommit[]>(`/workspaces/${wsId}/commits`).then(setRows).catch(() => setRows([])); }, [wsId]);
  useEffect(load, [load, refreshKey]);

  async function rollback() {
    if (!pending) return;
    setBusy(true);
    try {
      await api(`/workspaces/${wsId}/commits/${pending.id}/rollback`, { method: "POST" });
      toast({ kind: "success", text: `${pending.file_name} restored byte-for-byte from the vault.` });
      setPending(null);
      load();
      onChange?.();
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!rows?.length) return null;
  return (
    <div className="card mt-4 p-5">
      <div className="flex items-center gap-2"><Archive className="h-4 w-4 text-fg-3" /><div className="font-semibold">Vault & rollback journal</div>
        <span className="text-xs text-fg-3">Originals of in-place commits, compressed in .dataguardian/vault/</span></div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr><th className="th">Commit</th><th className="th">File</th><th className="th">When</th><th className="th">Patch</th><th className="th">Vault</th><th className="th" /></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="td font-mono text-xs">{c.id}</td>
                <td className="td">{c.file_name}</td>
                <td className="td text-xs">{fmtTime(c.created_at)} · {c.actor}</td>
                <td className="td text-xs">{fmtNum(c.mutations.pruned_duplicates ?? 0)} pruned · {fmtNum(c.mutations.masked_pii_cells ?? 0)} masked · {fmtNum(c.mutations.normalized_cells ?? 0)} normalized</td>
                <td className="td text-xs">{fmtBytes(c.vault_bytes)} {c.codec}</td>
                <td className="td text-right">
                  {c.status === "committed"
                    ? <button className="btn-secondary btn-sm" onClick={() => setPending(c)}><RotateCcw className="h-3.5 w-3.5" /> Roll back</button>
                    : <span className="text-xs text-fg-4">rolled back {fmtTime(c.rolled_back_at)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog open={!!pending} title={`Roll back ${pending?.file_name}?`} busy={busy} confirmLabel="Restore original" onClose={() => setPending(null)} onConfirm={rollback}
        body={pending && <>Restores the original {fmtBytes(pending.original_bytes)} from the vault after verifying its SHA-256, swaps it in atomically, and reopens the findings this commit resolved. It is refused if the file changed after the commit.</>} />
    </div>
  );
}
