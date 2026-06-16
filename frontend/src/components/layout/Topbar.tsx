import { Search, Bell, Activity, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { SystemHealth } from "../../types/api";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

export function Topbar() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
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
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-card px-6">
      {/* Search */}
      <div className="relative w-80">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="text"
          placeholder="검색 (사용자, 그룹, 컴퓨터...)"
          className="input pl-9"
        />
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {/* System indicator */}
        <div className="flex items-center gap-2 text-xs text-secondary">
          <Activity size={14} className={cpuColor} />
          {health ? (
            <span className="font-mono">
              CPU {Math.round(health.cpu_percent)}% · MEM{" "}
              {Math.round(health.memory_percent)}%
            </span>
          ) : (
            <span>—</span>
          )}
        </div>

        {/* Notifications */}
        <button className="relative rounded-md p-2 text-secondary hover:bg-hover hover:text-primary">
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red" />
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2 border-l border-border pl-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple text-sm font-medium text-white">
            {user?.display_name?.[0] || "A"}
          </div>
          <div className="text-sm">
            <div className="font-medium text-primary">
              {user?.display_name || "Administrator"}
            </div>
            <div className="text-xs text-muted">{user?.role || "admin"}</div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="ml-2 rounded-md p-1.5 text-secondary hover:bg-hover hover:text-primary"
            title="로그아웃"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
