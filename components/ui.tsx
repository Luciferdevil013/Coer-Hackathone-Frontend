"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import type { Action, Severity } from "@/lib/api";
import { ACTION_STYLE, SEVERITY_STYLE } from "@/lib/format";

export function Logo({ size = 24, stroke = "#C9F25C" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2.5 4 6.5v7c0 6 4.3 10.4 10 12 5.7-1.6 10-6 10-12v-7l-10-4Z" />
      <path d="M9 11h10" /><path d="M9 15h7" /><path d="M9 19h4" />
    </svg>
  );
}

export function Wordmark({ small }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 text-fg">
      <Logo size={small ? 22 : 28} />
      <span className={`font-semibold tracking-[-0.02em] ${small ? "text-base" : "text-lg"}`}>DataGuardian</span>
      <span className="rounded-md border border-line-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-2">AI</span>
    </span>
  );
}

export function ActionBadge({ action, size = "sm" }: { action: Action | "APPLY" | "IGNORE"; size?: "sm" | "md" }) {
  const s = ACTION_STYLE[action] ?? ACTION_STYLE.KEEP;
  return (
    <span className={`inline-flex items-center rounded-md font-mono font-medium uppercase tracking-wide ${s.cls} ${size === "md" ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[11px]"}`}>
      {action}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return <span className={`inline-block flex-none rounded-md px-2 py-1 font-mono text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2" title="Confidence from deterministic evidence">
      <span className="h-1 w-12 overflow-hidden rounded-full bg-fg/10"><span className="block h-full rounded-full bg-fg" style={{ width: `${pct}%` }} /></span>
      <span className="font-mono text-xs text-fg-2">{pct}%</span>
    </span>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

export function PageHeader({ title, subtitle, actions }: { title?: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {title && <h2 className="text-xl font-semibold tracking-[-0.03em]">{title}</h2>}
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-fg-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, unit, sub, subTone, tone }: {
  label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; subTone?: "lime" | "risk" | "muted"; tone?: "risk" | "lime";
}) {
  return (
    <div className={`card flex flex-col gap-2.5 p-5 ${tone === "risk" ? "border-risk/30" : ""}`}>
      <span className="text-[13px] text-fg-3">{label}</span>
      <span className={`text-[40px] font-semibold leading-none tracking-[-0.045em] ${tone === "lime" ? "text-lime" : ""}`}>
        {value}{unit && <span className="text-base tracking-normal text-fg-3"> {unit}</span>}
      </span>
      {sub && <span className={`font-mono text-xs ${subTone === "lime" ? "text-lime" : subTone === "risk" ? "text-risk" : "text-fg-3"}`}>{sub}</span>}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start justify-center gap-3 rounded-card border-[1.5px] border-dashed border-line-2 px-6 py-12">
      {icon && <div className="text-fg-4">{icon}</div>}
      <div className="text-xl font-semibold tracking-[-0.02em]">{title}</div>
      {body && <p className="max-w-md text-fg-3">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="flex justify-center py-24 text-fg-4"><Spinner className="h-6 w-6" /></div>;
}

// ------------------------------------------------------------ toasts

type Toast = { id: number; kind: "success" | "error" | "info"; text: string; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.action ? 9000 : 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="flex items-start gap-3 rounded-xl border border-line-2 bg-ink-800 p-3.5 text-sm shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lime" />
              : t.kind === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-risk" />
                : <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-2" />}
            <div className="flex-1 text-fg-2">{t.text}</div>
            {t.action && (
              <button className="font-semibold text-lime hover:underline" onClick={() => { t.action!.run(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-fg-4 hover:text-fg" aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------ confirm dialog

export function ConfirmDialog({ open, title, body, confirmLabel, danger, busy, onConfirm, onClose }: {
  open: boolean; title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
  if (!open || !mounted) return null;
  // Portal to <body>: an animated ancestor would otherwise become the containing block for `fixed`.
  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-panel border border-line-2 bg-ink-900 p-6 shadow-[0_50px_100px_-40px_rgba(0,0,0,0.9)]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="text-xl font-semibold tracking-[-0.02em]">{title}</div>
        <div className="mt-2 text-sm text-fg-2">{body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
