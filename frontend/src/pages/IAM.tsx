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
  Plus,
  Trash2,
  Lock,
  Unlock,
  Save,
  Terminal,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

const API_BASE = "/api/v1";
type Toast = { type: "success" | "error"; message: string } | null;
type Tab = "policies" | "assignments" | "audit";

interface PolicySummary {
  path: string;
  version: string;
  statements: number;
  actions: string[];
  is_system: boolean;
}

interface StatementData {
  sid?: string;
  effect: string;
  action: string[];
  resource: string[];
}

interface PolicyDetail {
  version: string;
  statement: StatementData[];
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
  decision: string;
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
      <h1 className="text-xl font-bold text-primary">{t("iam:page_title")}</h1>

      <div className="flex gap-1 border-b border-border">
        <TabButton active={activeTab === "policies"} onClick={() => setActiveTab("policies")} icon={Shield} label={t("iam:tab_policies")} />
        <TabButton active={activeTab === "assignments"} onClick={() => setActiveTab("assignments")} icon={Link2} label={t("iam:tab_assignments")} />
        <TabButton active={activeTab === "audit"} onClick={() => setActiveTab("audit")} icon={ScrollText} label={t("iam:tab_audit")} />
      </div>

      {activeTab === "policies" && (
        <PoliciesTab
          onToast={(m) => setToast({ type: m.includes("error") || m.includes("fail") ? "error" : "success", message: m })}
        />
      )}
      {activeTab === "assignments" && (
        <AssignmentsTab
          onToast={(m) => setToast({ type: m.includes("error") || m.includes("fail") ? "error" : "success", message: m })}
        />
      )}
      {activeTab === "audit" && <AuditTab />}

