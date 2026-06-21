import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Link2,
  ScrollText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Search,
  Plus,
  Lock,
  Unlock,
  ChevronRight,
  Terminal,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Constants ──────────────────────────────────────
const API_BASE = "/api/v1";

type Toast = { type: "success" | "error"; message: string } | null;

interface PolicySummary {
  path: string;
  version: string;
  statements: number;
  actions: string[];
  is_system: boolean;
}

interface AssignmentInfo {
  group_assignments: Record<string, string[]>;
  user_assignments: Record<string, string[]>;
  default_policy: string | null;
}

interface AuditEntry {
  audit: boolean;
  timestamp: string;
  actor: string;
  actor_ip: string;
  action: string;
  resource_type: string;
  resource_id: string;
  decision: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  severity: string;
  detail: string;
}

interface PaginatedAudit {
  items: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface EvalResponse {
  allowed: boolean;
  matched_policy: string | null;
  action: string;
  resource: string;
}

// ── Tabs ───────────────────────────────────────────
type Tab = "policies" | "assignments" | "audit";

// ── Page ───────────────────────────────────────────
export function IAM() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("policies");
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-primary">{t("iam:page_title")}</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        <TabButton active={activeTab === "policies"} onClick={() => setActiveTab("policies")} icon={Shield} label={t("iam:tab_policies")} />
        <TabButton active={activeTab === "assignments"} onClick={() => setActiveTab("assignments")} icon={Link2} label={t("iam:tab_assignments")} />
        <TabButton active={activeTab === "audit"} onClick={() => setActiveTab("audit")} icon={ScrollText} label={t("iam:tab_audit")} />
      </div>

      {/* Tab content */}
      {activeTab === "policies" && <PoliciesTab onError={(m) => setToast({ type: "error", message: m })} />}
      {activeTab === "assignments" && <AssignmentsTab onError={(m) => setToast({ type: "error", message: m })} />}
      {activeTab === "audit" && <AuditTab />}

