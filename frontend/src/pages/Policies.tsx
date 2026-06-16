import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Lock,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  ShieldCheck,
  Clock,
  History,
  CalendarClock,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import type { DomainPolicy } from "@/types/api";

// ── Constants ──────────────────────────────────────
const API_BASE = "/api/v1";

type Toast = { type: "success" | "error"; message: string } | null;

const EMPTY_POLICY: DomainPolicy = {
  complex_passwords: true,
  min_password_length: 7,
  password_history: 24,
  max_password_age_days: 42,
  min_password_age_days: 1,
  account_lockout_threshold: 0,
  account_lockout_duration_minutes: 30,
  reset_lockout_after_minutes: 30,
};

// ── Page ───────────────────────────────────────────
export function Policies() {
  const [policy, setPolicy] = useState<DomainPolicy>(EMPTY_POLICY);
  const [original, setOriginal] = useState<DomainPolicy>(EMPTY_POLICY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const dirty = JSON.stringify(policy) !== JSON.stringify(original);

  // ── Fetch ────────────────────────────────────────
  const fetchPolicy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DomainPolicy>(
        `${API_BASE}/policies/domain`,
      );
      setPolicy(data);
      setOriginal(data);
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          "도메인 정책을 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Update helpers ───────────────────────────────
  function setNumber<K extends keyof DomainPolicy>(
    key: K,
    raw: string,
  ) {
    const num = raw === "" ? 0 : Math.max(0, Number(raw));
    setPolicy((prev) => ({ ...prev, [key]: Number.isNaN(num) ? 0 : num }));
  }

  function setBool(key: "complex_passwords", value: boolean) {
    setPolicy((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setPolicy(original);
  }

  // ── Save ─────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put<DomainPolicy>(
        `${API_BASE}/policies/domain`,
        policy,
      );
      setPolicy(data);
      setOriginal(data);
      setToast({ type: "success", message: "정책이 저장되었습니다" });
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ?? "정책 저장에 실패했습니다",
      });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary">도메인 정책</h1>
            <p className="mt-0.5 text-sm text-secondary">
              비밀번호 및 계정 잠금 정책을 관리합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                className="btn-outline"
                onClick={reset}
                disabled={saving}
              >
                취소
              </button>
            )}
            <button
              type="submit"
              className="btn-primary disabled:opacity-50"
              disabled={saving || !dirty}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 저장 중...
                </>
              ) : (
                <>
                  <Save size={16} /> 저장
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{error}</span>
            <button
              onClick={fetchPolicy}
              className="ml-auto rounded px-2 py-1 text-xs hover:bg-red/10"
            >
              재시도
            </button>
          </div>
        )}

        {/* Password Policy */}
        <div className="card">
          <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue/15 text-blue">
              <KeyRound size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-primary">비밀번호 정책</h2>
              <p className="text-xs text-muted">
                도메인 계정 비밀번호 복잡성 및 수명 규칙
              </p>
            </div>
          </div>

          <div className="divide-y divide-border-subtle">
            {/* Complex passwords toggle */}
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  size={16}
                  className="mt-0.5 flex-shrink-0 text-muted"
                />
                <div>
                  <p className="text-sm font-medium text-primary">
                    복잡한 비밀번호 요구
                  </p>
                  <p className="text-xs text-muted">
                    대소문자, 숫자, 기호를 조합하도록 강제합니다
                  </p>
                </div>
              </div>
              <Toggle
                checked={policy.complex_passwords}
                onChange={(v) => setBool("complex_passwords", v)}
              />
            </div>

            <PolicyNumberRow
              icon={KeyRound}
              label="최소 비밀번호 길이"
              hint="비밀번호에 허용되는 최소 문자 수"
              value={policy.min_password_length}
              min={0}
              max={128}
              suffix="자"
              onChange={(v) => setNumber("min_password_length", v)}
            />

            <PolicyNumberRow
              icon={History}
              label="비밀번호 기록"
              hint="재사용을 방지하기 위해 보관할 이전 비밀번호 수"
              value={policy.password_history}
              min={0}
              max={24}
              suffix="개"
              onChange={(v) => setNumber("password_history", v)}
            />

            <PolicyNumberRow
              icon={CalendarClock}
              label="최대 비밀번호 사용 기간"
              hint="비밀번호를 변경해야 하는 기간 (0 = 사용 안 함)"
              value={policy.max_password_age_days}
              min={0}
              max={999}
              suffix="일"
              onChange={(v) => setNumber("max_password_age_days", v)}
            />

            <PolicyNumberRow
              icon={Clock}
              label="최소 비밀번호 사용 기간"
              hint="비밀번호를 다시 변경하기 전 최소 기간 (0 = 즉시 변경 가능)"
              value={policy.min_password_age_days}
              min={0}
              max={998}
              suffix="일"
              onChange={(v) => setNumber("min_password_age_days", v)}
            />
          </div>
        </div>

        {/* Lockout Policy */}
        <div className="card">
          <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-yellow/15 text-yellow">
              <Lock size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-primary">
                계정 잠금 정책
              </h2>
              <p className="text-xs text-muted">
                로그인 실패 시 계정 잠금 동작 제어
              </p>
            </div>
          </div>

          <div className="divide-y divide-border-subtle">
            <PolicyNumberRow
              icon={Lock}
              label="계정 잠금 임계값"
              hint="이 횟수만큼 로그인 실패 시 계정이 잠깁니다 (0 = 잠금 안 함)"
              value={policy.account_lockout_threshold}
              min={0}
              max={999}
              suffix="회"
              onChange={(v) => setNumber("account_lockout_threshold", v)}
            />

            <PolicyNumberRow
              icon={Clock}
              label="계정 잠금 기간"
              hint="잠긴 계정이 자동으로 잠금 해제되기까지의 시간 (0 = 수동 해제만)"
              value={policy.account_lockout_duration_minutes}
              min={0}
              max={99999}
              suffix="분"
              onChange={(v) =>
                setNumber("account_lockout_duration_minutes", v)
              }
            />

            <PolicyNumberRow
              icon={History}
              label="잠금 카운터 초기화 시간"
              hint="실패 횟수가 0으로 초기화되기까지의 시간"
              value={policy.reset_lockout_after_minutes}
              min={0}
              max={99999}
              suffix="분"
              onChange={(v) => setNumber("reset_lockout_after_minutes", v)}
            />
          </div>
        </div>

        {/* Sticky save bar when dirty */}
        {dirty && (
          <div className="sticky bottom-4 z-30 flex items-center justify-between rounded-lg border border-blue/40 bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
            <span className="flex items-center gap-2 text-sm text-secondary">
              <AlertCircle size={15} className="text-yellow" />
              저장하지 않은 변경 사항이 있습니다
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-outline"
                onClick={reset}
                disabled={saving}
              >
                취소
              </button>
              <button
                type="submit"
                className="btn-primary disabled:opacity-50"
                disabled={saving}
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                저장
              </button>
            </div>
          </div>
        )}
      </form>

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
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200",
        checked ? "bg-blue" : "bg-hover",
      )}
    >
      <span
        className={clsx(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

function PolicyNumberRow({
  icon: Icon,
  label,
  hint,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-start gap-3">
        <Icon size={16} className="mt-0.5 flex-shrink-0 text-muted" />
        <div>
          <p className="text-sm font-medium text-primary">{label}</p>
          <p className="text-xs text-muted">{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          className="input w-24 font-mono text-right"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="w-6 text-xs text-muted">{suffix}</span>
      </div>
    </div>
  );
}
