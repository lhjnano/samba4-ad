import { Search, Bell, Activity, LogOut, HelpCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SystemHealth } from "../../types/api";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { ManualModal } from "../ui/ManualModal";

export function Topbar() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [showManual, setShowManual] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/api/v1/dashboard/system-health")
      .then((r) => setHealth(r.data))
      .catch(() => {});
  }, []);

  const cpuColor =
    (health?.cpu_percent ?? 0) > 80 ? "text-red" : "text-green";

  return (
    <>
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-card px-6">
        {/* Search */}
        <div className="relative w-80">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            placeholder={t("common:search_placeholder")}
            className="input pl-9"
          />
        </div>

        {/* Right */}
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
          <button className="relative rounded-md p-2 text-secondary hover:bg-hover hover:text-primary">
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red" />
          </button>

          {/* Avatar */}
          <div className="flex items-center gap-2 border-l border-border pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple text-sm font-medium text-white">
              {user?.display_name?.[0] || "A"}
            </div>
            <div className="text-sm">
              <div className="font-medium text-primary">
                {user?.display_name || t("common:default_admin_name")}
              </div>
              <div className="text-xs text-muted">{user?.role || t("common:default_role")}</div>
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
