import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Server,
  Network,
  Globe,
  User,
  KeyRound,
} from "lucide-react";
import { api } from "@/api/client";

// ── Types ──────────────────────────────────────────
interface DomainInfo {
  fqdn: string;
  netbios_name: string;
  forest_name: string;
  dc_hostname: string;
  dc_ip: string;
  domain_functional_level: string;
}

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

// ── Clipboard helper (works on HTTP, not just HTTPS) ───────────
function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for non-secure (HTTP) context
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* noop */
  }
  document.body.removeChild(ta);
}

// ── Copy button ────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        copyToClipboard(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded p-1 text-muted hover:bg-hover hover:text-primary"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
    </button>
  );
}

// ── Info row ───────────────────────────────────────
function InfoRow({
  icon: Icon,
  label,
  value,
  copyable = true,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  copyable?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
      <div className="flex items-center gap-2 text-sm text-secondary">
        <Icon size={14} className="text-muted" />
        {label}
      </div>
      <div className="flex items-center gap-1">
        <code className="rounded bg-root/50 px-2 py-0.5 font-mono text-xs text-primary">
          {value}
        </code>
        {copyable && <CopyButton value={value} />}
      </div>
    </div>
  );
}

// ── Domain connection section ──────────────────────
function DomainConnectionInfo() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<DomainInfo | null>(null);
  const [showDetails, setShowDetails] = useState(true);

  useEffect(() => {
    api
      .get<DomainInfo>("/api/v1/domain/info")
      .then((r) => setInfo(r.data))
      .catch(() => {});
  }, []);

  const realm = info?.fqdn || "CORP.LOCAL";
  const netbios = info?.netbios_name || "CORP";
  const dcHost = info?.dc_hostname || "dom39-forest01.corp.local";
  const dcIp = info?.dc_ip || "192.168.39.1";
  const baseDn = `DC=${realm.toLowerCase().split(".").join(",DC=")}`;
  const ldapUrl = `ldap://${dcIp}`;
  const kerberosRealm = realm.toUpperCase();

  return (
    <div className="mb-4">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="mb-2 flex w-full items-center gap-1.5 text-left"
      >
        {showDetails ? (
          <ChevronDown size={14} className="text-blue" />
        ) : (
          <ChevronRight size={14} className="text-blue" />
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-blue">
          {t("manual:section_connection")}
        </h3>
      </button>

      {showDetails && (
        <div className="rounded-lg border border-blue/20 bg-blue/5 p-3">
          <p className="mb-2 text-xs text-secondary">
            {t("manual:connection_intro")}
          </p>

          {/* Core info table */}
          <div className="mb-3">
            <InfoRow icon={Globe} label={t("manual:conn_realm")} value={realm} />
            <InfoRow icon={Network} label={t("manual:conn_netbios")} value={netbios} />
            <InfoRow icon={Server} label={t("manual:conn_dc_host")} value={dcHost} />
            <InfoRow icon={Server} label={t("manual:conn_dc_ip")} value={dcIp} />
            <InfoRow icon={Network} label={t("manual:conn_dns")} value={dcIp} />
            <InfoRow icon={Globe} label={t("manual:conn_base_dn")} value={baseDn} />
            <InfoRow icon={Network} label={t("manual:conn_ldap_url")} value={ldapUrl} />
            <InfoRow icon={KeyRound} label={t("manual:conn_kerberos")} value={kerberosRealm} />
            <InfoRow icon={User} label={t("manual:conn_admin")} value="Administrator" />
          </div>

          {/* NAS example */}
          <div className="rounded-md bg-card p-3">
            <p className="mb-1.5 text-xs font-semibold text-primary">
              {t("manual:nas_example_title")}
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-secondary">
{t("manual:nas_example", {
  realm,
  netbios,
  dcIp,
  dcHost,
  baseDn,
})}
            </pre>
          </div>

          {/* Linux smb.conf example */}
          <div className="mt-2 rounded-md bg-card p-3">
            <p className="mb-1.5 text-xs font-semibold text-primary">
              {t("manual:smbconf_title")}
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-secondary">
{t("manual:smbconf_example", {
  realm,
  netbios,
  dcIp,
  dcHost,
})}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────
export function ManualModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) =>
      query ? t(i.label).toLowerCase().includes(query.toLowerCase()) : true,
    ),
  })).filter((s) => s.items.length > 0);

  const showConnection = useCallback(() => {
    if (!query) return true;
    const labels = ["connection", "connect", "nas", "dns", "realm", "domain", "연결", "도메인"];
    return labels.some((l) => l.includes(query.toLowerCase()) || query.toLowerCase().includes(l));
  }, [query]);

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
          {/* Domain connection info (always at top) */}
          {showConnection() && <DomainConnectionInfo />}

          {/* Topic sections */}
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
          {filtered.length === 0 && !showConnection() && (
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
