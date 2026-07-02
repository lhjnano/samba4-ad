import {
  Search,
  Bell,
  Activity,
  LogOut,
  HelpCircle,
  User,
  UsersRound,
  Monitor,
  AlertTriangle,
  X,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SystemHealth, RecentAlert } from "../../types/api";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { ManualModal } from "../ui/ManualModal";

// ── Types ───────────────────────────────────────────
interface SearchHit {
  type: "user" | "group" | "computer" | "ou";
  id: string;
  name: string;
  description: string;
  path: string;
}

interface SearchResponse {
  query: string;
  total: number;
  results: SearchHit[];
}

const hitIcon = {
  user: User,
  group: UsersRound,
  computer: Monitor,
  ou: Activity,
} as const;

const hitColor = {
  user: "text-blue",
  group: "text-purple",
  computer: "text-green",
  ou: "text-yellow",
} as const;

export function Topbar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [showManual, setShowManual] = useState(false);

  // ── Search state ──────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Notifications state ───────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [alerts, setAlerts] = useState<RecentAlert[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // ── Health polling ────────────────────────────────
  useEffect(() => {
    const fetchHealth = () => {
      api
        .get<SystemHealth>("/api/v1/dashboard/system-health")
        .then((r) => setHealth(r.data))
        .catch(() => {});
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Debounced search ──────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const { data } = await api.get<SearchResponse>("/api/v1/search", {
        params: { q },
      });
      setSearchResults(data.results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setSearchOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 300);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navigate to users page with the search term
      navigate(`/users?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
    }
  }

  function handleHitClick(hit: SearchHit) {
    navigate(hit.path);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  // ── Notifications ─────────────────────────────────
  function toggleNotifications() {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next && alerts.length === 0) {
      setNotifLoading(true);
      api
        .get<RecentAlert[]>("/api/v1/dashboard/recent-alerts")
        .then((r) => setAlerts(r.data))
        .catch(() => {})
        .finally(() => setNotifLoading(false));
    }
  }

  // ── Click outside ─────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const cpuColor =
    (health?.cpu_percent ?? 0) > 80 ? "text-red" : "text-green";

  const unreadCount = alerts.filter(
    (a) => a.severity === "critical" || a.severity === "warning",
  ).length;

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-card px-6">
        {/* ── Search ───────────────────────────────── */}
        <div className="relative w-80" ref={searchRef}>
          <form onSubmit={handleSearchSubmit}>
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              placeholder={t("common:search_placeholder")}
              className="input pl-9"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            />
          </form>

          {/* Search dropdown */}
          {searchOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
              {searchLoading ? (
                <div className="px-4 py-3 text-sm text-muted">
                  {t("common:searching")}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted">
                  {searchQuery.trim()
                    ? t("common:search_no_results")
                    : t("common:search_hint")}
                </div>
              ) : (
                <div className="py-1">
                  {searchResults.map((hit) => {
                    const Icon = hitIcon[hit.type];
                    return (
                      <button
                        key={`${hit.type}-${hit.id}`}
                        onClick={() => handleHitClick(hit)}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover"
                      >
                        <Icon size={16} className={hitColor[hit.type]} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-primary">
                            {hit.name}
                          </div>
                          {hit.description && (
                            <div className="truncate text-xs text-muted">
                              {hit.description}
                            </div>
                          )}
                        </div>
                        <span className="text-xs uppercase text-muted">
                          {t(`common:type_${hit.type}`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right cluster ─────────────────────────── */}
        <div className="flex items-center gap-3">
          {/* System indicator */}
          <div className="flex items-center gap-2 text-xs text-secondary">
            <Activity size={14} className={cpuColor} />
            {health ? (
              <span className="font-mono">
                {t("common:metric_cpu")} {Math.round(health.cpu_percent)}% ·{" "}
                {t("common:metric_mem")} {Math.round(health.memory_percent)}%
              </span>
            ) : (
              <span>—</span>
            )}
          </div>

          {/* Language */}
          <LanguageSwitcher />

          {/* Manual */}
          <button
            onClick={() => setShowManual(true)}
            className="rounded-md p-2 text-secondary hover:bg-hover hover:text-primary"
            title={t("manual:title")}
          >
            <HelpCircle size={18} />
          </button>

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={toggleNotifications}
              className="relative rounded-md p-2 text-secondary hover:bg-hover hover:text-primary"
              title={t("common:notifications")}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {notifOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-card shadow-xl">
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
                  <span className="text-sm font-semibold text-primary">
                    {t("common:notifications")}
                  </span>
                  <button
                    onClick={() => setNotifOpen(false)}
                    className="rounded p-1 text-muted hover:text-primary"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifLoading ? (
                    <div className="px-4 py-6 text-center text-sm text-muted">
                      {t("common:loading")}
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted">
                      {t("common:no_notifications")}
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-start gap-2.5 border-b border-border-subtle px-4 py-2.5 last:border-b-0"
                      >
                        <AlertTriangle
                          size={14}
                          className={
                            alert.severity === "critical"
                              ? "mt-0.5 flex-shrink-0 text-red"
                              : alert.severity === "warning"
                                ? "mt-0.5 flex-shrink-0 text-yellow"
                                : "mt-0.5 flex-shrink-0 text-blue"
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-secondary">
                            {alert.message}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted">
                            {alert.timestamp}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <button
                  onClick={() => {
                    navigate("/logs");
                    setNotifOpen(false);
                  }}
                  className="w-full border-t border-border-subtle px-4 py-2.5 text-center text-xs text-secondary hover:bg-hover hover:text-primary"
                >
                  {t("common:view_all_logs")}
                </button>
              </div>
            )}
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-2 border-l border-border pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple text-sm font-medium text-white">
              {user?.display_name?.[0] || "A"}
            </div>
            <div className="text-sm">
              <div className="font-medium text-primary">
                {user?.display_name || t("common:default_admin_name")}
              </div>
              <div className="text-xs text-muted">
                {user?.role || t("common:default_role")}
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="ml-2 rounded-md p-1.5 text-secondary hover:bg-hover hover:text-primary"
              title={t("common:title_logout")}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      {showManual && <ManualModal onClose={() => setShowManual(false)} />}
    </>
  );
}
