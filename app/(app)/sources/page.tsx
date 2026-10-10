"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FolderUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api, type Asset } from "@/lib/api";
import { ACTION_STYLE, fmtBytes, fmtDate, fmtNum, healthColor, SOURCE_META, timeAgo } from "@/lib/format";
import { useSummary, useWsResource } from "@/components/hooks";
import { ConfirmDialog, Loading, Spinner, useToast } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";

const MAX_UPLOAD_BYTES = 2 * 1024 ** 3; // backend MAX_UPLOAD_BYTES

/** The API's error detail when there is one; proxy/server errors come back as plain text, not JSON. */
async function errorText(r: Response, what: string): Promise<string> {
  const text = await r.text();
  try {
    const detail = JSON.parse(text).detail;
    if (detail) return typeof detail === "string" ? detail : JSON.stringify(detail);
  } catch { /* not JSON */ }
  return `${what} (HTTP ${r.status}${text && text.length < 120 ? `: ${text}` : ""})`;
}

interface Connector { id: string; name: string; type: string; connected: boolean; objects: number | null; mode: string }

function Sources() {
  const params = useSearchParams();
  const toast = useToast();
  const { current, refresh, setCurrent } = useWorkspace();
  const { data: s, reload: reloadSummary } = useSummary();
  const [source, setSource] = useState(params.get("source") ?? "");
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => setQ(params.get("q") ?? ""), [params]);
  const query = `/assets?limit=3000${source ? `&source=${source}` : ""}${status ? `&status=${status}` : ""}`;
  const { data: assets, reload, wsId } = useWsResource<Asset[]>(query, [query]);
  const { data: connectors, reload: reloadConn } = useWsResource<Connector[]>("/connectors");
  const [uploading, setUploading] = useState(false);
  const [newName, setNewName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const connRef = useRef<HTMLInputElement>(null);
  const [connKind, setConnKind] = useState("");
  const scanning = !!s?.running_scan;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => setSelected(new Set()), [query, wsId]);

  const shown = useMemo(() => (assets ?? []).filter((a) => !q || a.path.toLowerCase().includes(q.toLowerCase())).slice(0, 400), [assets, q]);

  async function scan() {
    if (!wsId) return;
    await api(`/workspaces/${wsId}/scans`, { method: "POST" });
    reloadSummary();
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !wsId) return;
    const total = Array.from(files).reduce((a, f) => a + f.size, 0);
    if (total > MAX_UPLOAD_BYTES) {
      toast({ kind: "error", text: `These files total ${fmtBytes(total)}; one upload can be at most ${fmtBytes(MAX_UPLOAD_BYTES)}. Upload them in smaller batches.` });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    try {
      const r = await fetch(`/api/workspaces/${wsId}/upload`, { method: "POST", body: fd });
      if (!r.ok) throw new Error(await errorText(r, `Upload of ${fmtBytes(total)} failed`));
      const body = await r.json();
      toast({ kind: "success", text: `Uploaded ${body.saved.length} files. Scanning…` });
      await scan();
      reloadConn();
      setTimeout(reload, 2500);
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function uploadConnector(files: FileList | null) {
    if (!files?.length || !wsId || !connKind) return;
    const fd = new FormData();
    fd.append("file", files[0]);
    try {
      const r = await fetch(`/api/workspaces/${wsId}/connectors/${connKind}`, { method: "POST", body: fd });
      if (!r.ok) throw new Error(await errorText(r, "Connector upload failed"));
      toast({ kind: "success", text: "Connector updated. Run a scan to apply it." });
      reloadConn();
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      if (connRef.current) connRef.current.value = "";
    }
  }

  const chosen = (assets ?? []).filter((a) => selected.has(a.id));
  const canTrash = (a: Asset) => a.status === "active" && a.source !== "s3-inventory";

  async function undoMany(ids: string[]) {
    try {
      for (const id of ids) await api(`/workspaces/${wsId}/actions/${id}/undo`, { method: "POST" });
      toast({ kind: "info", text: "Restored from trash." });
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    }
    reload();
    reloadSummary();
  }

  async function trashSelected() {
    if (!wsId || !chosen.length) return;
    setBusy("trash");
    try {
      const r = await api<{ action_ids: string[]; trashed: number; bytes: number }>(`/workspaces/${wsId}/assets/trash`,
        { method: "POST", json: { asset_ids: chosen.map((a) => a.id) } });
      setConfirmTrash(false);
      setSelected(new Set());
      toast({ kind: "success", text: `Moved ${r.trashed} file${r.trashed === 1 ? "" : "s"} (${fmtBytes(r.bytes)}) to trash. Restore any time from "In trash" or Audit & Undo.`,
        action: { label: "Undo", run: () => undoMany(r.action_ids) } });
      reload();
      reloadSummary();
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function restore(a: Asset) {
    setBusy(a.id);
    try {
      await api(`/workspaces/${wsId}/assets/${a.id}/restore`, { method: "POST" });
      toast({ kind: "success", text: `${a.path} restored.` });
      reload();
      reloadSummary();
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectable = shown.filter(canTrash);
  const allSelected = selectable.length > 0 && selectable.every((a) => selected.has(a.id));

  async function createWorkspace() {
    if (newName.trim().length < 2) return;
    try {
      const w = await api<{ id: string }>("/workspaces", { method: "POST", json: { name: newName.trim() } });
      await refresh();
      setCurrent(w.id);
      setNewName("");
      toast({ kind: "success", text: "Workspace created. Upload files to start." });
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    }
  }

  const extraConnectors = (connectors ?? []).filter((c) => c.id === "query_log" || c.id === "access_manifest");
  const lastScan = s?.scan?.finished_at;

  return (
    <div className="flex flex-col gap-4">
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      <input ref={connRef} type="file" className="hidden" accept=".csv,.json" onChange={(e) => uploadConnector(e.target.files)} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
        {(s?.by_source ?? []).map((src) => {
          const meta = SOURCE_META[src.id] ?? { abbr: "··", name: src.name, kind: "" };
          return (
            <section key={src.id} className="card flex flex-col gap-5 p-6">
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-ink-750 font-mono text-xs text-fg-2">{meta.abbr}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <h2 className="text-[17px] font-semibold">{meta.name}</h2>
                  <span className="truncate text-xs text-fg-3">{meta.kind}</span>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-fg-2"><span className="h-[7px] w-[7px] animate-pulsedot rounded-full bg-lime" />Live</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[44px] font-semibold leading-none tracking-[-0.045em]">{fmtBytes(src.bytes)}</span>
                <span className="font-mono text-[13px]" style={{ color: healthColor(src.health) }}>Health {src.health}</span>
              </div>
              <div className="h-1.5 rounded-full bg-fg/10"><div className="h-full rounded-full" style={{ width: `${src.health}%`, background: healthColor(src.health) }} /></div>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="flex flex-col"><span className="text-fg-3">Objects</span><span className="font-medium">{fmtNum(src.objects)}</span></div>
                <div className="flex flex-col"><span className="text-fg-3">Open issues</span><span className="font-medium">{fmtNum(src.issues)}</span></div>
                <div className="flex flex-col"><span className="text-fg-3">Reclaimable</span><span className="font-medium">{fmtBytes(src.reclaimable)}</span></div>
                <div className="flex flex-col"><span className="text-fg-3">Last scan</span><span className="font-medium">{scanning ? "Scanning…" : timeAgo(lastScan)}</span></div>
              </div>
              <button className="btn-secondary rounded-xl" onClick={scan} disabled={scanning}>{scanning ? "Scanning…" : "Rescan source"}</button>
            </section>
          );
        })}
        {extraConnectors.map((c) => (
          <section key={c.id} className="card flex flex-col gap-4 p-6">
            <div className="flex items-center gap-3.5">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-ink-750 font-mono text-xs text-fg-2">{c.id === "query_log" ? "QL" : "IAM"}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="text-[17px] font-semibold">{c.name}</h2>
                <span className="text-xs text-fg-3">{c.type}</span>
              </div>
              <span className={`font-mono text-[11px] ${c.connected ? "text-lime" : "text-fg-4"}`}>{c.connected ? "CONNECTED" : "NOT SET"}</span>
            </div>
            <p className="text-[13px] text-fg-3">{c.id === "query_log"
              ? "Database query history proves which columns are actually used. Without it, unused-column detection is switched off."
              : "Ownership, sharing and last-access data. File systems can't provide these, so exposure and staleness come from here."}</p>
            <button className="btn-secondary mt-auto rounded-xl" onClick={() => { setConnKind(c.id); setTimeout(() => connRef.current?.click(), 0); }}>
              {c.connected ? "Replace export" : "Connect"}
            </button>
          </section>
        ))}
        <section className="flex min-h-[280px] flex-col items-start justify-center gap-3.5 rounded-card border-[1.5px] border-dashed border-line-2 p-6">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Connect another source</h2>
          <p className="max-w-[300px] text-fg-3">{wsId
            ? "Upload CSV, Excel, JSON, PDF, DOCX, TXT, ZIP or SQLite files, or an AWS S3 inventory report."
            : "Create a workspace below first. Then upload CSV, Excel, JSON, PDF, DOCX, TXT, ZIP or SQLite files, or an AWS S3 inventory report."}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary rounded-xl" onClick={() => fileRef.current?.click()} disabled={!wsId || uploading}>
              {uploading ? <Spinner /> : <FolderUp className="h-4 w-4" />} Upload files
            </button>
            <button className="btn-secondary rounded-xl" onClick={() => { setConnKind("s3_inventory"); setTimeout(() => connRef.current?.click(), 0); }} disabled={!wsId}>S3 inventory CSV</button>
          </div>
        </section>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <Plus className="h-4 w-4 text-fg-4" />
        <input className="input max-w-xs" placeholder="New workspace (company) name" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New workspace name" />
        <button className="btn-secondary rounded-xl" onClick={createWorkspace} disabled={newName.trim().length < 2}>Create workspace</button>
        <span className="text-xs text-fg-3">Each workspace is an isolated tenant with its own data, rules and history{current ? ` · current: ${current.name}` : ""}.</span>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-ink-875">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <input className="input max-w-xs" placeholder="Search path…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search assets" />
          <select className="input w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
            <option value="">All sources</option><option value="upload">File uploads</option><option value="s3-inventory">AWS S3</option><option value="pipeline-output">Cleaned outputs</option>
          </select>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="active">Active</option><option value="archived">Archived</option><option value="trashed">In trash</option><option value="">All statuses</option>
          </select>
          {chosen.length > 0 && (
            <button className="btn-danger btn-sm rounded-xl" onClick={() => setConfirmTrash(true)} disabled={!!busy}>
              <Trash2 className="h-4 w-4" /> Move {chosen.length} to trash
            </button>
          )}
          <span className="ml-auto font-mono text-xs text-fg-3">{fmtNum(assets?.length ?? 0)} ASSETS · {fmtBytes((assets ?? []).reduce((a, x) => a + x.size_bytes, 0))}</span>
        </div>
        {!wsId ? <div className="p-8 text-sm text-fg-3">No workspace yet. Create one above, and your uploaded files will be listed here.</div>
          : !assets ? <Loading /> : !shown.length ? <div className="p-8 text-sm text-fg-3">{assets.length ? "No assets match." : "No files yet. Upload files to get started."}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse">
              <thead><tr>
                <th className="th w-10 pl-[18px]">{selectable.length > 0 && (
                  <input type="checkbox" className="h-4 w-4 accent-lime" aria-label="Select all files" checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((a) => a.id)))} />)}</th>
                <th className="th">Path</th><th className="th">Source</th><th className="th">Size</th><th className="th">Last used</th><th className="th">Owner</th><th className="th">Access</th><th className="th">Flags</th><th className="th pr-[18px]"><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className={`row-hover ${selected.has(a.id) ? "bg-risk/5" : ""}`}>
                    <td className="td w-10 pl-[18px]">{canTrash(a) && (
                      <input type="checkbox" className="h-4 w-4 accent-lime" aria-label={`Select ${a.path}`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} />)}</td>
                    <td className="td max-w-[360px]">
                      <div className="truncate font-mono text-[13px] text-fg" title={a.path}>{a.path}</div>
                      <div className="text-xs text-fg-3">{a.kind}{a.meta.rows ? ` · ${fmtNum(a.meta.rows as number)} rows` : ""}{a.location === "secured" ? " · owner-only vault" : ""}{a.storage_class !== "STANDARD" ? ` · ${a.storage_class}` : ""}</div>
                      {a.meta.read_error ? <div className="mt-0.5 text-xs text-warn" title={String(a.meta.read_error)}>Not scanned: {String(a.meta.read_error)}</div> : null}
                    </td>
                    <td className="td whitespace-nowrap text-xs">{SOURCE_META[a.source]?.name ?? a.source}</td>
                    <td className="td whitespace-nowrap font-mono text-[13px]">{fmtBytes(a.size_bytes)}</td>
                    <td className="td whitespace-nowrap">{fmtDate(a.accessed_at)}</td>
                    <td className="td text-xs">{a.owner}</td>
                    <td className={`td font-mono text-[13px] ${a.shared_with > 10 ? "text-risk" : ""}`}>{a.shared_with}{a.encrypted && <span className="text-lime"> · enc</span>}</td>
                    <td className="td"><div className="flex flex-wrap gap-1">{(a.flags ?? []).map((f) => <span key={f} className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${ACTION_STYLE[f as keyof typeof ACTION_STYLE]?.cls ?? ""}`}>{f}</span>)}</div></td>
                    <td className="td pr-[18px] text-right">
                      {a.status === "trashed" ? (
                        <button className="btn-secondary btn-sm whitespace-nowrap" onClick={() => restore(a)} disabled={!!busy}>
                          {busy === a.id ? <Spinner /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                        </button>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          {a.content_available && (
                            <a href={`/api/workspaces/${wsId}/assets/${a.id}/download`} download className="text-fg-3 hover:text-fg" title="Download file">
                              <Download className="h-4 w-4" />
                            </a>
                          )}
                          {a.kind === "tabular" && a.status === "active" && a.content_available && !a.meta.read_error && (
                            <Link href={`/clean?asset=${a.id}`} className="text-[13px] font-medium text-lime hover:underline">Clean →</Link>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog open={confirmTrash} danger busy={busy === "trash"} onClose={() => setConfirmTrash(false)} onConfirm={trashSelected}
        title={`Move ${chosen.length} file${chosen.length === 1 ? "" : "s"} to trash?`} confirmLabel="Move to trash"
        body={<>
          <ul className="mb-3 max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs text-fg">
            {chosen.map((a) => <li key={a.id} className="truncate">{a.path} · {fmtBytes(a.size_bytes)}</li>)}
          </ul>
          Files go to a <b className="text-fg">restorable trash</b>, not a permanent delete. Findings that only concern these files are closed.
          You can undo from the toast, the <b className="text-fg">In trash</b> filter, or Audit &amp; Undo.
        </>} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Sources /></Suspense>;
}
