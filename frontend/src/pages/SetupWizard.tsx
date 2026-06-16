import { useState } from "react";
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

const STEPS = [
  { id: 0, label: "환영" },
  { id: 1, label: "도메인 정보" },
  { id: 2, label: "관리자 계정" },
  { id: 3, label: "구축 실행" },
];

export function SetupWizard({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [domainName, setDomainName] = useState("corp.example.com");
  const [netbiosName, setNetbiosName] = useState("CORP");
  const [dnsForwarder, setDnsForwarder] = useState("8.8.8.8");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [provisioning, setProvisioning] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  // ── Step validators ───────────────────────────────
  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!/^[a-z0-9-]+\.[a-z0-9.-]+$/i.test(domainName))
      e.domainName = "올바른 FQDN을 입력하세요 (예: corp.example.com)";
    if (!/^[A-Z][A-Z0-9-]{1,14}$/.test(netbiosName))
      e.netbiosName = "2~15자 대문자, 숫자 (예: CORP)";
    if (dnsForwarder && !/^(\d{1,3}\.){3}\d{1,3}$/.test(dnsForwarder))
      e.dnsForwarder = "올바른 IP 주소를 입력하세요";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2(): boolean {
    const e: Record<string, string> = {};
    if (adminPassword.length < 8)
      e.adminPassword = "비밀번호는 8자 이상이어야 합니다";
    if (adminPassword !== confirmPassword)
      e.confirmPassword = "비밀번호가 일치하지 않습니다";
    // Complexity check
    if (
      adminPassword.length >= 8 &&
      (!/[A-Z]/.test(adminPassword) ||
        !/[a-z]/.test(adminPassword) ||
        !/[0-9]/.test(adminPassword) ||
        !/[^A-Za-z0-9]/.test(adminPassword))
    )
      e.adminPassword = "대문자, 소문자, 숫자, 특수문자 각각 1개 이상 필요";
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
      setErrors({ submit: err.message || "구축 실패" });
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
          <h1 className="text-xl font-bold text-primary">AD Manager Setup</h1>
          <p className="mt-1 text-sm text-secondary">
            Samba 4 Active Directory 도메인 컨트롤러 구축
          </p>
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
              <h2 className="text-lg font-semibold text-primary">환영합니다</h2>
              <p className="text-sm leading-relaxed text-secondary">
                이 마법사는 새 Active Directory 도메인을 구축합니다. 다음이 필요합니다:
              </p>
              <ul className="space-y-2 text-sm text-secondary">
                {[
                  { icon: Globe, text: "도메인 이름 (FQDN), 예: corp.example.com" },
                  { icon: Server, text: "NetBIOS 이름, 예: CORP" },
                  { icon: Lock, text: "관리자 비밀번호 (복잡성 요구)" },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3">
                    <Icon size={18} className="mt-0.5 text-blue" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-md border border-yellow/30 bg-yellow/5 p-3 text-xs text-yellow">
                <strong>주의:</strong> 구축 후 도메인 이름을 변경하기 어렵습니다.
                신중하게 선택하세요.
              </div>
            </div>
          )}

          {/* Step 1: Domain info */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-primary">도메인 정보</h2>
              <div>
                <label className="label">도메인 이름 (FQDN)</label>
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
                <label className="label">NetBIOS 이름</label>
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
                <label className="label">DNS 포워더 (선택)</label>
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
                도메인 관리자 계정
              </h2>
              <p className="text-sm text-secondary">
                <code className="rounded bg-hover px-1.5 py-0.5 text-blue">
                  {netbiosName}\Administrator
                </code>{" "}
                계정의 비밀번호를 설정합니다.
              </p>
              <div>
                <label className="label">관리자 비밀번호</label>
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
                <label className="label">비밀번호 확인</label>
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
                복잡성 요구: 대문자, 소문자, 숫자, 특수문자 각각 1개 이상, 8자 이상
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
                    도메인 구축 중...
                  </h2>
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={36} className="animate-spin text-blue" />
                  </div>
                  <p className="text-center text-sm text-secondary">
                    samba-tool domain provision 실행 중. 30~60초 소요됩니다.
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
                      도메인 구축 완료
                    </h2>
                    <p className="mt-1 text-sm text-secondary">
                      <span className="font-mono text-blue">
                        {result.domain_name}
                      </span>{" "}
                      도메인이 생성되었습니다.
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
                            {s.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={onDone} className="btn-primary w-full justify-center">
                    대시보드로 이동 <ArrowRight size={16} />
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
                <ArrowLeft size={16} /> 이전
              </button>
              <button onClick={next} className="btn-primary">
                다음 <ArrowRight size={16} />
              </button>
            </div>
          )}
          {step === 2 && !provisioning && (
            <div className="mt-8 flex justify-between">
              <button onClick={back} className="btn-outline">
                <ArrowLeft size={16} /> 이전
              </button>
              <button onClick={next} className="btn-primary">
                도메인 구축 <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
