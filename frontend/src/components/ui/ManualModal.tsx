import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, BookOpen, ChevronDown, ChevronRight } from "lucide-react";

interface ManualSection {
  titleKey: string;
  items: { key: string; label: string }[];
}

const SECTIONS: ManualSection[] = [
  {
    titleKey: "manual:section_getting_started",
    items: [
      { key: "login", label: "manual:topic_login" },
      { key: "dashboard", label: "manual:topic_dashboard" },
    ],
  },
  {
    titleKey: "manual:section_user_management",
    items: [
      { key: "users", label: "manual:topic_users" },
      { key: "groups", label: "manual:topic_groups" },
      { key: "ous", label: "manual:topic_ous" },
    ],
  },
  {
    titleKey: "manual:section_domain",
    items: [
      { key: "computers", label: "manual:topic_computers" },
      { key: "gpos", label: "manual:topic_gpos" },
      { key: "dns", label: "manual:topic_dns" },
      { key: "policies", label: "manual:topic_policies" },
    ],
  },
  {
    titleKey: "manual:section_system",
    items: [
      { key: "logs", label: "manual:topic_logs" },
      { key: "settings", label: "manual:topic_settings" },
      { key: "language", label: "manual:topic_language" },
    ],
  },
];

export function ManualModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>("login");
  const [query, setQuery] = useState("");

  const filtered = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) =>
      query ? t(i.label).toLowerCase().includes(query.toLowerCase()) : true,
    ),
  })).filter((s) => s.items.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-blue" />
            <h2 className="text-lg font-bold text-primary">
              {t("manual:title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-secondary hover:bg-hover hover:text-primary"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border px-6 py-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("manual:search_placeholder")}
            className="input"
            autoFocus
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.map((section) => (
            <div key={section.titleKey} className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {t(section.titleKey)}
              </h3>
              {section.items.map((item) => (
                <div key={item.key} className="mb-1">
                  <button
                    onClick={() =>
                      setExpanded(expanded === item.key ? null : item.key)
                    }
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-hover"
                  >
                    {expanded === item.key ? (
                      <ChevronDown size={14} className="text-muted" />
                    ) : (
                      <ChevronRight size={14} className="text-muted" />
                    )}
                    {t(item.label)}
                  </button>
                  {expanded === item.key && (
                    <div className="ml-6 border-l border-border-subtle pl-3 py-1 text-sm text-secondary">
                      <p>{t(`manual:desc_${item.key}`)}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              {t("manual:no_results")}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 text-xs text-muted">
          {t("manual:footer_version", { version: "v1.0.0" })}
        </div>
      </div>
    </div>
  );
}
