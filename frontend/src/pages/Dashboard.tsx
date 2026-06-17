import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  UsersRound,
  Monitor,
  FolderTree,
  FileText,
  TrendingUp,
  AlertTriangle,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { api } from "../api/client";
import type {
  DashboardStats,
  LoginTrendPoint,
  OUDistribution,
  RecentAlert,
  ServicesStatus,
  SystemHealth,
} from "../types/api";
import { clsx } from "clsx";

export function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [services, setServices] = useState<ServicesStatus[]>([]);
  const [loginTrend, setLoginTrend] = useState<LoginTrendPoint[]>([]);
  const [ouDist, setOUDist] = useState<OUDistribution[]>([]);
  const [alerts, setAlerts] = useState<RecentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      api.get("/api/v1/dashboard/stats"),
      api.get("/api/v1/dashboard/system-health"),
      api.get("/api/v1/dashboard/services"),
      api.get("/api/v1/dashboard/login-trend"),
      api.get("/api/v1/dashboard/ou-distribution"),
      api.get("/api/v1/dashboard/recent-alerts"),
    ]).then((results) => {
      const [s, h, sv, lt, ou, al] = results;
      if (s.status === "fulfilled") setStats(s.value.data);
      if (h.status === "fulfilled") setHealth(h.value.data);
      if (sv.status === "fulfilled") setServices(sv.value.data);
      if (lt.status === "fulfilled") setLoginTrend(lt.value.data);
      if (ou.status === "fulfilled") setOUDist(ou.value.data);
      if (al.status === "fulfilled") setAlerts(al.value.data);
      if (s.status === "rejected") setError(t("dashboard:error_load"));
      setLoading(false);
    });
  }, [t]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-secondary">{t("dashboard:loading")}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-red">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-primary">{t("dashboard:title")}</h1>
        <p className="mt-0.5 text-sm text-secondary">
          {t("dashboard:subtitle")}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-6 gap-4">
        <StatCard
          icon={Users}
          label={t("dashboard:stat_total_users")}
          value={stats?.total_users ?? 0}
          subValue={`${stats?.active_users ?? 0} ${t("dashboard:stat_active_suffix")}`}
          color="blue"
        />
        <StatCard
          icon={UsersRound}
          label={t("dashboard:stat_groups")}
          value={stats?.total_groups ?? 0}
          color="purple"
        />
        <StatCard
          icon={Monitor}
          label={t("dashboard:stat_computers")}
          value={stats?.total_computers ?? 0}
          color="green"
        />
        <StatCard
          icon={FolderTree}
          label={t("dashboard:stat_ous")}
          value={stats?.total_ous ?? 0}
          color="yellow"
        />
        <StatCard
          icon={FileText}
          label={t("dashboard:stat_gpos")}
          value={stats?.total_gpos ?? 0}
          color="blue"
        />
        <StatCard
          icon={Server}
          label={t("dashboard:stat_domain_controllers")}
          value={stats?.domain_controllers?.length ?? 0}
          color="red"
        />
      </div>

      {/* Middle row: charts + system */}
      <div className="grid grid-cols-3 gap-4">
        {/* Login trend */}
        <div className="card col-span-2 p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-blue" />
            <h2 className="text-sm font-semibold text-primary">
              {t("dashboard:heading_login_trend")}
            </h2>
          </div>
          <LoginChart data={loginTrend} />
        </div>

        {/* System health */}
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-primary">
            {t("dashboard:heading_system_resources")}
          </h2>
          <div className="space-y-4">
            <ResourceBar
              icon={Cpu}
              label={t("dashboard:resource_cpu")}
              value={health?.cpu_percent ?? 0}
            />
            <ResourceBar
              icon={MemoryStick}
              label={t("dashboard:resource_memory")}
              value={health?.memory_percent ?? 0}
            />
            <ResourceBar
              icon={HardDrive}
              label={t("dashboard:resource_disk")}
              value={health?.disk_percent ?? 0}
            />
          </div>
          {health && (
            <div className="mt-4 border-t border-border pt-3 text-xs text-muted">
              {t("dashboard:uptime_label")} <span className="font-mono text-secondary">{health.uptime}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: services + OU dist + alerts */}
      <div className="grid grid-cols-3 gap-4">
        {/* Services */}
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-primary">
            {t("dashboard:heading_service_status")}
          </h2>
          <div className="space-y-2">
            {services.length === 0 && (
              <p className="text-xs text-muted">{t("dashboard:empty_data")}</p>
            )}
            {services.map((svc) => (
              <div
                key={svc.name}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-secondary">{svc.name}</span>
                <span
                  className={clsx(
                    "badge",
                    svc.status === "healthy"
                      ? "bg-green/10 text-green"
                      : svc.status === "degraded"
                        ? "bg-yellow/10 text-yellow"
                        : "bg-red/10 text-red"
                  )}
                >
                  {svc.status === "healthy" ? (
                    <CheckCircle2 size={11} />
                  ) : (
                    <XCircle size={11} />
                  )}
                  {svc.status === "healthy"
                    ? t("common:status_healthy")
                    : svc.status === "degraded"
                      ? t("common:status_degraded")
                      : svc.status === "down"
                        ? t("common:status_down")
                        : svc.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* OU Distribution */}
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-primary">
            {t("dashboard:heading_ou_distribution")}
          </h2>
          <div className="space-y-2">
            {ouDist.length === 0 && (
              <p className="text-xs text-muted">{t("dashboard:empty_data")}</p>
            )}
            {ouDist.slice(0, 6).map((ou) => {
              const max = Math.max(...ouDist.map((o) => o.user_count), 1);
              return (
                <div key={ou.ou}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-secondary">{ou.ou}</span>
                    <span className="font-mono text-muted">{ou.user_count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                    <div
                      className="h-full rounded-full bg-blue transition-all"
                      style={{ width: `${(ou.user_count / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent alerts */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow" />
            <h2 className="text-sm font-semibold text-primary">{t("dashboard:heading_recent_alerts")}</h2>
          </div>
          <div className="space-y-2">
            {alerts.length === 0 && (
              <p className="text-xs text-muted">{t("dashboard:empty_alerts")}</p>
            )}
            {alerts.slice(0, 6).map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-2 text-xs"
              >
                <span
                  className={clsx(
                    "mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full",
                    alert.severity === "critical"
                      ? "bg-red"
                      : alert.severity === "warning"
                        ? "bg-yellow"
                        : "bg-blue"
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate text-secondary">{alert.message}</p>
                  <p className="text-muted">{alert.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Domain info footer */}
      {stats && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-primary">{t("dashboard:heading_domain_info")}</h2>
          <div className="grid grid-cols-4 gap-4 text-xs">
            <Info label={t("dashboard:info_domain_functional_level")} value={stats.domain_functional_level} />
            <Info label={t("dashboard:info_forest_functional_level")} value={stats.forest_functional_level} />
            <Info
              label={t("dashboard:info_domain_controllers")}
              value={stats.domain_controllers?.join(", ") || "—"}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────

const colorMap = {
  blue: "text-blue",
  purple: "text-purple",
  green: "text-green",
  yellow: "text-yellow",
  red: "text-red",
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  subValue?: string;
  color: keyof typeof colorMap;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-secondary">{label}</span>
        <Icon size={16} className={colorMap[color]} />
      </div>
      <div className="mt-2 text-2xl font-bold text-primary">{value.toLocaleString()}</div>
      {subValue && (
        <div className="mt-0.5 text-xs text-muted">{subValue}</div>
      )}
    </div>
  );
}

function ResourceBar({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: number;
}) {
  const color = value > 80 ? "bg-red" : value > 60 ? "bg-yellow" : "bg-green";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-secondary">
          <Icon size={13} />
          {label}
        </span>
        <span className="font-mono text-primary">{Math.round(value)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-hover">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function LoginChart({ data }: { data: LoginTrendPoint[] }) {
  const { t } = useTranslation();
  if (!data.length)
    return (
      <div className="flex h-40 items-center justify-center text-xs text-muted">
        {t("dashboard:empty_data")}
      </div>
    );

  const max = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = 140;

  return (
    <div className="flex items-end gap-2" style={{ height: chartHeight + 20 }}>
      {data.map((point) => {
        const h = (point.count / max) * chartHeight;
        return (
          <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-mono text-muted">{point.count}</span>
            <div
              className="w-full rounded-t bg-blue/70 transition-all hover:bg-blue"
              style={{ height: Math.max(h, 2) }}
            />
            <span className="text-xs text-muted">
              {point.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-secondary">{value || "—"}</div>
    </div>
  );
}
