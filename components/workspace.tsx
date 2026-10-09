"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type Workspace } from "@/lib/api";

interface Ctx {
  workspaces: Workspace[];
  current: Workspace | null;
  setCurrent: (id: string) => void;
  refresh: () => Promise<Workspace[]>;
  llm: { enabled: boolean; model: string | null; mode: string } | null;
  loading: boolean;
}

const WorkspaceContext = createContext<Ctx | null>(null);
const KEY = "dg.workspace";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [llm, setLlm] = useState<Ctx["llm"]>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await api<Workspace[]>("/workspaces");
    setWorkspaces(list);
    setCurrentId((prev) => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(KEY);
      } catch {
        /* storage unavailable */
      }
      const want = prev ?? stored;
      return list.find((w) => w.id === want)?.id ?? list[0]?.id ?? null;
    });
    return list;
  }, []);

  useEffect(() => {
    Promise.all([refresh(), api<{ llm: Ctx["llm"] }>("/health").then((h) => setLlm(h.llm))])
      .catch(() => setLlm(null))
      .finally(() => setLoading(false));
  }, [refresh]);

  const setCurrent = useCallback((id: string) => {
    setCurrentId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const current = workspaces.find((w) => w.id === currentId) ?? null;
  return (
    <WorkspaceContext.Provider value={{ workspaces, current, setCurrent, refresh, llm, loading }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace outside provider");
  return ctx;
}
