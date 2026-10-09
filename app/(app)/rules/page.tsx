"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useWsResource } from "@/components/hooks";
import { PageHeader, Spinner, useToast } from "@/components/ui";

interface Rules {
  active: { version: number; rules: Record<string, any>; created_by: string; created_at: string } | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  history: { version: number; created_by: string; created_at: string; active: boolean }[];
}

export default function RulesPage() {
  const { data, reload, wsId } = useWsResource<Rules>("/rules");
  const toast = useToast();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.active) setText(JSON.stringify(data.active.rules, null, 2));
  }, [data]);

  async function save() {
    let parsed;
    try {
      parsed = JSON.parse(text);
      setErr("");
    } catch (e) {
      setErr(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    setSaving(true);
    try {
      const r = await api<{ version: number }>(`/workspaces/${wsId}/rules`, { method: "PUT", json: { rules: parsed } });
      toast({ kind: "success", text: `Saved as rule set v${r.version}. New pipeline runs pin this version.` });
      reload();
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="flex justify-center py-24 text-fg-4"><Spinner className="h-6 w-6" /></div>;
  const r = data.active?.rules ?? {};
  return (
    <>
      <PageHeader subtitle="Each company defines its own data rules: required fields, formats, dedupe keys and conflict policies. Same product, different rules, isolated per workspace."
        actions={<button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : <Save className="h-4 w-4" />} Save new version</button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="label mb-2">Rule set v{data.active?.version} (JSON)</div>
          <textarea className="input min-h-[460px] font-mono text-xs" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
          {err && <div className="mt-2 text-sm text-risk">{err}</div>}
        </div>
        <div className="space-y-4">
          <div className="card p-5 text-sm">
            <div className="label mb-2">In plain English</div>
            <ul className="space-y-2 text-fg-2">
              <li>Duplicates are matched on <b>{(r.dedupe?.keys ?? []).join(" + ") || "—"}</b>, keeping the <b>{String(r.dedupe?.keep ?? "most_complete").replace("_", " ")}</b> record.</li>
              {r.dedupe?.never_merge_on_conflict?.length > 0 && <li>Never merge records whose <b>{r.dedupe.never_merge_on_conflict.join(", ")}</b> differ. They are quarantined for review.</li>}
              <li>Required fields: <b>{(r.required_fields ?? []).join(", ") || "none"}</b>.</li>
              <li>Format checks: <b>{Object.entries(r.formats ?? {}).map(([k, v]) => `${k} (${v})`).join(", ") || "none"}</b>.</li>
              {r.unique?.length > 0 && <li>Must be unique: <b>{r.unique.join(", ")}</b>.</li>}
              <li>Dates are written as <code>{r.date_format}</code>. Personal data retention is <b>{r.retention_days} days</b>.</li>
            </ul>
          </div>
          <div className="card p-5">
            <div className="label mb-2">Version history</div>
            <ul className="space-y-1.5 text-sm">
              {data.history.map((h) => (
                <li key={h.version} className="flex justify-between text-fg-2">
                  <span>v{h.version} {h.active && <span className="ml-1 rounded bg-lime/10 px-1.5 text-xs text-lime">active</span>}</span>
                  <span className="text-xs">{h.created_by} · {fmtDate(h.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
