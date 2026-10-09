"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, type Summary } from "@/lib/api";
import { useWorkspace } from "./workspace";

/** Fetch a workspace-scoped resource; refetches when the workspace changes. */
export function useWsResource<T>(path: string | null, deps: unknown[] = []) {
  const { current } = useWorkspace();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const wsId = current?.id;

  const load = useCallback(async () => {
    if (!wsId || path === null) return;
    setLoading(true);
    try {
      setData(await api<T>(`/workspaces/${wsId}${path}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, path, ...deps]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  return { data, error, loading, reload: load, wsId };
}

type SummaryState = ReturnType<typeof useWsResource<Summary>>;
const SummaryCtx = createContext<SummaryState | null>(null);

/** One shared, self-polling dashboard summary for the sidebar, top bar and pages. */
export function SummaryProvider({ children }: { children: React.ReactNode }) {
  const res = useWsResource<Summary>("/summary");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = !!res.data?.running_scan;
  const { reload, data } = res;
  useEffect(() => {
    if (running) timer.current = setTimeout(reload, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [running, data, reload]);
  return createElement(SummaryCtx.Provider, { value: res }, children);
}

export function useSummary(): SummaryState {
  const ctx = useContext(SummaryCtx);
  if (!ctx) throw new Error("useSummary must be used inside SummaryProvider");
  return ctx;
}
