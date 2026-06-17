import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ScrollText,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Info,
  AlertTriangle,
  OctagonAlert,
  Calendar,
  Activity,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import type { Paginated } from "@/types/api";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Constants ──────────────────────────────────────
const API_BASE = "/api/v1";
const PAGE_SIZE = 50;
const REFRESH_INTERVAL = 10_000;

type Severity = "info" | "warning" | "critical";

interface LogEntry {
  id: string;
  timestamp: string;
  severity: Severity;
  message: string;
}

type Toast = { type: "success" | "error"; message: string } | null;

type SeverityFilter = "all" | Severity;

// ── Helpers ────────────────────────────────────────
function formatDate(
  iso: string | null | undefined,
  locale: string,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function severityConfig(s: Severity, t: TFunction) {
  switch (s) {
    case "info":
      return {
        label: t("logs:severity_info"),
        cls: "bg-blue/10 text-blue",
        Icon: Info,
      };
    case "warning":
      return {
        label: t("logs:severity_warning"),
        cls: "bg-yellow/10 text-yellow",
        Icon: AlertTriangle,
      };
    case "critical":
      return {
        label: t("logs:severity_critical"),
        cls: "bg-red/10 text-red",
        Icon: OctagonAlert,
      };
    default:
      return {
        label: s || t("logs:severity_unknown"),
        cls: "bg-muted/15 text-muted",
        Icon: Info,
      };
  }
}

// ── Page ───────────────────────────────────────────
export function Logs() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ko" ? "ko-KR" : "en-US";

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  // Filters
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const severityOptions: { value: SeverityFilter; label: string }[] = useMemo(
    () => [
      { value: "all", label: t("logs:filter_all") },
      { value: "info", label: t("logs:filter_info") },
      { value: "warning", label: t("logs:filter_warning") },
      { value: "critical", label: t("logs:filter_critical") },
    ],
    [t],
  );

  // ── Fetch ────────────────────────────────────────
  const fetchLogs = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<Paginated<LogEntry>>(
          `${API_BASE}/logs`,
          {
            params: { page: 1, page_size: PAGE_SIZE },
          },
        );
        setLogs(data.items ?? []);
        setLastUpdated(new Date());
      } catch (err) {
        setError(
          (err as { message?: string })?.message ?? t("logs:error_load"),
        );
        if (silent) {
          setToast({
            type: "error",
            message: t("logs:toast_refresh_error"),
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // ── Auto-refresh every 10 seconds ────────────────
  useEffect(() => {
    const id = setInterval(() => {
      fetchLogs(true);
    }, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchLogs]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // ── Client-side filter ───────────────────────────
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (severity !== "all" && log.severity !== severity) return false;

      if (fromDate) {
        const from = new Date(fromDate).getTime();
        const ts = new Date(log.timestamp).getTime();
        if (!Number.isNaN(from) && ts < from) return false;
      }

      if (toDate) {
        // include the entire end day
        const to = new Date(toDate).getTime() + 24 * 60 * 60 * 1000;
        const ts = new Date(log.timestamp).getTime();
        if (!Number.isNaN(to) && ts > to) return false;
      }

      return true;
    });
  }, [logs, severity, fromDate, toDate]);

  function resetFilters() {
    setSeverity("all");
    setFromDate("");
    setToDate("");
  }

  const hasActiveFilters =
    severity !== "all" || fromDate !== "" || toDate !== "";

  const counts = useMemo(() => {
    const c = { info: 0, warning: 0, critical: 0 };
    for (const l of logs) {
      if (l.severity in c) c[l.severity as Severity]++;
    }
    return c;
  }, [logs]);

  // ── Columns ──────────────────────────────────────
  const columns = [
    {
      key: "timestamp",
      header: t("logs:th_time"),
      className: "w-48 whitespace-nowrap",
      render: (r: LogEntry) => (
        <span className="font-mono text-xs text-secondary">
          {formatDate(r.timestamp, locale)}
        </span>
      ),
    },
    {
      key: "severity",
      header: t("logs:th_severity"),
      className: "w-28",
      render: (r: LogEntry) => {
        const cfg = severityConfig(r.severity, t);
        const Icon = cfg.Icon;
        return (
          <span className={clsx("badge", cfg.cls)}>
            <Icon size={12} />
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: "message",
      header: t("logs:th_message"),
      render: (r: LogEntry) => (
        <span className="text-sm text-primary">{r.message || "—"}</span>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">{t("logs:title")}</h1>
          <p className="mt-0.5 text-sm text-secondary">{t("logs:subtitle")}</p>
        </div>
        <button
          className="btn-outline"
          onClick={() => fetchLogs()}
          disabled={loading}
        >
          {loading ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {t("logs:btn_refresh")}
        </button>
      </div>

      {/* Severity summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          icon={Info}
          label={t("logs:severity_info")}
          count={counts.info}
          tone="blue"
        />
        <SummaryCard
          icon={AlertTriangle}
          label={t("logs:severity_warning")}
          count={counts.warning}
          tone="yellow"
        />
        <SummaryCard
          icon={OctagonAlert}
          label={t("logs:severity_critical")}
          count={counts.critical}
          tone="red"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Severity segmented control */}
        <div className="flex rounded-md border border-border bg-card p-0.5">
          {severityOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSeverity(opt.value)}
              className={clsx(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                severity === opt.value
                  ? "bg-blue text-white"
                  : "text-secondary hover:bg-hover hover:text-primary",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="date"
              className="input w-[150px] py-2 pl-8 text-xs"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <span className="text-xs text-muted">
            {t("logs:date_range_separator")}
          </span>
          <div className="relative">
            <Calendar
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="date"
              className="input w-[150px] py-2 pl-8 text-xs"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="text-xs text-muted transition-colors hover:text-primary"
          >
            {t("logs:btn_reset_filters")}
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <Activity size={13} className="text-green" />
          {lastUpdated
            ? t("logs:last_updated", {
                time: lastUpdated.toLocaleTimeString(locale),
              })
            : t("logs:waiting_for_update")}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => fetchLogs()}
            className="ml-auto rounded px-2 py-1 text-xs hover:bg-red/10"
          >
            {t("logs:btn_retry")}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        {filteredLogs.length === 0 && !loading && !error ? (
          <EmptyState
            icon={ScrollText}
            title={t("logs:empty_no_logs_title")}
            description={
              hasActiveFilters
                ? t("logs:empty_no_logs_filtered")
                : t("logs:empty_no_logs_recorded")
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={filteredLogs}
            loading={loading}
            emptyMessage={t("logs:empty_no_logs")}
          />
        )}
      </div>

      {/* ── Toast ───────────────────────────────── */}
      {toast && (
        <div
          className={clsx(
            "fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-2xl",
            toast.type === "success"
              ? "border-green/40 text-green"
              : "border-red/40 text-red",
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 rounded p-0.5 text-muted hover:text-primary"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────
function SummaryCard({
  icon: Icon,
  label,
  count,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  tone: "blue" | "yellow" | "red";
}) {
  const tones = {
    blue: "bg-blue/10 text-blue",
    yellow: "bg-yellow/10 text-yellow",
    red: "bg-red/10 text-red",
  } as const;
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <span
        className={clsx(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md",
          tones[tone],
        )}
      >
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="font-mono text-lg font-semibold text-primary">
          {count.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
