import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";

export function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-root p-6">
      {/* Language switcher — top right */}
      <div className="absolute right-6 top-6">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-blue text-white">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-xl font-bold text-primary">{t("common:app_name")}</h1>
          <p className="mt-1 text-sm text-secondary">{t("common:login_subtitle")}</p>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="card space-y-5 p-6">
          <div>
            <label className="label">{t("common:username")}</label>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div>
            <label className="label">{t("common:password")}</label>
            <input
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
            disabled={loading}
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

        <p className="mt-4 text-center text-xs text-muted">
          {t("common:default_account_hint", { creds: "admin / admin" })}
        </p>
      </div>
    </div>
  );
}
