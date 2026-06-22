import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  Lock,
  ArrowLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";
import { api } from "../api/client";

type LoginPhase = "credentials" | "mfa";

interface LoginResponse {
  access_token?: string;
  mfa_required?: boolean;
  username?: string;
  user?: {
    username: string;
    display_name: string;
    email: string | null;
    role: string;
    groups: string[];
  };
}

export function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<LoginPhase>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/api/v1/auth/login", {
        username,
        password,
      });

      if (data.mfa_required) {
        setPhase("mfa");
        setLoading(false);
        return;
      }

      // No MFA — store token and navigate
      if (data.access_token) {
        localStorage.setItem("token", data.access_token);
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
        }
        navigate("/");
        window.location.reload();
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(detail || err.message || t("common:login_failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>(
        "/api/v1/auth/mfa-verify",
        { username, code: otpCode },
      );

      if (data.access_token) {
        localStorage.setItem("token", data.access_token);
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
        }
        navigate("/");
        window.location.reload();
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(detail || t("common:mfa_invalid_code"));
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  }

  function backToCredentials() {
    setPhase("credentials");
    setOtpCode("");
    setError("");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-root p-6">
      {/* Language switcher — bottom left */}
      <div className="absolute bottom-6 left-6">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-blue text-white">
            {phase === "mfa" ? (
              <Lock size={28} />
            ) : (
              <ShieldCheck size={28} />
            )}
          </div>
          <h1 className="text-xl font-bold text-primary">
            {t("common:app_name")}
          </h1>
          <p className="mt-1 text-sm text-secondary">
            {phase === "mfa"
              ? t("common:mfa_enter_code")
              : t("common:login_subtitle")}
          </p>
        </div>

        {/* Phase 1: Credentials */}
        {phase === "credentials" && (
          <form onSubmit={handleLogin} className="card space-y-5 p-6">
            <div>
              <label htmlFor="username" className="label">
                {t("common:username")}
              </label>
              <input
                id="username"
                type="text"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                {t("common:password")}
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 p-3 text-sm text-red">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn-primary w-full justify-center disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t("common:logging_in")}
                </>
              ) : (
                t("common:login_btn")
              )}
            </button>
          </form>
        )}

        {/* Phase 2: MFA Code */}
        {phase === "mfa" && (
          <form onSubmit={handleMfaVerify} className="card space-y-5 p-6">
            <div className="text-center">
              <p className="text-sm text-secondary">
                {t("common:mfa_open_authenticator")}
              </p>
            </div>

            <div>
              <label htmlFor="otp" className="label text-center">
                {t("common:mfa_verification_code")}
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="input text-center text-2xl font-mono tracking-[0.5em]"
                style={{ letterSpacing: "0.5em" }}
                value={otpCode}
                onChange={(e) =>
                  setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                autoFocus
                autoComplete="one-time-code"
                placeholder="000000"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 p-3 text-sm text-red">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="btn-primary w-full justify-center disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t("common:mfa_verifying")}
                </>
              ) : (
                t("common:mfa_verify_signin")
              )}
            </button>

            <button
              type="button"
              onClick={backToCredentials}
              className="flex w-full items-center justify-center gap-1 text-xs text-muted hover:text-secondary"
            >
              <ArrowLeft size={12} />
              {t("common:back_to_login")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
