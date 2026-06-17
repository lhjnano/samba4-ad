import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  AlertCircle,
  Server,
  Lock,
  Globe,
} from "lucide-react";
import { api } from "../api/client";
import type { ProvisionResult } from "../types/api";

interface Props {
  onDone: () => void;
}

export function SetupWizard({ onDone }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [domainName, setDomainName] = useState("corp.example.com");
  const [netbiosName, setNetbiosName] = useState("CORP");
  const [dnsForwarder, setDnsForwarder] = useState("8.8.8.8");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [provisioning, setProvisioning] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const STEPS = [
    { id: 0, label: t("setup:step_welcome") },
    { id: 1, label: t("setup:step_domain_info") },
    { id: 2, label: t("setup:step_admin_account") },
    { id: 3, label: t("setup:step_provision") },
  ];

  // ── Step validators ───────────────────────────────
  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!/^[a-z0-9-]+\.[a-z0-9.-]+$/i.test(domainName))
      e.domainName = t("setup:validation_fqdn");
    if (!/^[A-Z][A-Z0-9-]{1,14}$/.test(netbiosName))
      e.netbiosName = t("setup:validation_netbios");
    if (dnsForwarder && !/^(\d{1,3}\.){3}\d{1,3}$/.test(dnsForwarder))
      e.dnsForwarder = t("setup:validation_ip");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2(): boolean {
    const e: Record<string, string> = {};
    if (adminPassword.length < 8)
      e.adminPassword = t("setup:validation_password_min");
    if (adminPassword !== confirmPassword)
      e.confirmPassword = t("setup:validation_password_mismatch");
    // Complexity check
    if (
      adminPassword.length >= 8 &&
      (!/[A-Z]/.test(adminPassword) ||
        !/[a-z]/.test(adminPassword) ||
        !/[0-9]/.test(adminPassword) ||
        !/[^A-Za-z0-9]/.test(adminPassword))
    )
      e.adminPassword = t("setup:validation_password_complexity");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Provision ─────────────────────────────────────
  async function doProvision() {
    setProvisioning(true);
    setErrors({});
    try {
      const { data } = await api.post<ProvisionResult>(
        "/api/v1/setup/provision",
        {
          domain_name: domainName,
          netbios_name: netbiosName,
          admin_password: adminPassword,
          dns_forwarder: dnsForwarder,
        }
      );
      setResult(data);
      if (data.success) {
        setStep(3);
      }
    } catch (err: any) {
      setErrors({ submit: err.message || t("setup:toast_provision_failed") });
    } finally {
      setProvisioning(false);
    }
  }

  const next = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 2) {
      doProvision();
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // ── Render ────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-root p-6">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-blue text-white">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-xl font-bold text-primary">{t("setup:title_app")}</h1>
          <p className="mt-1 text-sm text-secondary">{t("setup:subtitle")}</p>
        </div>

        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  step >= s.id
                    ? "bg-blue/15 text-blue"
                    : "bg-hover text-muted"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                    step > s.id
                      ? "bg-green text-white"
                      : step === s.id
                        ? "bg-blue text-white"
                        : "bg-muted text-root"
                  }`}
                >
                  {step > s.id ? <Check size={12} /> : i + 1}
                </span>
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px w-6 ${step > s.id ? "bg-blue" : "bg-border"}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="card p-8">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-primary">{t("setup:welcome_heading")}</h2>
              <p className="text-sm leading-relaxed text-secondary">
                {t("setup:welcome_intro")}
              </p>
              <ul className="space-y-2 text-sm text-secondary">
                {[
                  { icon: Globe, text: t("setup:welcome_item_fqdn") },
                  { icon: Server, text: t("setup:welcome_item_netbios") },
                  { icon: Lock, text: t("setup:welcome_item_password") },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3">
                    <Icon size={18} className="mt-0.5 text-blue" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-md border border-yellow/30 bg-yellow/5 p-3 text-xs text-yellow">
                <strong>{t("setup:notice_label")}</strong> {t("setup:notice_rename_warning")}
              </div>
            </div>
          )}

          {/* Step 1: Domain info */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-primary">{t("setup:heading_domain_info")}</h2>
              <div>
                <label className="label">{t("setup:label_domain_name")}</label>
                <input
                  className="input font-mono"
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value)}
                  placeholder="corp.example.com"
                />
                {errors.domainName && (
                  <p className="mt-1 text-xs text-red">{errors.domainName}</p>
                )}
              </div>
              <div>
                <label className="label">{t("setup:label_netbios_name")}</label>
                <input
                  className="input font-mono uppercase"
                  value={netbiosName}
                  onChange={(e) =>
                    setNetbiosName(e.target.value.toUpperCase().slice(0, 15))
                  }
                  placeholder="CORP"
                />
                {errors.netbiosName && (
                  <p className="mt-1 text-xs text-red">{errors.netbiosName}</p>
                )}
              </div>
              <div>
                <label className="label">{t("setup:label_dns_forwarder")}</label>
                <input
                  className="input font-mono"
                  value={dnsForwarder}
                  onChange={(e) => setDnsForwarder(e.target.value)}
                  placeholder="8.8.8.8"
                />
                {errors.dnsForwarder && (
                  <p className="mt-1 text-xs text-red">{errors.dnsForwarder}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Admin password */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-primary">
                {t("setup:heading_admin_account")}
              </h2>
              <p className="text-sm text-secondary">
                {t("setup:admin_account_desc", {
                  account: `${netbiosName}\\Administrator`,
                })}
              </p>
              <div>
                <label className="label">{t("setup:label_admin_password")}</label>
                <input
                  type="password"
                  className="input"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
                {errors.adminPassword && (
                  <p className="mt-1 text-xs text-red">{errors.adminPassword}</p>
                )}
              </div>
              <div>
                <label className="label">{t("setup:label_confirm_password")}</label>
                <input
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>
              <div className="rounded-md border border-border bg-hover/50 p-3 text-xs text-secondary">
                {t("setup:complexity_note")}
              </div>
              {errors.submit && (
                <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 p-3 text-sm text-red">
                  <AlertCircle size={16} />
                  {errors.submit}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Provisioning / Done */}
          {(step === 2 && provisioning) || step === 3 ? (
            <div className="space-y-5">
              {step !== 3 && provisioning && (
                <>
                  <h2 className="text-lg font-semibold text-primary">
                    {t("setup:heading_provisioning")}
                  </h2>
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={36} className="animate-spin text-blue" />
                  </div>
                  <p className="text-center text-sm text-secondary">
                    {t("setup:provisioning_progress")}
                  </p>
                </>
              )}

              {step === 3 && result?.success && (
                <>
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green/15">
                      <Check size={32} className="text-green" />
                    </div>
                    <h2 className="text-lg font-semibold text-primary">
                      {t("setup:heading_done")}
                    </h2>
                    <p className="mt-1 text-sm text-secondary">
                      {t("setup:done_desc", { domain: result.domain_name })}
                    </p>
                  </div>

                  {result.steps && (
                    <div className="space-y-1.5">
                      {result.steps.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-md bg-hover/50 px-3 py-2 text-xs"
                        >
                          <span className="text-secondary">{s.name}</span>
                          <span
                            className={`flex items-center gap-1 font-medium ${
                              s.status === "done"
                                ? "text-green"
                                : s.status === "failed"
                                  ? "text-red"
                                  : "text-yellow"
                            }`}
                          >
                            {s.status === "done" && <Check size={12} />}
                            {s.status === "done"
                              ? t("setup:status_done")
                              : s.status === "failed"
                                ? t("setup:status_failed")
                                : s.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={onDone} className="btn-primary w-full justify-center">
                    {t("setup:btn_go_dashboard")} <ArrowRight size={16} />
                  </button>
                </>
              )}
            </div>
          ) : null}

          {/* Nav buttons */}
          {step < 2 && (
            <div className="mt-8 flex justify-between">
              <button
                onClick={back}
                disabled={step === 0}
                className="btn-outline disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft size={16} /> {t("setup:btn_back")}
              </button>
              <button onClick={next} className="btn-primary">
                {t("setup:btn_next")} <ArrowRight size={16} />
              </button>
            </div>
          )}
          {step === 2 && !provisioning && (
            <div className="mt-8 flex justify-between">
              <button onClick={back} className="btn-outline">
                <ArrowLeft size={16} /> {t("setup:btn_back")}
              </button>
              <button onClick={next} className="btn-primary">
                {t("setup:btn_provision")} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
