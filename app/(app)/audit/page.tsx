"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useWsResource } from "@/components/hooks";
import { ActionBadge, Empty, PageHeader, Spinner, useToast } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";

interface ActionRow { id: string; action: string; status: string; actor: string; note: string; finding_id: string; finding_title: string; assets: string[]; created_at: string; undone_at: string | null }
interface Event { id: string; actor: string; event: string; resource_type: string; resource_id: string; data: Record<string, unknown>; created_at: string }
type MlModel = { library: string; version: string | null; ready: boolean; use: string; name?: string; loaded?: boolean };
interface Health { ml: { isolation_forest: MlModel; rapidfuzz: MlModel; embeddings: MlModel } }
interface AiUsage { status: { enabled: boolean; model: string | null }; calls: { purpose: string; model: string; ok: boolean; latency_ms: number; input_tokens: number; output_tokens: number; error: string; created_at: string }[] }

export default function AuditPage() {
  const { data: actions, reload } = useWsResource<ActionRow[]>("/actions");
  const { data: events, reload: reloadEvents } = useWsResource<Event[]>("/audit");
  const { data: ai } = useWsResource<AiUsage>("/ai-usage");
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => { api<Health>("/health").then(setHealth).catch(() => setHealth(null)); }, []);
  const wsId = useWorkspace().current?.id;
  const toast = useToast();
  const [busy, setBusy] = useState("");

  async function undo(id: string) {
    setBusy(id);
    try {
      await api(`/workspaces/${wsId}/actions/${id}/undo`, { method: "POST" });
      toast({ kind: "success", text: "Undone. Files and statuses are restored." });
      reload();
      reloadEvents();
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader subtitle="Every scan, decision, approval and pipeline run is recorded. Any applied action can be reversed." />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-3 font-semibold">Applied actions</div>
            {!actions ? <div className="flex justify-center py-10"><Spinner /></div> : !actions.length ? <div className="p-6"><Empty title="No actions yet" body="Actions you approve in the Action Center show up here with an Undo button." /></div> : (
              <ul className="divide-y divide-line">
                {actions.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <ActionBadge action={a.action as never} />
                    <div className="min-w-0 flex-1 text-sm">
                      <Link href={`/findings/${a.finding_id}`} className="font-medium text-fg hover:underline">{a.finding_title}</Link>
                      <div className="text-xs text-fg-3">{a.note}</div>
                      {a.assets.length > 0 && <div className="mt-1 truncate text-xs text-fg-4">{a.assets.slice(0, 6).join(", ")}{a.assets.length > 6 ? ` +${a.assets.length - 6}` : ""}</div>}
                      <div className="mt-1 text-xs text-fg-4">{a.actor} · {timeAgo(a.created_at)}</div>
                    </div>
                    {a.status === "applied" ? (
                      <button className="btn-secondary py-1.5" onClick={() => undo(a.id)} disabled={busy === a.id}>{busy === a.id ? <Spinner /> : <RotateCcw className="h-4 w-4" />} Undo</button>
                    ) : <span className="text-xs font-medium text-warn">undone</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-3 font-semibold">Event log</div>
            <ul className="max-h-[480px] divide-y divide-line overflow-y-auto text-sm">
              {(events ?? []).map((e) => (
                <li key={e.id} className="px-4 py-2">
                  <div className="flex justify-between gap-2"><code className="text-xs font-semibold text-fg-2">{e.event}</code><span className="text-xs text-fg-4">{timeAgo(e.created_at)}</span></div>
                  <div className="truncate text-xs text-fg-3">{e.actor} · {e.resource_type} {e.resource_id}{typeof e.data?.title === "string" ? ` · ${e.data.title}` : ""}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4">
            <div className="font-semibold">Models in use</div>
            <ul className="mt-2 space-y-2.5 text-xs">
              {health && ([["Isolation Forest", health.ml.isolation_forest], ["RapidFuzz", health.ml.rapidfuzz], ["all-MiniLM-L6-v2", health.ml.embeddings]] as const).map(([n, m]) => (
                <li key={n} className="flex flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">{n}</span>
                    <span className={`font-mono text-[11px] ${m.ready ? "text-lime" : "text-risk"}`}>{m.ready ? `READY · ${m.library} ${m.version ?? ""}` : "NOT INSTALLED"}</span>
                  </span>
                  <span className="text-fg-3">{m.use}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4">
            <div className="font-semibold">AI observability</div>
            <div className="mt-1 text-xs text-fg-3">{ai?.status.enabled ? `Model: ${ai.status.model}` : "Offline mode: deterministic planner and template explanations"} · {ai?.calls.length ?? 0} recent calls</div>
            <ul className="mt-2 space-y-1 text-xs">
              {(ai?.calls ?? []).slice(0, 8).map((c, i) => (
                <li key={i} className="flex justify-between text-fg-2"><span>{c.purpose} {c.ok ? "✓" : `✗ ${c.error.slice(0, 40)}`}</span><span>{c.latency_ms} ms · {c.input_tokens + c.output_tokens} tok</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
