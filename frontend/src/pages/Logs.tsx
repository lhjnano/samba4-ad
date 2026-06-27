import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollText,
  Activity,
  ShieldCheck,
  Terminal,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

const API_BASE = "/api/v1";
type Toast = { type: "success" | "error"; message: string } | null;
type Tab = "auth" | "samba" | "audit" | "system";

interface InfraEntry {
  timestamp: string;
  source: string;
  event_type: string;
  actor: string;
  host: string;
  detail: string;
  result: string;
}

interface PaginatedInfra {
  items: InfraEntry[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
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

interface SystemLogEntry {
  id: string;
  timestamp: string;
  severity: string;
  source: string;
  message: string;
}

interface AuthStats {
  auth_success_24h: number;
  auth_failure_24h: number;
  active_sessions: number;
  denied_access_24h: number;
  by_source: Record<string, number>;
}

export function Logs() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("auth");
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-primary">{t("logs:page_title_monitoring")}</h1>

      {/* Auth stats cards */}
      <AuthStatsCards />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabButton active={activeTab === "auth"} onClick={() => setActiveTab("auth")} icon={ShieldCheck} label={t("logs:tab_auth_timeline")} />
        <TabButton active={activeTab === "samba"} onClick={() => setActiveTab("samba")} icon={Activity} label={t("logs:tab_samba_events")} />
        <TabButton active={activeTab === "audit"} onClick={() => setActiveTab("audit")} icon={ScrollText} label={t("logs:tab_audit_trail")} />
        <TabButton active={activeTab === "system"} onClick={() => setActiveTab("system")} icon={Terminal} label={t("logs:tab_system")} />
      </div>

      {activeTab === "auth" && <AuthTimelineTab />}
      {activeTab === "samba" && <SambaEventsTab />}
      {activeTab === "audit" && <AuditTab />}
      {activeTab === "system" && <SystemTab />}

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

function StatCard({ label, value, sub, color = "" }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-secondary">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold", color || "text-primary")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function AuthStatsCards() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AuthStats | null>(null);

  useEffect(() => {
    api.get<AuthStats>(`${API_BASE}/logs/auth-stats`).then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  if (!stats) return <div className="h-20" />;

  return (
    <div className="grid grid-cols-4 gap-3">
      <StatCard label={t("logs:stat_auth_success")} value={stats.auth_success_24h} color="text-green"
        sub={Object.entries(stats.by_source).map(([k, v]) => `${k} ${v}`).join(" · ")} />
      <StatCard label={t("logs:stat_auth_failure")} value={stats.auth_failure_24h} color="text-red" />
      <StatCard label={t("logs:stat_active_sessions")} value={stats.active_sessions} />
      <StatCard label={t("logs:stat_denied")} value={stats.denied_access_24h} color="text-yellow" />
    </div>
  );
}

// ── Source badge ────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, string> = {
    smb: "bg-blue/12 text-blue",
    ldap: "bg-purple/12 text-purple",
    kerberos: "bg-yellow/12 text-yellow",
    web: "bg-green/12 text-green",
  };
  const labels: Record<string, string> = { smb: "SMB", ldap: "LDAP", kerberos: "KRB", web: "WEB" };
  return <span className={clsx("inline-flex rounded px-2 py-0.5 text-xs font-medium", map[source] || "bg-muted/12 text-muted")}>{labels[source] || source.toUpperCase()}</span>;
}

// ── Auth Timeline Tab ───────────────────────────────

function AuthTimelineTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<InfraEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 50 };
      if (sourceFilter) params.source = sourceFilter;
      if (search) params.q = search;
      const { data } = await api.get<PaginatedInfra>(`${API_BASE}/logs/auth-timeline`, { params });
      setEntries(data.items); setTotal(data.total); setPages(data.pages);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, [page, sourceFilter, search]);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue" size={24} /></div>;

  const itemIcon = (e: InfraEntry) => {
    if (e.result === "failure") return "danger";
    if (e.event_type === "session") return "success";
    return "info";
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select className="input w-auto text-sm" value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}>
          <option value="">{t("logs:filter_all_sources")}</option>
          <option value="smb">SMB</option>
          <option value="ldap">LDAP</option>
          <option value="kerberos">Kerberos</option>
          <option value="web">Web</option>
        </select>
        <input className="input flex-1 text-sm" placeholder={t("logs:search_auth")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("logs:empty_auth")} description={t("logs:empty_auth_desc")} />
      ) : (
        <>
          {/* Timeline */}
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
            {entries.map((e, i) => (
              <div key={i} className="relative mb-3 pl-4">
                <div className={clsx("absolute -left-[18px] top-3.5 h-2 w-2 rounded-full border-2 border-root",
                  itemIcon(e) === "success" ? "bg-green" : itemIcon(e) === "danger" ? "bg-red" : "bg-blue")} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted">{e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ""}</span>
                  <SourceBadge source={e.source} />
                  <span className="text-primary">{e.detail}</span>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={pages} onPageChange={(p) => setPage(p)} />
        </>
      )}
    </div>
  );
}

