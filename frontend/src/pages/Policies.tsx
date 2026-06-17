import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

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
        (err as { message?: string })?.message ?? t("policies:error_load"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
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
      setToast({ type: "success", message: t("policies:toast_policy_saved") });
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ??
          t("policies:toast_policy_save_failed"),
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
            <h1 className="text-xl font-bold text-primary">
              {t("policies:title")}
            </h1>
            <p className="mt-0.5 text-sm text-secondary">
              {t("policies:subtitle")}
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
                {t("policies:btn_cancel")}
              </button>
            )}
            <button
              type="submit"
              className="btn-primary disabled:opacity-50"
              disabled={saving || !dirty}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />{" "}
                  {t("policies:btn_saving")}
                </>
              ) : (
                <>
                  <Save size={16} /> {t("policies:btn_save")}
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
              {t("policies:btn_retry")}
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
              <h2 className="text-sm font-semibold text-primary">
                {t("policies:section_password_policy")}
              </h2>
              <p className="text-xs text-muted">
                {t("policies:section_password_policy_sub")}
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
                    {t("policies:toggle_complex_passwords")}
                  </p>
                  <p className="text-xs text-muted">
                    {t("policies:toggle_complex_passwords_hint")}
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
              label={t("policies:label_min_password_length")}
              hint={t("policies:hint_min_password_length")}
              value={policy.min_password_length}
              min={0}
              max={128}
              suffix={t("policies:suffix_chars")}
              onChange={(v) => setNumber("min_password_length", v)}
            />

            <PolicyNumberRow
              icon={History}
              label={t("policies:label_password_history")}
              hint={t("policies:hint_password_history")}
              value={policy.password_history}
              min={0}
              max={24}
              suffix={t("policies:suffix_count")}
              onChange={(v) => setNumber("password_history", v)}
            />

            <PolicyNumberRow
              icon={CalendarClock}
              label={t("policies:label_max_password_age")}
              hint={t("policies:hint_max_password_age")}
              value={policy.max_password_age_days}
              min={0}
              max={999}
              suffix={t("policies:suffix_days")}
              onChange={(v) => setNumber("max_password_age_days", v)}
            />

            <PolicyNumberRow
              icon={Clock}
              label={t("policies:label_min_password_age")}
              hint={t("policies:hint_min_password_age")}
              value={policy.min_password_age_days}
              min={0}
              max={998}
              suffix={t("policies:suffix_days")}
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
                {t("policies:section_lockout_policy")}
              </h2>
              <p className="text-xs text-muted">
                {t("policies:section_lockout_policy_sub")}
              </p>
            </div>
          </div>

          <div className="divide-y divide-border-subtle">
            <PolicyNumberRow
              icon={Lock}
              label={t("policies:label_lockout_threshold")}
              hint={t("policies:hint_lockout_threshold")}
              value={policy.account_lockout_threshold}
              min={0}
              max={999}
              suffix={t("policies:suffix_times")}
              onChange={(v) => setNumber("account_lockout_threshold", v)}
            />

            <PolicyNumberRow
              icon={Clock}
              label={t("policies:label_lockout_duration")}
              hint={t("policies:hint_lockout_duration")}
              value={policy.account_lockout_duration_minutes}
              min={0}
              max={99999}
              suffix={t("policies:suffix_minutes")}
              onChange={(v) =>
                setNumber("account_lockout_duration_minutes", v)
              }
            />

            <PolicyNumberRow
              icon={History}
              label={t("policies:label_lockout_reset_time")}
              hint={t("policies:hint_lockout_reset_time")}
              value={policy.reset_lockout_after_minutes}
              min={0}
              max={99999}
              suffix={t("policies:suffix_minutes")}
              onChange={(v) => setNumber("reset_lockout_after_minutes", v)}
            />
          </div>
        </div>

        {/* Sticky save bar when dirty */}
        {dirty && (
          <div className="sticky bottom-4 z-30 flex items-center justify-between rounded-lg border border-blue/40 bg-card/95 px-4 py-3 shadow-xl backdrop-blur">
            <span className="flex items-center gap-2 text-sm text-secondary">
              <AlertCircle size={15} className="text-yellow" />
              {t("policies:unsaved_changes")}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-outline"
                onClick={reset}
                disabled={saving}
              >
                {t("policies:btn_cancel")}
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
                {t("policies:btn_save")}
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
