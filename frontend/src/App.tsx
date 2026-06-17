import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "./api/client";
import type { SetupStatus } from "./types/api";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppShell } from "./components/layout/AppShell";
import { Login } from "./pages/Login";
import { SetupWizard } from "./pages/SetupWizard";
import { Dashboard } from "./pages/Dashboard";
import { Users } from "./pages/Users";
import { Groups } from "./pages/Groups";
import { Computers } from "./pages/Computers";
import { OUs } from "./pages/OUs";
import { GPOs } from "./pages/GPOs";
import { DNS } from "./pages/DNS";
import { Policies } from "./pages/Policies";
import { Logs } from "./pages/Logs";
import { Settings } from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function AppRoutes() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-root">
        <div className="text-secondary">{t("common:loading")}</div>
      </div>
    );
  }

  // Not authenticated → Login (inside BrowserRouter so useNavigate works)
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/computers" element={<Computers />} />
        <Route path="/ous" element={<OUs />} />
        <Route path="/gpos" element={<GPOs />} />
        <Route path="/dns" element={<DNS />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="*"
          element={
            <div className="p-8 text-secondary">
              {t("common:page_not_found")}{" "}
              <a href="/dashboard" className="text-blue">
                {t("common:go_to_dashboard")}
              </a>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  const { t } = useTranslation();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);

  useEffect(() => {
    api
      .get<SetupStatus>("/api/v1/setup/status")
      .then((r) => setSetupStatus(r.data))
      .catch(() => setSetupStatus({ provisioned: false }))
      .finally(() => setSetupLoading(false));
  }, []);

  if (setupLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-root">
        <div className="text-secondary">{t("common:loading")}</div>
      </div>
    );
  }

  // Not provisioned → Setup Wizard (full screen, no auth needed)
  if (!setupStatus?.provisioned) {
    return (
      <SetupWizard onDone={() => window.location.reload()} />
    );
  }

  // Provisioned → Auth gate → Main app
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