// ── Samba Events Tab ────────────────────────────────

function SambaEventsTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<InfraEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 50 };
      if (sourceFilter) params.source = sourceFilter;
      if (search) params.q = search;
      const { data } = await api.get<PaginatedInfra>(`${API_BASE}/logs/samba`, { params });
      setEntries(data.items); setTotal(data.total); setPages(data.pages);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, [page, sourceFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue" size={24} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select className="input w-auto text-sm" value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}>
          <option value="">{t("logs:filter_all_events")}</option>
          <option value="smb">SMB Sessions</option>
          <option value="ldap">LDAP Binds</option>
          <option value="kerberos">Kerberos</option>
        </select>
        <input className="input flex-1 text-sm" placeholder={t("logs:search_events")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={Activity} title={t("logs:empty_samba")} description={t("logs:empty_samba_desc")} />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted">
                    <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_timestamp")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_source")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_host")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_event")}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_result")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-b border-border-subtle last:border-0 hover:bg-hover">
                      <td className="px-4 py-2 font-mono text-xs text-muted">{e.timestamp ? new Date(e.timestamp).toLocaleString() : ""}</td>
                      <td className="px-4 py-2"><SourceBadge source={e.source} /></td>
                      <td className="px-4 py-2 font-mono text-xs text-secondary">{e.host || "—"}</td>
                      <td className="px-4 py-2 text-xs">{e.detail}</td>
                      <td className="px-4 py-2">
                        <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", e.result === "success" ? "bg-green/15 text-green" : "bg-red/15 text-red")}>
                          {e.result}
                        </span>
                      </td>
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

// ── Audit Tab ───────────────────────────────────────

function AuditTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 50 };
      if (severity) params.severity = severity;
      if (search) params.q = search;
      const { data } = await api.get<PaginatedAudit>(`${API_BASE}/logs/audit`, { params });
      setEntries(data.items); setTotal(data.total); setPages(data.pages);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, [page, severity, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sevBadge = (sev: string) => ({
    critical: "bg-red/15 text-red", warning: "bg-yellow/15 text-yellow", info: "bg-blue/15 text-blue",
  }[sev] || "bg-muted/15 text-muted");

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue" size={24} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select className="input w-auto text-sm" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}>
          <option value="">{t("logs:filter_all_severities")}</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <input className="input flex-1 text-sm" placeholder={t("logs:search_audit")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("logs:empty_audit")} description={t("logs:empty_audit_desc")} />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted">
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_timestamp")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_severity")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_actor")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_action")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_decision")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_detail")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-b border-border-subtle last:border-0 hover:bg-hover">
                    <td className="px-4 py-2 font-mono text-xs text-muted">{new Date(e.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2"><span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", sevBadge(e.severity))}>{e.severity}</span></td>
                    <td className="px-4 py-2 font-mono text-xs text-secondary">{e.actor}</td>
                    <td className="px-4 py-2 font-mono text-xs text-blue">{e.action}</td>
                    <td className="px-4 py-2"><span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", e.decision === "ALLOW" ? "bg-green/15 text-green" : "bg-red/15 text-red")}>{e.decision}</span></td>
                    <td className="px-4 py-2 text-xs text-muted truncate" style={{ maxWidth: 160 }}>{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={pages} onPageChange={(p) => setPage(p)} />
        </>
      )}
    </div>
  );
}

// ── System Tab ──────────────────────────────────────

function SystemTab() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SystemLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 50 };
      if (search) params.q = search;
      const { data } = await api.get<{ items: SystemLogEntry[]; total: number; pages: number }>(`${API_BASE}/logs`, { params });
      setEntries(data.items); setTotal(data.total); setPages(data.pages);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue" size={24} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="input flex-1 text-sm" placeholder={t("logs:search_system")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={Terminal} title={t("logs:empty_system")} description={t("logs:empty_system_desc")} />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted">
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_timestamp")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_level")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_source")}</th>
                  <th className="px-4 py-2.5 text-left font-medium">{t("logs:col_message")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border-subtle last:border-0 hover:bg-hover">
                    <td className="px-4 py-2 font-mono text-xs text-muted">{e.timestamp}</td>
                    <td className="px-4 py-2"><span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", e.severity === "critical" ? "bg-red/15 text-red" : e.severity === "warning" ? "bg-yellow/15 text-yellow" : "bg-blue/15 text-blue")}>{e.severity}</span></td>
                    <td className="px-4 py-2 font-mono text-xs text-secondary">{e.source}</td>
                    <td className="px-4 py-2 text-xs text-muted">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={pages} onPageChange={(p) => setPage(p)} />
        </>
      )}
    </div>
  );
}