      {/* Toast */}
      {toast && (
        <div
          className={clsx(
            "fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-2xl",
            toast.type === "success" ? "border-green/40 text-green" : "border-red/40 text-red",
          )}
        >
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ── Tab Button ─────────────────────────────────────
function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "border-blue text-primary" : "border-transparent text-secondary hover:text-primary",
      )}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

// ── Policies Tab ───────────────────────────────────
function PoliciesTab({ onError }: { onError: (msg: string) => void }) {
  const { t } = useTranslation();
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PolicySummary[]>(`${API_BASE}/iam/policies`);
      setPolicies(data);
    } catch {
      onError(t("iam:error_load_policies"));
    } finally {
      setLoading(false);
    }
  }, [t, onError]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  function openPolicy(path: string) {
    setSelectedPath(path);
    setDrawerOpen(true);
  }

  const columns = [
    {
      key: "path",
      header: t("iam:col_name"),
      render: (p: PolicySummary) => <span className="font-mono text-xs text-secondary">{p.path}</span>,
    },
    {
      key: "is_system",
      header: t("iam:col_type"),
      render: (p: PolicySummary) => (
        <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", p.is_system ? "bg-purple/15 text-purple" : "bg-blue/15 text-blue")}>
          {p.is_system ? <Lock size={10} /> : <Unlock size={10} />}
          {p.is_system ? "System" : "Custom"}
        </span>
      ),
    },
    { key: "statements", header: t("iam:col_statements"), render: (p: PolicySummary) => p.statements },
    {
      key: "actions",
      header: t("iam:col_actions"),
      render: (p: PolicySummary) => (
        <span className="font-mono text-xs text-muted truncate" style={{ maxWidth: 200 }}>
          {p.actions.slice(0, 4).join(", ")}
          {p.actions.length > 4 && ` +${p.actions.length - 4}`}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-blue" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label={t("iam:stat_total")} value={policies.length} />
        <StatCard label={t("iam:stat_system")} value={policies.filter((p) => p.is_system).length} />
        <StatCard label={t("iam:stat_custom")} value={policies.filter((p) => !p.is_system).length} />
        <StatCard label={t("iam:stat_statements")} value={policies.reduce((sum, p) => sum + p.statements, 0)} />
      </div>

      {/* Table */}
      {policies.length === 0 ? (
        <EmptyState icon={Shield} title={t("iam:empty_policies")} description={t("iam:empty_policies_desc")} />
      ) : (
        <DataTable
          columns={columns}
          data={policies}
          onRowClick={(p) => openPolicy(p.path)}
        />
      )}

      {/* Detail Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={selectedPath || ""} width="xl">
        {selectedPath && <PolicyDetail path={selectedPath} />}
      </Drawer>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-primary">{value}</div>
    </div>
  );
}

// ── Policy Detail (inside drawer) ──────────────────
function PolicyDetail({ path }: { path: string }) {
  const { t } = useTranslation();
  const [evalAction, setEvalAction] = useState("users:Delete");
  const [evalResource, setEvalResource] = useState("*");
  const [evalResult, setEvalResult] = useState<EvalResponse | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  async function runEval() {
    setEvalLoading(true);
    try {
      const { data } = await api.post<EvalResponse>(`${API_BASE}/iam/eval`, {
        action: evalAction,
        resource: evalResource,
      });
      setEvalResult(data);
    } catch {
      setEvalResult(null);
    } finally {
      setEvalLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Permission Checker */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("iam:permission_checker")}</h3>
        <div className="rounded-lg border border-border bg-input p-4">
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-xs"
              placeholder="users:Delete"
              value={evalAction}
              onChange={(e) => setEvalAction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runEval()}
            />
            <input
              className="input w-24 font-mono text-xs"
              placeholder="*"
              value={evalResource}
              onChange={(e) => setEvalResource(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runEval()}
            />
            <button onClick={runEval} disabled={evalLoading} className="btn-primary px-3 text-xs disabled:opacity-50">
              {evalLoading ? <Loader2 size={14} className="animate-spin" /> : t("iam:btn_evaluate")}
            </button>
          </div>
          {evalResult && (
            <div
              className={clsx(
                "mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                evalResult.allowed ? "bg-green/10 text-green" : "bg-red/10 text-red",
              )}
            >
              {evalResult.allowed ? <ShieldCheck size={16} /> : <ShieldX size={16} />}
              {evalResult.allowed ? t("iam:eval_allow") : t("iam:eval_deny")}
              {evalResult.matched_policy && (
                <span className="ml-auto font-mono text-xs opacity-70">{evalResult.matched_policy}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* API Info */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("iam:api_info")}</h3>
        <div className="rounded-lg border border-border bg-input p-4">
          <div className="font-mono text-xs text-secondary">
            <div>{t("iam:policy_path")}: <span className="text-primary">{path}</span></div>
            <div className="mt-1">{t("iam:api_endpoint")}: <code className="rounded bg-hover px-1.5 py-0.5">GET /api/v1/iam/policies</code></div>
            <div className="mt-1">{t("iam:eval_endpoint")}: <code className="rounded bg-hover px-1.5 py-0.5">POST /api/v1/iam/eval</code></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Assignments Tab ────────────────────────────────
function AssignmentsTab({ onError }: { onError: (msg: string) => void }) {
  const { t } = useTranslation();
  const [assignments, setAssignments] = useState<AssignmentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<AssignmentInfo>(`${API_BASE}/iam/assignments`);
      setAssignments(data);
    } catch {
      onError(t("iam:error_load_assignments"));
    } finally {
      setLoading(false);
    }
  }, [t, onError]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-blue" size={24} />
      </div>
    );
  }

  if (!assignments) return null;

  const groupEntries = Object.entries(assignments.group_assignments);
  const userEntries = Object.entries(assignments.user_assignments);

  return (
    <div className="space-y-6">
      {/* Group Assignments */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-primary">{t("iam:group_assignments")}</h3>
        {groupEntries.length === 0 ? (
          <EmptyState icon={Link2} title={t("iam:empty_assignments")} description={t("iam:empty_assignments_desc")} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted">
                  <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_group_dn")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_policy")}</th>
                </tr>
              </thead>
              <tbody>
                {groupEntries.map(([dn, policies]) => (
                  <tr key={dn} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary truncate" style={{ maxWidth: 300 }} title={dn}>
                      {dn}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-blue">{policies.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Assignments */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-primary">{t("iam:user_assignments")}</h3>
        {userEntries.length === 0 ? (
          <p className="text-sm text-muted">{t("iam:no_user_assignments")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <tbody>
                {userEntries.map(([dn, policies]) => (
                  <tr key={dn} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary truncate" style={{ maxWidth: 300 }} title={dn}>
                      {dn}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-blue">{policies.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Default Policy */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-primary">{t("iam:default_policy")}</h3>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-input p-4">
          <Terminal size={16} className="flex-shrink-0 text-blue" />
          <p className="text-sm text-secondary">
            {t("iam:default_policy_desc")}: <span className="font-mono text-primary">{assignments.default_policy || "(none)"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Audit Tab ──────────────────────────────────────
function AuditTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");

  const PAGE_SIZE = 50;

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
      if (severity) params.severity = severity;
      if (search) params.q = search;
      const { data } = await api.get<PaginatedAudit>(`${API_BASE}/logs/audit`, { params });
      setEntries(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [page, severity, search]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const severityBadge = (sev: string) => {
    const map: Record<string, string> = {
      critical: "bg-red/15 text-red",
      warning: "bg-yellow/15 text-yellow",
      info: "bg-blue/15 text-blue",
    };
    return map[sev] || "bg-muted/15 text-muted";
  };

  const decisionBadge = (dec: string) =>
    dec === "ALLOW" ? "bg-green/15 text-green" : "bg-red/15 text-red";

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2">
        <select className="input w-auto text-sm" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}>
          <option value="">{t("iam:filter_all_severities")}</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <input
          className="input flex-1 text-sm"
          placeholder={t("iam:search_audit")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-blue" size={24} />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("iam:empty_audit")} description={t("iam:empty_audit_desc")} />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted">
                    <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_timestamp")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_severity")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_actor")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_action")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_decision")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_ip")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_detail")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-b border-border-subtle last:border-0 hover:bg-hover">
                      <td className="px-4 py-2 font-mono text-xs text-muted">{new Date(e.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", severityBadge(e.severity))}>
                          {e.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-secondary">{e.actor}</td>
                      <td className="px-4 py-2 font-mono text-xs text-blue">{e.action}</td>
                      <td className="px-4 py-2">
                        <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", decisionBadge(e.decision))}>
                          {e.decision}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted">{e.actor_ip}</td>
                      <td className="px-4 py-2 text-xs text-muted truncate" style={{ maxWidth: 160 }}>{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} totalPages={pages} onPageChange={(p) => setPage(p)} />
        </>
      )}
    </div>
  );
}
