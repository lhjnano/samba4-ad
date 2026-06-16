import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Monitor,
  FolderTree,
  FileText,
  Shield,
  Network,
  Settings,
  ScrollText,
} from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { to: "/users", icon: Users, label: "사용자" },
  { to: "/groups", icon: UsersRound, label: "그룹" },
  { to: "/computers", icon: Monitor, label: "컴퓨터" },
  { to: "/ous", icon: FolderTree, label: "조직 단위" },
  { to: "/gpos", icon: FileText, label: "GPO" },
  { to: "/policies", icon: Shield, label: "도메인 정책" },
  { to: "/dns", icon: Network, label: "DNS" },
  { to: "/logs", icon: ScrollText, label: "감사 로그" },
  { to: "/settings", icon: Settings, label: "설정" },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 flex-shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue font-bold text-white">
          AD
        </div>
        <span className="text-sm font-semibold text-primary">AD Manager</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150",
                isActive
                  ? "bg-active text-primary font-medium"
                  : "text-secondary hover:bg-hover hover:text-primary"
              )
            }
          >
            <Icon size={17} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4 text-xs text-muted">
        <div className="font-medium text-secondary">AD Manager v0.1</div>
        <div className="mt-0.5">Samba 4 AD DC</div>
      </div>
    </aside>
  );
}
