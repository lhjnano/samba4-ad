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
  ShieldCheck,
} from "lucide-react";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";

export function Sidebar() {
  const { t } = useTranslation();

  const nav = [
    { to: "/dashboard", icon: LayoutDashboard, label: t("common:nav_dashboard") },
    { to: "/users", icon: Users, label: t("common:nav_users") },
    { to: "/groups", icon: UsersRound, label: t("common:nav_groups") },
    { to: "/computers", icon: Monitor, label: t("common:nav_computers") },
    { to: "/ous", icon: FolderTree, label: t("common:nav_ous") },
    { to: "/gpos", icon: FileText, label: t("common:nav_gpos") },
    { to: "/policies", icon: Shield, label: t("common:nav_policies") },
    { to: "/iam", icon: ShieldCheck, label: t("common:nav_iam") },
    { to: "/dns", icon: Network, label: t("common:nav_dns") },
    { to: "/logs", icon: ScrollText, label: t("common:nav_logs") },
    { to: "/settings", icon: Settings, label: t("common:nav_settings") },
  ];

  return (
    <aside className="flex w-60 flex-shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue font-bold text-white">
          {t("common:app_logo")}
        </div>
        <span className="text-sm font-semibold text-primary">{t("common:app_name")}</span>
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
        <div className="font-medium text-secondary">{t("common:app_version")}</div>
        <div className="mt-0.5">{t("common:app_tagline")}</div>
      </div>
    </aside>
  );
}
