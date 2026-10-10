export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      "X-User": "admin@demo",
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------- types

export type Action = "KEEP" | "CLEAN" | "ARCHIVE" | "SECURE" | "DELETE";
export type Severity = "critical" | "warning" | "info";

export interface Workspace { id: string; name: string; industry: string; is_demo: boolean; last_scan: string | null }

export interface Finding {
  id: string; kind: string; category: string; title: string; summary: string; severity: Severity; action: Action;
  confidence: number; bytes_affected: number; records_affected: number; savings_inr_year: number; risk_score: number;
  priority: number; status: string; resolution: string; target_count: number; target_asset_ids: string[];
  keep_asset_ids: string[]; created_at: string; action_id: string | null; source?: string;
}

export interface Evidence { label: string; value: string | number }

export interface Asset {
  id: string; source: string; path: string; name: string; ext: string; kind: string; size_bytes: number;
  modified_at: string | null; accessed_at: string | null; owner: string; department: string; shared_with: number;
  encrypted: boolean; storage_class: string; status: string; content_available: boolean; location: string;
  meta: Record<string, unknown>; flags?: string[];
}

export interface FindingDetail extends Finding {
  evidence: Evidence[];
  details: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  explanation: string;
  explanation_source: string;
  assets: Record<string, Asset>;
  actions: { id: string; action: string; status: string; actor: string; note: string; created_at: string }[];
}

export interface Summary {
  has_scan: boolean;
  workspace: { id: string; name: string; industry: string };
  scan: { id: string; finished_at: string; stats: Record<string, number> } | null;
  running_scan: { id: string; stage: string; progress: number } | null;
  health_score: number | null;
  score_breakdown: { redundancy: number; risk: number; staleness: number; quality: number; formula: string };
  totals: { assets: number; total_bytes: number; useful_bytes: number; redundant_bytes: number; stale_bytes: number;
    risky_bytes: number; risky_records: number; archived_assets: number; trashed_assets: number };
  severity: { critical: number; warning: number; info: number };
  healthy_pct: number;
  recommendations: { duplicate_bytes: number; backup_bytes: number; duplicate_files: number; exposed_sensitive: number;
    secrets: number; duplicate_records: number; annual_waste_inr: number };
  waste_breakdown: { redundant: number; backups: number; stale: number; unused_columns: number };
  resolved: { count: number; savings_inr_year: number };
  cost_model: { hot_inr_per_gb_year: number; archive_inr_per_gb_year: number; basis: string };
  top_findings: Finding[];
  by_department: { name: string; bytes: number; reclaimable: number }[];
  by_source: { id: string; name: string; bytes: number; objects: number; issues: number; reclaimable: number; health: number }[];
  history: { at: string; score: number; reason: string }[];
}

export interface SecurityView {
  has_scan: boolean; exposed_count: number; open_count: number; secured_count: number; risky_records: number;
  exposure_threshold: number;
  entities: { label: string; count: number }[];
  rows: { finding_id: string; kind: string; file: string; path: string; source: string; pii: string[]; records: number;
    shared_with: number | null; encrypted: boolean | null; risk: number; severity: Severity; action: Action; status: string;
    resolution: string; action_id: string | null; past_retention: boolean }[];
}

export interface AuditEvent { id: string; actor: string; event: string; resource_type: string; resource_id: string; data: Record<string, unknown>; created_at: string }

export interface PipelineStep { id: string; op: string; params: Record<string, any>; reason: string } // eslint-disable-line @typescript-eslint/no-explicit-any
export interface PipelineSpec { version: string; source_asset_id: string; steps: PipelineStep[]; write_mode: string;
  dry_run_required: boolean; approval_required_for_commit: boolean }
export interface GraphNode { id: string; type: "source" | "op" | "sink"; label: string; detail?: string; op?: string;
  params?: Record<string, unknown>; reason?: string; destructive?: boolean; lossy?: boolean }

export interface PlanResponse {
  spec: PipelineSpec; graph: { nodes: GraphNode[] }; validation: { valid: boolean; errors: string[]; warnings: string[] };
  assumptions: string[]; questions: string[]; unsupported: string[]; planner: "llm" | "rules"; note: string;
  rule_set_version: number; reviewed_groups: number; rows: number;
}

export interface Run {
  id: string; asset_id: string; prompt: string; spec: PipelineSpec; planner: string; rule_set_version: number;
  status: string; output_asset_id: string | null; approved_by: string; created_at: string; committed_at: string | null;
  metrics: { totals: Record<string, number>; warnings: string[]; vdt?: VirtualTreeMeta;
    commit?: { mode: "new_file" | "in_place"; commit_id?: string; output?: string; quarantine?: string };
    steps: { id: string; op: string; title: string; rows_in: number; rows_out: number; cells_changed: number;
      rows_removed: number; rows_quarantined: number; duration_ms: number; notes: string[] }[] };
  preview: { changes: { row: number; column: string; before: string; after: string; step: string; op: string }[];
    quarantine: Record<string, string | number>[]; output_head: Record<string, string | number>[]; columns: string[] };
}

// ---------------------------------------------------------------- virtual data tree

export type PatchOp = "DELETE" | "QUARANTINE" | "REDACT" | "NORMALIZE";

export interface VirtualTreeMeta {
  engine: string; target_file: string; source_sha256: string; source_bytes: number; candidate_bytes: number | null;
  total_records: number; patch_entries: number; in_place: { supported: boolean; reason: string; format: string };
  virtual_mutations: { pruned_duplicates: number; quarantined_rows: number; masked_pii_cells: number; normalized_cells: number;
    dropped_columns: string[]; rows_touched: number; storage_delta_bytes: number | null };
}

export interface PatchCell { op: PatchOp; col: string; before: string; after: string; step: string; operator: string }
export interface DiffRow {
  row_id: number; status: "DELETE" | "QUARANTINE" | "MODIFIED"; reason: string; kept_row: number | null;
  values: Record<string, string>; cells: Record<string, PatchCell>;
}
export interface DiffResponse {
  columns: string[]; dropped_columns: string[]; rows: DiffRow[]; total_rows: number; offset: number; limit: number;
  counts: Record<PatchOp, number>;
}

export interface ImpactResponse {
  safe: boolean;
  checks: { name: string; status: "pass" | "warn" | "fail" | "info"; detail: string }[];
  aggregates: { column: string; sum_before: number; sum_after: number; mean_before: number; mean_after: number; mean_drift_pct: number;
    median_before: number; median_after: number; median_drift_pct: number }[];
  distributions: { column: string; max_share_shift_pp: number; top: { value: string; before: number; after: number }[] }[];
}

export interface VaultCommit {
  id: string; run_id: string; asset_id: string; file_name: string; codec: string; vault_file: string;
  original_sha256: string; original_bytes: number; vault_bytes: number; new_sha256: string; new_bytes: number;
  compression_ratio: number | null; status: "committed" | "rolled_back"; actor: string; created_at: string;
  rolled_back_by: string; rolled_back_at: string | null; mutations: Partial<VirtualTreeMeta["virtual_mutations"]>;
  quarantine_file: string | null;
}