      {toast && (
        <div className={clsx(
          "fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-2xl",
          toast.type === "success" ? "border-green/40 text-green" : "border-red/40 text-red",
        )}>
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

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

function PoliciesTab({ onToast }: { onToast: (msg: string) => void }) {
  const { t } = useTranslation();
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PolicySummary[]>(`${API_BASE}/iam/policies`);
      setPolicies(data);
    } catch {
      onToast(t("iam:error_load_policies"));
    } finally {
      setLoading(false);
    }
  }, [t, onToast]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  function openPolicy(path: string) {
    setSelectedPath(path);
    setDrawerOpen(true);
  }

  const columns = [
    { key: "path", header: t("iam:col_name"), render: (p: PolicySummary) => <span className="font-mono text-xs text-secondary">{p.path}</span> },
    {
      key: "is_system", header: t("iam:col_type"),
      render: (p: PolicySummary) => (
        <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", p.is_system ? "bg-purple/15 text-purple" : "bg-blue/15 text-blue")}>
          {p.is_system ? <Lock size={10} /> : <Unlock size={10} />}
          {p.is_system ? "System" : "Custom"}
        </span>
      ),
    },
    { key: "statements", header: t("iam:col_statements"), render: (p: PolicySummary) => p.statements },
    {
      key: "actions", header: t("iam:col_actions"),
      render: (p: PolicySummary) => (
        <span className="font-mono text-xs text-muted truncate" style={{ maxWidth: 200 }}>
          {p.actions.slice(0, 4).join(", ")}{p.actions.length > 4 && ` +${p.actions.length - 4}`}
        </span>
      ),
    },
  ];

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-blue" size={24} /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label={t("iam:stat_total")} value={policies.length} />
        <StatCard label={t("iam:stat_system")} value={policies.filter(p => p.is_system).length} />
        <StatCard label={t("iam:stat_custom")} value={policies.filter(p => !p.is_system).length} />
        <StatCard label={t("iam:stat_statements")} value={policies.reduce((s, p) => s + p.statements, 0)} />
      </div>

      <div className="flex justify-end">
        <button onClick={() => setCreateOpen(true)} className="btn-primary text-sm">
          <Plus size={14} /> {t("iam:btn_create_policy")}
        </button>
      </div>

      {policies.length === 0 ? (
        <EmptyState icon={Shield} title={t("iam:empty_policies")} description={t("iam:empty_policies_desc")} />
      ) : (
        <DataTable columns={columns} data={policies} onRowClick={(p) => openPolicy(p.path)} />
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={selectedPath || ""} width="xl">
        {selectedPath && (
          <PolicyDetailDrawer
            path={selectedPath}
            onToast={onToast}
            onDeleted={() => { setDrawerOpen(false); fetchPolicies(); }}
          />
        )}
      </Drawer>

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title={t("iam:create_policy_title")} width="xl">
        <PolicyEditor
          mode="create"
          onToast={onToast}
          onSaved={() => { setCreateOpen(false); fetchPolicies(); }}
        />
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

// ── Policy Detail Drawer (view + edit + delete) ─────

function PolicyDetailDrawer({ path, onToast, onDeleted }: { path: string; onToast: (m: string) => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState<PolicyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [evalAction, setEvalAction] = useState("users:Delete");
  const [evalResult, setEvalResult] = useState<boolean | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const isSystem = path.startsWith("system/");

  const fetchPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PolicyDetail>(`${API_BASE}/iam/policies/${path}`);
      setPolicy(data);
    } catch {
      onToast(t("iam:error_load_policy"));
    } finally {
      setLoading(false);
    }
  }, [path, t, onToast]);

  useEffect(() => { fetchPolicy(); }, [fetchPolicy]);

  async function runEval() {
    setEvalLoading(true);
    try {
      const { data } = await api.post<{ allowed: boolean }>(`${API_BASE}/iam/eval`, { action: evalAction, resource: "*" });
      setEvalResult(data.allowed);
    } catch { setEvalResult(null); }
    finally { setEvalLoading(false); }
  }

  async function handleDelete() {
    try {
      await api.delete(`${API_BASE}/iam/policies/${path}`);
      onToast(t("iam:toast_policy_deleted"));
      onDeleted();
    } catch {
      onToast(t("iam:toast_delete_failed"));
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-blue" size={20} /></div>;
  if (!policy) return null;

  return (
    <div className="space-y-5">
      {/* Badges */}
      <div className="flex items-center gap-2">
        <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", isSystem ? "bg-purple/15 text-purple" : "bg-blue/15 text-blue")}>
          {isSystem ? <Lock size={10} /> : <Unlock size={10} />}
          {isSystem ? "System" : "Custom"}
        </span>
        <span className="rounded-full bg-hover px-2.5 py-0.5 font-mono text-xs text-muted">{policy.version}</span>
      </div>

      {/* Statements */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("iam:statements")}</h3>
        <div className="space-y-2">
          {policy.statement.map((stmt, i) => (
            <div key={i} className="rounded-lg border border-border bg-input p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-muted">{stmt.sid || `Statement ${i + 1}`}</span>
                <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", stmt.effect === "Allow" ? "bg-green/15 text-green" : "bg-red/15 text-red")}>
                  {stmt.effect}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {stmt.action.map((a, j) => (
                  <span key={j} className={clsx("rounded px-2 py-0.5 font-mono text-xs", a.includes("*") ? "border border-border text-muted" : "bg-blue/10 text-blue")}>
                    {a}
                  </span>
                ))}
              </div>
              <div className="mt-2 font-mono text-xs text-muted">Resource: {stmt.resource.join(", ")}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions for custom policies */}
      {!isSystem && !editMode && (
        <div className="flex gap-2">
          <button onClick={() => setEditMode(true)} className="btn-outline text-sm">
            {t("common:edit")}
          </button>
          <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger text-sm">
            <Trash2 size={14} /> {t("common:delete")}
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="rounded-lg border border-red/30 bg-red/5 p-3">
          <p className="mb-2 text-sm text-red">{t("iam:confirm_delete")}</p>
          <div className="flex gap-2">
            <button onClick={handleDelete} className="btn-danger flex-1 justify-center text-sm">{t("common:confirm")}</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="btn-outline flex-1 justify-center text-sm">{t("common:cancel")}</button>
          </div>
        </div>
      )}

      {/* Edit mode */}
      {editMode && (
        <PolicyEditor
          mode="edit"
          existingPath={path}
          existingStatements={policy.statement}
          existingVersion={policy.version}
          onToast={onToast}
          onSaved={() => { setEditMode(false); fetchPolicy(); }}
          onCancel={() => setEditMode(false)}
        />
      )}

      {/* Permission Checker */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("iam:permission_checker")}</h3>
        <div className="rounded-lg border border-border bg-input p-4">
          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-xs" placeholder="users:Delete" value={evalAction}
              onChange={(e) => setEvalAction(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runEval()} />
            <button onClick={runEval} disabled={evalLoading} className="btn-primary px-3 text-xs disabled:opacity-50">
              {evalLoading ? <Loader2 size={14} className="animate-spin" /> : t("iam:btn_evaluate")}
            </button>
          </div>
          {evalResult !== null && (
            <div className={clsx("mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium", evalResult ? "bg-green/10 text-green" : "bg-red/10 text-red")}>
              {evalResult ? <ShieldCheck size={16} /> : <ShieldX size={16} />}
              {evalResult ? t("iam:eval_allow") : t("iam:eval_deny")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Policy Editor (create / edit) ───────────────────

function PolicyEditor({ mode, existingPath, existingStatements, existingVersion, onToast, onSaved, onCancel }: {
  mode: "create" | "edit";
  existingPath?: string;
  existingStatements?: StatementData[];
  existingVersion?: string;
  onToast: (m: string) => void;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState(
    mode === "edit" ? existingPath || "" : "custom/"
  );
  const [statements, setStatements] = useState<StatementData[]>(
    existingStatements || [{ sid: "", effect: "Allow", action: [""], resource: ["*"] }]
  );
  const [saving, setSaving] = useState(false);

  function updateStatement(idx: number, field: keyof StatementData, value: unknown) {
    setStatements(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  function addAction(idx: number) {
    setStatements(prev => prev.map((s, i) => i === idx ? { ...s, action: [...s.action, ""] } : s));
  }

  function removeAction(stmtIdx: number, actIdx: number) {
    setStatements(prev => prev.map((s, i) => i === stmtIdx ? { ...s, action: s.action.filter((_, j) => j !== actIdx) } : s));
  }

  function addStatement() {
    setStatements(prev => [...prev, { sid: "", effect: "Allow", action: [""], resource: ["*"] }]);
  }

  function removeStatement(idx: number) {
    setStatements(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!path.trim()) { onToast(t("iam:error_path_required")); return; }
    if (!path.startsWith("custom/") || !path.endsWith(".json")) { onToast(t("iam:error_path_format")); return; }
    if (statements.length === 0) { onToast(t("iam:error_no_statements")); return; }

    setSaving(true);
    try {
      const body = { path: path.trim(), version: existingVersion || "2026-06-20", statement: statements };
      if (mode === "create") {
        await api.post(`${API_BASE}/iam/policies`, body);
        onToast(t("iam:toast_policy_created"));
      } else {
        await api.put(`${API_BASE}/iam/policies/${existingPath}`, body);
        onToast(t("iam:toast_policy_updated"));
      }
      onSaved();
    } catch {
      onToast(t("iam:toast_save_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Path */}
      <div>
        <label className="label">{t("iam:policy_path")}</label>
        <input
          className="input font-mono text-xs"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={mode === "edit"}
          placeholder="custom/my-policy.json"
        />
      </div>

      {/* Statements */}
      {statements.map((stmt, idx) => (
        <div key={idx} className="rounded-lg border border-border bg-input p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">{t("iam:statement")} {idx + 1}</span>
            {statements.length > 1 && (
              <button onClick={() => removeStatement(idx)} className="text-red hover:text-red/80">
                <X size={14} />
              </button>
            )}
          </div>

          {/* SID */}
          <div className="mb-2">
            <label className="label text-xs">SID</label>
            <input className="input font-mono text-xs" value={stmt.sid || ""}
              onChange={(e) => updateStatement(idx, "sid", e.target.value)} placeholder="AllowUserManagement" />
          </div>

          {/* Effect */}
          <div className="mb-2">
            <label className="label text-xs">Effect</label>
            <select className="input text-xs" value={stmt.effect}
              onChange={(e) => updateStatement(idx, "effect", e.target.value)}>
              <option value="Allow">Allow</option>
              <option value="Deny">Deny</option>
            </select>
          </div>

          {/* Actions */}
          <div className="mb-2">
            <label className="label text-xs">Actions</label>
            <div className="space-y-1">
              {stmt.action.map((act, actIdx) => (
                <div key={actIdx} className="flex gap-1">
                  <input className="input flex-1 font-mono text-xs" value={act}
                    onChange={(e) => {
                      const newActions = [...stmt.action];
                      newActions[actIdx] = e.target.value;
                      updateStatement(idx, "action", newActions);
                    }}
                    placeholder="users:Create" />
                  {stmt.action.length > 1 && (
                    <button onClick={() => removeAction(idx, actIdx)} className="text-red px-1">
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => addAction(idx)} className="mt-1 text-xs text-blue hover:underline">
              + {t("iam:add_action")}
            </button>
          </div>

          {/* Resource */}
          <div>
            <label className="label text-xs">Resource</label>
            <input className="input font-mono text-xs" value={stmt.resource.join(", ")}
              onChange={(e) => updateStatement(idx, "resource", e.target.value.split(",").map(s => s.trim()))}
              placeholder="*" />
          </div>
        </div>
      ))}

      <button onClick={addStatement} className="btn-outline w-full justify-center text-sm">
        <Plus size={14} /> {t("iam:add_statement")}
      </button>

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center text-sm disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {t("common:save")}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="btn-outline flex-1 justify-center text-sm">{t("common:cancel")}</button>
        )}
      </div>
    </div>
  );
}

// ── Assignments Tab ────────────────────────────────

function AssignmentsTab({ onToast }: { onToast: (msg: string) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<AssignmentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [newGroupDn, setNewGroupDn] = useState("");
  const [newGroupPolicy, setNewGroupPolicy] = useState("");
  const [defaultPolicy, setDefaultPolicy] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, pRes] = await Promise.all([
        api.get<AssignmentInfo>(`${API_BASE}/iam/assignments`),
        api.get<PolicySummary[]>(`${API_BASE}/iam/policies`),
      ]);
      setData(aRes.data);
      setPolicies(pRes.data);
      setDefaultPolicy(aRes.data.default_policy || "");
    } catch { onToast(t("iam:error_load_assignments")); }
    finally { setLoading(false); }
  }, [t, onToast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function addGroupAssignment() {
    if (!newGroupDn.trim() || !newGroupPolicy) return;
    const updated = { ...data!.group_assignments, [newGroupDn.trim()]: [newGroupPolicy] };
    try {
      const { data: result } = await api.put<AssignmentInfo>(`${API_BASE}/iam/assignments`, { group_assignments: updated });
      setData(result);
      setNewGroupDn("");
      onToast(t("iam:toast_assignment_added"));
    } catch { onToast(t("iam:toast_assignment_failed")); }
  }

  async function removeGroupAssignment(dn: string) {
    const updated = { ...data!.group_assignments };
    delete updated[dn];
    try {
      const { data: result } = await api.put<AssignmentInfo>(`${API_BASE}/iam/assignments`, { group_assignments: updated });
      setData(result);
      onToast(t("iam:toast_assignment_removed"));
    } catch { onToast(t("iam:toast_assignment_failed")); }
  }

  async function saveDefaultPolicy() {
    try {
      const { data: result } = await api.put<AssignmentInfo>(`${API_BASE}/iam/assignments`, { default_policy: defaultPolicy });
      setData(result);
      onToast(t("iam:toast_default_updated"));
    } catch { onToast(t("iam:toast_assignment_failed")); }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-blue" size={24} /></div>;
  if (!data) return null;

  const groupEntries = Object.entries(data.group_assignments);
  const userEntries = Object.entries(data.user_assignments);

  return (
    <div className="space-y-6">
      {/* Group Assignments */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-primary">{t("iam:group_assignments")}</h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-muted">
                <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_group_dn")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("iam:col_policy")}</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {groupEntries.map(([dn, pols]) => (
                <tr key={dn} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-secondary truncate" style={{ maxWidth: 280 }} title={dn}>{dn}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-blue">{pols.join(", ")}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => removeGroupAssignment(dn)} className="text-red hover:text-red/80 text-xs">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
              {groupEntries.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-muted">{t("iam:empty_assignments")}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add new */}
        <div className="mt-3 flex gap-2">
          <input className="input flex-1 font-mono text-xs" placeholder="CN=GroupName,CN=Users,DC=..." value={newGroupDn}
            onChange={(e) => setNewGroupDn(e.target.value)} />
          <select className="input w-auto text-xs" value={newGroupPolicy} onChange={(e) => setNewGroupPolicy(e.target.value)}>
            <option value="">Select policy...</option>
            {policies.map(p => <option key={p.path} value={p.path}>{p.path}</option>)}
          </select>
          <button onClick={addGroupAssignment} disabled={!newGroupDn.trim() || !newGroupPolicy} className="btn-primary text-xs disabled:opacity-50">
            <Plus size={12} /> {t("iam:btn_add")}
          </button>
        </div>
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
                {userEntries.map(([dn, pols]) => (
                  <tr key={dn} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary truncate" style={{ maxWidth: 280 }} title={dn}>{dn}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-blue">{pols.join(", ")}</td>
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
          <select className="input flex-1 text-xs" value={defaultPolicy} onChange={(e) => setDefaultPolicy(e.target.value)}>
            {policies.map(p => <option key={p.path} value={p.path}>{p.path}</option>)}
          </select>
          <button onClick={saveDefaultPolicy} className="btn-outline text-xs">
            <Save size={12} /> {t("common:save")}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{t("iam:default_policy_desc")}</p>
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

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 50 };
      if (severity) params.severity = severity;
      if (search) params.q = search;
      const { data } = await api.get<PaginatedAudit>(`${API_BASE}/logs/audit`, { params });
      setEntries(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, [page, severity, search]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const sevBadge = (sev: string) => ({
    critical: "bg-red/15 text-red",
    warning: "bg-yellow/15 text-yellow",
    info: "bg-blue/15 text-blue",
  }[sev] || "bg-muted/15 text-muted");

  const decBadge = (dec: string) => dec === "ALLOW" ? "bg-green/15 text-green" : "bg-red/15 text-red";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select className="input w-auto text-sm" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}>
          <option value="">{t("iam:filter_all_severities")}</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <input className="input flex-1 text-sm" placeholder={t("iam:search_audit")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-blue" size={24} /></div>
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
                      <td className="px-4 py-2"><span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", sevBadge(e.severity))}>{e.severity}</span></td>
                      <td className="px-4 py-2 font-mono text-xs text-secondary">{e.actor}</td>
                      <td className="px-4 py-2 font-mono text-xs text-blue">{e.action}</td>
                      <td className="px-4 py-2"><span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", decBadge(e.decision))}>{e.decision}</span></td>
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
