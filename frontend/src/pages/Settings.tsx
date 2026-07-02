import { useCallback, useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Server,
  Globe,
  Network,
  Database,
  Download,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Info,
  Cpu,
  Boxes,
  HardDrive,
  ShieldCheck,
  Languages,
  KeyRound,
  Lock,
} from "lucide-react";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { DashboardStats } from "@/types/api";
import { LANGUAGES } from "@/i18n";

// ── Constants ──────────────────────────────────────
const API_BASE = "/api/v1";

type Toast = { type: "success" | "error"; message: string } | null;

// Static-ish system info (frontend build-time values)
const SYSTEM_INFO = {
  appVersion: "1.0.0",
  mode: import.meta.env.VITE_APP_MODE || "mock",
  pythonVersion: "3.12",
  sambaVersion: "—",
};

interface LdapSettings {
  host: string;
  port: string;
  bindDn: string;
  baseDn: string;
}

// ── Page ───────────────────────────────────────────
export function Settings() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connection settings (read-only, fetched from backend)
  const [ldap, setLdap] = useState<LdapSettings>({
    host: "",
    port: "",
    bindDn: "",
    baseDn: "",
  });

  const [toast, setToast] = useState<Toast>(null);

  // ── Fetch ────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, connRes] = await Promise.allSettled([
        api.get<DashboardStats>(`${API_BASE}/dashboard/stats`),
        api.get(`${API_BASE}/settings/connection`),
      ]);
      if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
      if (connRes.status === "fulfilled") {
        const c = connRes.value.data;
        setLdap({
          host: c.host || "",
          port: String(c.port || ""),
          bindDn: c.bind_dn || "",
          baseDn: c.search_base || "",
        });
      }
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          t("settings:error_load"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function handleExport() {
    const payload = {
      exported_at: new Date().toISOString(),
      system: SYSTEM_INFO,
      domain: stats,
      connection: ldap,
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `samba4-ad-config-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ type: "success", message: t("settings:toast_config_exported") });
    } catch {
      setToast({ type: "error", message: t("settings:toast_export_failed") });
    }
  }

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          setToast({
            type: "success",
            message: t("settings:toast_import_preview", {
              name: file.name,
              date: data.exported_at || "—",
            }),
          });
        } catch {
          setToast({ type: "error", message: t("settings:toast_import_invalid") });
        }
      };
      reader.onerror = () => {
        setToast({ type: "error", message: t("settings:toast_import_failed") });
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-primary">
          {t("settings:title")}
        </h1>
        <p className="mt-0.5 text-sm text-secondary">
          {t("settings:subtitle")}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchStats}
            className="ml-auto rounded px-2 py-1 text-xs hover:bg-red/10"
          >
            {t("settings:btn_retry")}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-secondary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ── System Information ─────────────────── */}
          <SectionCard
            icon={Cpu}
            iconTone="blue"
            title={t("settings:section_system_info")}
            subtitle={t("settings:section_system_info_sub")}
          >
            <InfoGrid>
              <InfoItem
                icon={Boxes}
                label={t("settings:label_app_version")}
                value={t("settings:value_app_version", {
                  version: SYSTEM_INFO.appVersion,
                })}
              />
              <InfoItem
                icon={SettingsIcon}
                label={t("settings:label_run_mode")}
                value={
                  <span className="badge bg-blue/10 text-blue">
                    {SYSTEM_INFO.mode.toUpperCase()}
                  </span>
                }
              />
              <InfoItem
                icon={Info}
                label={t("settings:label_python_version")}
                value={SYSTEM_INFO.pythonVersion}
                mono
              />
              <InfoItem
                icon={HardDrive}
                label={t("settings:label_samba_version")}
                value={SYSTEM_INFO.sambaVersion}
                mono
              />
            </InfoGrid>
          </SectionCard>

          {/* ── Domain Information ─────────────────── */}
          <SectionCard
            icon={Globe}
            iconTone="green"
            title={t("settings:section_domain_info")}
            subtitle={t("settings:section_domain_info_sub")}
          >
            <InfoGrid>
              <InfoItem
                icon={Globe}
                label={t("settings:label_domain_name")}
                value={stats?.domain_controllers?.length
                  ? deriveDomainName(stats)
                  : "corp.local"}
                mono
              />
              <InfoItem
                icon={Network}
                label={t("settings:label_netbios_name")}
                value={deriveNetbiosName(stats)}
                mono
              />
              <InfoItem
                icon={ShieldCheck}
                label={t("settings:label_functional_level")}
                value={
                  stats?.domain_functional_level ||
                  stats?.forest_functional_level ||
                  "—"
                }
              />
              <InfoItem
                icon={Server}
                label={t("settings:label_domain_controllers")}
                value={
                  stats?.domain_controllers?.length
                    ? t("settings:value_dc_count", {
                        count: stats.domain_controllers.length,
                      })
                    : "—"
                }
              />
            </InfoGrid>

            {stats?.domain_controllers?.length ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  {t("settings:controllers_list")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {stats.domain_controllers.map((dc) => (
                    <span
                      key={dc}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-hover px-2.5 py-1 font-mono text-xs text-secondary"
                    >
                      <Server size={11} className="text-green" />
                      {dc}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </SectionCard>

          {/* ── Connection Settings ────────────────── */}
          <SectionCard
            icon={Database}
            iconTone="purple"
            title={t("settings:section_connection")}
            subtitle={t("settings:section_connection_sub")}
            className="lg:col-span-2"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="badge bg-blue/10 text-blue">
                  {t("settings:badge_read_only")}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t("settings:label_ldap_host")}>
                  <input
                    className="input font-mono opacity-70"
                    value={ldap.host}
                    readOnly
                    placeholder="—"
                  />
                </Field>

                <Field label={t("settings:label_port")}>
                  <input
                    type="text"
                    className="input font-mono opacity-70"
                    value={ldap.port}
                    readOnly
                    placeholder="—"
                  />
                </Field>

                <Field label={t("settings:label_bind_dn")}>
                  <input
                    className="input font-mono text-xs opacity-70"
                    value={ldap.bindDn}
                    readOnly
                    placeholder="—"
                  />
                </Field>

                <Field label={t("settings:label_base_dn")}>
                  <input
                    className="input font-mono text-xs opacity-70"
                    value={ldap.baseDn}
                    readOnly
                    placeholder="—"
                  />
                </Field>
              </div>

              <div className="flex items-center border-t border-border-subtle pt-3">
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Info size={12} />
                  {t("settings:connection_readonly_note")}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* ── Change Password ────────────────────── */}
          <ChangePasswordSection
            onToast={(msg, type) => setToast({ type, message: msg })}
          />

          {/* ── MFA / 2FA ─────────────────────────── */}
          <MfaSection
            onToast={(msg, type) => setToast({ type, message: msg })}
          />

          {/* ── Backup / Restore ───────────────────── */}
          <SectionCard
            icon={ShieldCheck}
            iconTone="yellow"
            title={t("settings:section_backup_restore")}
            subtitle={t("settings:section_backup_restore_sub")}
            className="lg:col-span-2"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ActionTile
                icon={Download}
                title={t("settings:tile_export_title")}
                description={t("settings:tile_export_desc")}
                buttonLabel={t("settings:tile_export_button")}
                onClick={handleExport}
              />
              <ActionTile
                icon={Upload}
                title={t("settings:tile_import_title")}
                description={t("settings:tile_import_desc")}
                buttonLabel={t("settings:tile_import_button")}
                onClick={handleImport}
              />
            </div>
          </SectionCard>

          {/* ── Language ────────────────────────────── */}
          <SectionCard
            icon={Languages}
            iconTone="blue"
            title={t("settings:section_language")}
            subtitle={t("settings:section_language_sub")}
            className="lg:col-span-2"
          >
            <div className="flex items-center justify-between border-t border-border-subtle pt-3">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Languages size={12} />
                {t("settings:label_language")}
              </p>
              <select
                value={i18n.language}
                onChange={(e) => {
                  i18n.changeLanguage(e.target.value);
                  setToast({
                    type: "success",
                    message: t("settings:toast_language_changed"),
                  });
                }}
                className="input"
              >
                {Object.entries(LANGUAGES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </SectionCard>
        </div>
      )}

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

// ── Derive helpers (DashboardStats has no explicit name fields) ──
function deriveDomainName(stats: DashboardStats | null): string {
  const dc = stats?.domain_controllers?.[0];
  if (typeof dc === "string" && dc.includes(".")) {
    // Heuristic: strip leading host segment
    const parts = dc.split(".");
    if (parts.length > 2) return parts.slice(1).join(".");
  }
  return "corp.local";
}

function deriveNetbiosName(stats: DashboardStats | null): string {
  const name = deriveDomainName(stats);
  const label = name.split(".")[0];
  return label ? label.toUpperCase() : "CORP";
}

// ── Sub-components ─────────────────────────────────
function SectionCard({
  icon: Icon,
  iconTone,
  title,
  subtitle,
  className,
  children,
}: {
  icon: React.ElementType;
  iconTone: "blue" | "green" | "purple" | "yellow";
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    blue: "bg-blue/15 text-blue",
    green: "bg-green/15 text-green",
    purple: "bg-purple/15 text-purple",
    yellow: "bg-yellow/15 text-yellow",
  } as const;
  return (
    <div className={clsx("card", className)}>
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-4">
        <span
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-md",
            tones[iconTone],
          )}
        >
          <Icon size={16} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-primary">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border-subtle sm:grid-cols-2">
      {children}
    </dl>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-hover/40 px-4 py-3">
      <dt className="flex items-center gap-2 text-xs text-secondary">
        <Icon size={14} className="flex-shrink-0 text-muted" />
        {label}
      </dt>
      <dd
        className={clsx(
          "max-w-[60%] truncate text-right text-sm",
          mono ? "font-mono text-muted" : "text-primary",
        )}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function ActionTile({
  icon: Icon,
  title,
  description,
  buttonLabel,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-border-subtle bg-hover/30 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-card text-secondary">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
      </div>
      <button onClick={onClick} className="btn-outline mt-4 w-full justify-center">
        <Icon size={15} /> {buttonLabel}
      </button>
    </div>
  );
}

// ── Change Password Section ────────────────────────
function ChangePasswordSection({
  onToast,
}: {
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const { t } = useTranslation();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  const pwValid =
    newPw.length >= 8 &&
    /[A-Z]/.test(newPw) &&
    /[a-z]/.test(newPw) &&
    /[0-9]/.test(newPw);
  const pwMatch = newPw === confirmPw && newPw.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPw || !pwValid || !pwMatch) return;
    setSaving(true);
    try {
      await api.post(`${API_BASE}/self-service/change-password`, {
        current_password: currentPw,
        new_password: newPw,
      });
      onToast(t("settings:toast_password_changed"), "success");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      const msg = (err as { detail?: string })?.detail || t("settings:toast_password_failed");
      onToast(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      icon={KeyRound}
      iconTone="green"
      title={t("settings:section_change_password")}
      subtitle={t("settings:section_change_password_sub")}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">{t("settings:label_current_password")}</label>
          <input
            type="password"
            className="input"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="label">{t("settings:label_new_password")}</label>
          <input
            type="password"
            className="input"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
          />
          {newPw.length > 0 && !pwValid && (
            <p className="mt-1 text-xs text-yellow">
              {t("settings:password_requirements")}
            </p>
          )}
        </div>
        <div>
          <label className="label">{t("settings:label_confirm_password")}</label>
          <input
            type="password"
            className="input"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
          />
          {confirmPw.length > 0 && !pwMatch && (
            <p className="mt-1 text-xs text-red">{t("settings:password_mismatch")}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={saving || !currentPw || !pwValid || !pwMatch}
          className="btn-primary w-full justify-center disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Lock size={15} />
          )}
          {t("settings:btn_change_password")}
        </button>
      </form>
    </SectionCard>
  );
}

// ── MFA Section ────────────────────────────────────
function MfaSection({
  onToast,
}: {
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const { t } = useTranslation();
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showEnroll, setShowEnroll] = useState(false);
  const [secret, setSecret] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [enrollCode, setEnrollCode] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get<{ enabled: boolean; enrolled: boolean }>(
        `${API_BASE}/auth/mfa/status`,
      );
      setEnrolled(data.enrolled);
    } catch {
      // MFA not configured
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function startEnroll() {
    try {
      const { data } = await api.post<{ secret: string; qr_url: string }>(
        `${API_BASE}/auth/mfa/setup`,
      );
      setSecret(data.secret);
      setQrUrl(data.qr_url);
      setShowEnroll(true);
      setEnrollCode("");
    } catch {
      onToast(t("settings:mfa_enroll_failed"), "error");
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (enrollCode.length !== 6) return;
    setEnrolling(true);
    try {
      await api.post(`${API_BASE}/auth/mfa/enroll`, {
        secret,
        code: enrollCode,
      });
      setEnrolled(true);
      setShowEnroll(false);
      onToast(t("settings:mfa_enroll_success"), "success");
    } catch {
      onToast(t("settings:mfa_enroll_failed"), "error");
    } finally {
      setEnrolling(false);
    }
  }

  async function handleDisable() {
    setDisabling(true);
    try {
      await api.delete(`${API_BASE}/auth/mfa/enroll`);
      setEnrolled(false);
      setShowDisableConfirm(false);
      onToast(t("settings:mfa_disable_success"), "success");
    } catch {
      onToast(t("settings:mfa_disable_failed"), "error");
    } finally {
      setDisabling(false);
    }
  }

  if (loading) return null;

  return (
    <>
      <SectionCard
        icon={ShieldCheck}
        iconTone="purple"
        title={t("settings:section_mfa")}
        subtitle={t("settings:section_mfa_sub")}
      >
        {enrolled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-green/15 px-2.5 py-0.5 text-xs font-medium text-green">
                <ShieldCheck size={10} /> {t("settings:mfa_enabled")}
              </span>
            </div>
            {showDisableConfirm ? (
              <div className="rounded-lg border border-red/30 bg-red/5 p-3">
                <p className="mb-2 text-sm text-red">{t("settings:mfa_confirm_disable")}</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDisable}
                    disabled={disabling}
                    className="btn-danger flex-1 justify-center text-sm"
                  >
                    {disabling ? <Loader2 size={14} className="animate-spin" /> : null}
                    {t("settings:mfa_disable")}
                  </button>
                  <button
                    onClick={() => setShowDisableConfirm(false)}
                    className="btn-outline flex-1 justify-center text-sm"
                  >
                    {t("common:cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDisableConfirm(true)}
                className="btn-danger w-full justify-center text-sm"
              >
                {t("settings:mfa_disable")}
              </button>
            )}
          </div>
        ) : showEnroll ? (
          <form onSubmit={confirmEnroll} className="space-y-3">
            <div className="text-center">
              <img
                src={qrUrl}
                alt="QR Code"
                className="mx-auto h-40 w-40 rounded-lg border border-border"
                style={{ imageRendering: "pixelated" }}
              />
              <p className="mt-2 text-xs text-secondary">{t("settings:mfa_scan_qr")}</p>
            </div>
            <div>
              <label className="label text-xs">{t("settings:mfa_secret_key")}</label>
              <div className="flex gap-1">
                <code className="flex-1 rounded bg-input px-2 py-1.5 font-mono text-xs text-green">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(secret);
                  }}
                  className="btn-outline px-2 text-xs"
                >
                  {t("settings:mfa_copy")}
                </button>
              </div>
            </div>
            <div>
              <label className="label">{t("settings:mfa_enter_code_enroll")}</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="input text-center font-mono text-lg tracking-widest"
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={enrolling || enrollCode.length !== 6}
              className="btn-primary w-full justify-center text-sm disabled:opacity-50"
            >
              {enrolling ? <Loader2 size={14} className="animate-spin" /> : null}
              {t("settings:mfa_enable_btn")}
            </button>
            <button
              type="button"
              onClick={() => setShowEnroll(false)}
              className="w-full text-center text-xs text-muted hover:text-secondary"
            >
              {t("settings:mfa_skip")}
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/15 px-2.5 py-0.5 text-xs font-medium text-muted">
                {t("settings:mfa_not_enabled")}
              </span>
            </div>
            <p className="text-xs text-secondary">{t("settings:section_mfa_sub")}</p>
            <button
              onClick={startEnroll}
              className="btn-primary w-full justify-center text-sm"
            >
              <ShieldCheck size={14} /> {t("settings:mfa_enable")}
            </button>
          </div>
        )}
      </SectionCard>
    </>
  );
}
