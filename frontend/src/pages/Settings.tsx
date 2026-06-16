import { useCallback, useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Server,
  Globe,
  Network,
  Database,
  Save,
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
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import type { DashboardStats } from "@/types/api";

// ── Constants ──────────────────────────────────────
const API_BASE = "/api/v1";

type Toast = { type: "success" | "error"; message: string } | null;

// Static-ish system info (frontend build-time values)
const SYSTEM_INFO = {
  appVersion: "1.0.0",
  mode: "ldap",
  pythonVersion: "3.11",
  sambaVersion: "4.21",
};

interface LdapSettings {
  host: string;
  port: string;
  bindDn: string;
  baseDn: string;
}

const DEFAULT_LDAP: LdapSettings = {
  host: "127.0.0.1",
  port: "389",
  bindDn: "CN=Administrator,CN=Users,DC=corp,DC=example,DC=com",
  baseDn: "DC=corp,DC=example,DC=com",
};

// ── Page ───────────────────────────────────────────
export function Settings() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connection settings (editable, UI-only)
  const [ldap, setLdap] = useState<LdapSettings>(DEFAULT_LDAP);
  const [ldapDirty, setLdapDirty] = useState(false);

  const [toast, setToast] = useState<Toast>(null);

  // ── Fetch ────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DashboardStats>(
        `${API_BASE}/dashboard/stats`,
      );
      setStats(data);
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          "도메인 정보를 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Connection settings handlers ─────────────────
  function setLdapField<K extends keyof LdapSettings>(
    key: K,
    value: string,
  ) {
    setLdap((prev) => ({ ...prev, [key]: value }));
    setLdapDirty(true);
  }

  function saveLdap(e: React.FormEvent) {
    e.preventDefault();
    // UI-only persistence placeholder
    setLdapDirty(false);
    setToast({
      type: "success",
      message: "연결 설정이 저장되었습니다 (로컬)",
    });
  }

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
      setToast({ type: "success", message: "구성을 내보냈습니다" });
    } catch {
      setToast({ type: "error", message: "내보내기에 실패했습니다" });
    }
  }

  function handleImport() {
    // Placeholder — wire to file input in a real impl
    setToast({
      type: "success",
      message: "구성 가져오기는 추후 지원될 예정입니다",
    });
  }

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-primary">시스템 설정</h1>
        <p className="mt-0.5 text-sm text-secondary">
          시스템 정보, 도메인 및 연결 설정을 관리합니다
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
            재시도
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-secondary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ── 시스템 정보 ─────────────────────────── */}
          <SectionCard
            icon={Cpu}
            iconTone="blue"
            title="시스템 정보"
            subtitle="애플리케이션 및 런타임 정보"
          >
            <InfoGrid>
              <InfoItem
                icon={Boxes}
                label="앱 버전"
                value={`v${SYSTEM_INFO.appVersion}`}
              />
              <InfoItem
                icon={SettingsIcon}
                label="실행 모드"
                value={
                  <span className="badge bg-blue/10 text-blue">
                    {SYSTEM_INFO.mode.toUpperCase()}
                  </span>
                }
              />
              <InfoItem
                icon={Info}
                label="Python 버전"
                value={SYSTEM_INFO.pythonVersion}
                mono
              />
              <InfoItem
                icon={HardDrive}
                label="Samba 버전"
                value={SYSTEM_INFO.sambaVersion}
                mono
              />
            </InfoGrid>
          </SectionCard>

          {/* ── 도메인 정보 ─────────────────────────── */}
          <SectionCard
            icon={Globe}
            iconTone="green"
            title="도메인 정보"
            subtitle="현재 Active Directory 도메인 구성"
          >
            <InfoGrid>
              <InfoItem
                icon={Globe}
                label="도메인 이름"
                value={stats?.domain_controllers?.length
                  ? deriveDomainName(stats)
                  : "corp.example.com"}
                mono
              />
              <InfoItem
                icon={Network}
                label="NetBIOS 이름"
                value={deriveNetbiosName(stats)}
                mono
              />
              <InfoItem
                icon={ShieldCheck}
                label="기능 수준"
                value={
                  stats?.domain_functional_level ||
                  stats?.forest_functional_level ||
                  "—"
                }
              />
              <InfoItem
                icon={Server}
                label="도메인 컨트롤러"
                value={
                  stats?.domain_controllers?.length
                    ? `${stats.domain_controllers.length}대`
                    : "—"
                }
              />
            </InfoGrid>

            {stats?.domain_controllers?.length ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  컨트롤러 목록
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

          {/* ── 연결 설정 ───────────────────────────── */}
          <SectionCard
            icon={Database}
            iconTone="purple"
            title="연결 설정"
            subtitle="LDAP 서버 연결 구성"
            className="lg:col-span-2"
          >
            <form onSubmit={saveLdap} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="LDAP 호스트">
                  <input
                    className="input font-mono"
                    value={ldap.host}
                    onChange={(e) => setLdapField("host", e.target.value)}
                    placeholder="127.0.0.1"
                  />
                </Field>

                <Field label="포트">
                  <input
                    type="number"
                    className="input font-mono"
                    value={ldap.port}
                    onChange={(e) => setLdapField("port", e.target.value)}
                    placeholder="389"
                  />
                </Field>

                <Field label="Bind DN">
                  <input
                    className="input font-mono text-xs"
                    value={ldap.bindDn}
                    onChange={(e) => setLdapField("bindDn", e.target.value)}
                    placeholder="CN=Administrator,CN=Users,DC=..."
                  />
                </Field>

                <Field label="Base DN">
                  <input
                    className="input font-mono text-xs"
                    value={ldap.baseDn}
                    onChange={(e) => setLdapField("baseDn", e.target.value)}
                    placeholder="DC=corp,DC=example,DC=com"
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Info size={12} />
                  설정은 현재 세션에만 적용됩니다
                </p>
                <button
                  type="submit"
                  className="btn-primary disabled:opacity-50"
                  disabled={!ldapDirty}
                >
                  <Save size={16} /> 저장
                </button>
              </div>
            </form>
          </SectionCard>

          {/* ── 백업/복원 ─────────────────────────── */}
          <SectionCard
            icon={ShieldCheck}
            iconTone="yellow"
            title="백업 / 복원"
            subtitle="구성 데이터 내보내기 및 가져오기"
            className="lg:col-span-2"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ActionTile
                icon={Download}
                title="구성 내보내기"
                description="현재 시스템 구성을 JSON 파일로 다운로드합니다"
                buttonLabel="내보내기"
                onClick={handleExport}
              />
              <ActionTile
                icon={Upload}
                title="구성 가져오기"
                description="이전에 내보낸 구성 파일을 복원합니다"
                buttonLabel="가져오기"
                onClick={handleImport}
              />
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
  return "corp.example.com";
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
