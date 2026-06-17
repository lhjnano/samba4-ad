import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  UserPlus,
  Search,
  Mail,
  Building2,
  Key,
  Trash2,
  UserCog,
  Download,
  Power,
  ShieldAlert,
  Clock,
  FolderTree,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import type { ADUser, Paginated } from "@/types/api";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";

// ── Constants ──────────────────────────────────────
const PAGE_SIZE = 20;
const API_BASE = "/api/v1";

interface CreateForm {
  username: string;
  display_name: string;
  email: string;
  department: string;
  title: string;
  password: string;
  ou: string;
  groups: string;
}

const EMPTY_FORM: CreateForm = {
  username: "",
  display_name: "",
  email: "",
  department: "",
  title: "",
  password: "",
  ou: "",
  groups: "",
};

type Toast = { type: "success" | "error"; message: string } | null;

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

// ── Helpers ────────────────────────────────────────
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function statusFor(u: ADUser): "enabled" | "disabled" | "locked" {
  if (u.locked) return "locked";
  return u.enabled ? "enabled" : "disabled";
}

function parseGroups(raw: string): string[] {
  return raw
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

function validatePassword(pw: string, t: TFunc): string | null {
  if (!pw) return t("users:validation_password_required");
  if (pw.length < 8) return t("users:validation_password_min");
  if (
    !/[A-Z]/.test(pw) ||
    !/[a-z]/.test(pw) ||
    !/[0-9]/.test(pw) ||
    !/[^A-Za-z0-9]/.test(pw)
  ) {
    return t("users:validation_password_complexity");
  }
  return null;
}

// ── Page ───────────────────────────────────────────
export function Users() {
  const { t } = useTranslation();

  // List state
  const [users, setUsers] = useState<ADUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [department, setDepartment] = useState("");

  // Detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ADUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Detail actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Create drawer
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<Toast>(null);

  // ── Debounced search ─────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Fetch list ───────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<Paginated<ADUser>>(`${API_BASE}/users`, {
        params,
      });
      setUsers(data.items);
      setTotal(data.total);
      setTotalPages(data.pages || 1);
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          t("users:error_load_list"),
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ── Departments (derived) ────────────────────────
  const departments = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.department) set.add(u.department);
    });
    return Array.from(set).sort();
  }, [users]);

  const visibleUsers = useMemo(
    () => (department ? users.filter((u) => u.department === department) : users),
    [users, department],
  );

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Detail ───────────────────────────────────────
  async function openDetail(user: ADUser) {
    setSelectedUser(user);
    setDetailOpen(true);
    setDetailError(null);
    setShowReset(false);
    setNewPassword("");
    setResetError(null);
    setShowDeleteConfirm(false);
    setDetailLoading(true);
    try {
      const { data } = await api.get<ADUser>(`${API_BASE}/users/${user.id}`);
      setSelectedUser(data);
    } catch (err) {
      setDetailError(
        (err as { message?: string })?.message ??
          t("users:error_load_detail"),
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelectedUser(null);
    setDetailError(null);
    setShowReset(false);
    setNewPassword("");
    setResetError(null);
    setShowDeleteConfirm(false);
  }

  function patchRowInList(updated: ADUser) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  // ── Actions ──────────────────────────────────────
  async function handleToggleEnabled() {
    if (!selectedUser) return;
    setActionLoading("toggle");
    try {
      const { data } = await api.patch<ADUser>(
        `${API_BASE}/users/${selectedUser.id}`,
        { enabled: !selectedUser.enabled },
      );
      setSelectedUser(data);
      patchRowInList(data);
      setToast({
        type: "success",
        message: data.enabled
          ? t("users:toast_user_enabled")
          : t("users:toast_user_disabled"),
      });
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ?? t("users:toast_status_failed"),
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    const v = validatePassword(newPassword, t);
    if (v) {
      setResetError(v);
      return;
    }
    setActionLoading("reset");
    try {
      await api.post(`${API_BASE}/users/${selectedUser.id}/reset-password`, {
        new_password: newPassword,
      });
      setToast({ type: "success", message: t("users:toast_password_reset") });
      setShowReset(false);
      setNewPassword("");
      setResetError(null);
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ??
          t("users:toast_password_reset_failed"),
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    if (!selectedUser) return;
    setActionLoading("delete");
    try {
      await api.delete(`${API_BASE}/users/${selectedUser.id}`);
      setToast({ type: "success", message: t("users:toast_user_deleted") });
      closeDetail();
      fetchUsers();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? t("users:toast_delete_failed"),
      });
    } finally {
      setActionLoading(null);
    }
  }

  function handleExport() {
    const url = new URL(`${API_BASE}/users/export`, window.location.origin);
    if (debouncedSearch) url.searchParams.set("search", debouncedSearch);
    window.location.href = url.toString();
  }

  // ── Create ───────────────────────────────────────
  function openCreate() {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setCreateOpen(true);
  }

  function setField<K extends keyof CreateForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.username.trim()) errs.username = t("users:validation_username_required");
    if (!form.display_name.trim()) errs.display_name = t("users:validation_display_name_required");
    if (!form.email.trim()) errs.email = t("users:validation_email_required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errs.email = t("users:validation_email_format");
    const pwErr = validatePassword(form.password, t);
    if (pwErr) errs.password = pwErr;
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const body = {
        username: form.username.trim(),
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        password: form.password,
        department: form.department.trim() || undefined,
        title: form.title.trim() || undefined,
        ou: form.ou.trim() || undefined,
      };
      const { data: created } = await api.post<ADUser>(
        `${API_BASE}/users`,
        body,
      );

      // Best-effort group assignment via partial update
      const groups = parseGroups(form.groups);
      let groupsFailed = false;
      if (groups.length) {
        try {
          await api.patch(`${API_BASE}/users/${created.id}`, {
            member_of: groups,
          });
        } catch {
          groupsFailed = true;
        }
      }

      setToast({
        type: groupsFailed ? "error" : "success",
        message: groupsFailed
          ? t("users:toast_user_created_groups_failed")
          : t("users:toast_user_created"),
      });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      fetchUsers();
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ?? t("users:toast_user_create_failed"),
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Columns ──────────────────────────────────────
  const columns = [
    {
      key: "display_name",
      header: t("users:th_name"),
      render: (u: ADUser) => (
        <div className="flex flex-col">
          <span className="font-medium text-primary">
            {u.display_name || "—"}
          </span>
          <span className="font-mono text-xs text-muted">{u.username}</span>
        </div>
      ),
    },
    {
      key: "department",
      header: t("users:th_department"),
      render: (u: ADUser) => (
        <span className="text-secondary">{u.department || "—"}</span>
      ),
    },
    {
      key: "title",
      header: t("users:th_title"),
      render: (u: ADUser) => (
        <span className="text-secondary">{u.title || "—"}</span>
      ),
    },
    {
      key: "status",
      header: t("users:th_status"),
      render: (u: ADUser) => <StatusBadge status={statusFor(u)} />,
    },
    {
      key: "ou",
      header: t("users:th_ou"),
      render: (u: ADUser) => (
        <span className="font-mono text-xs text-muted">{u.ou || "—"}</span>
      ),
    },
    {
      key: "last_logon",
      header: t("users:th_last_logon"),
      render: (u: ADUser) => (
        <span className="text-muted">{formatDate(u.last_logon)}</span>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">{t("users:title")}</h1>
          <p className="mt-0.5 text-sm text-secondary">
            {t("users:subtitle_count", { count: total.toLocaleString() })}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="input pl-9"
            placeholder={t("users:ph_search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <Building2
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <select
            className="input cursor-pointer appearance-none pl-9 pr-9"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">{t("users:filter_all_departments")}</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>

        <div className="flex gap-2">
          <button className="btn-outline" onClick={handleExport}>
            <Download size={16} /> {t("users:btn_export")}
          </button>
          <button className="btn-primary" onClick={openCreate}>
            <UserPlus size={16} /> {t("users:btn_add_user")}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchUsers}
            className="ml-auto rounded px-2 py-1 text-xs hover:bg-red/10"
          >
            {t("users:btn_retry")}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={visibleUsers}
          loading={loading}
          emptyMessage={t("users:empty_no_users")}
          onRowClick={openDetail}
        />
        <div className="border-t border-border-subtle px-4 py-3">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* ── Detail Drawer ─────────────────────────── */}
      <Drawer
        open={detailOpen}
        onClose={closeDetail}
        title={t("users:drawer_title_detail")}
        width="lg"
      >
        {detailLoading && !selectedUser && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-secondary" />
          </div>
        )}

        {detailError && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
            <AlertCircle size={16} /> {detailError}
          </div>
        )}

        {selectedUser && (
          <div className="space-y-6">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-blue/15 text-lg font-semibold text-blue">
                {getInitials(selectedUser.display_name)}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-primary">
                  {selectedUser.display_name || "—"}
                </h3>
                <p className="font-mono text-sm text-muted">
                  @{selectedUser.username}
                </p>
                <div className="mt-1.5">
                  <StatusBadge status={statusFor(selectedUser)} />
                </div>
              </div>
            </div>

            {/* Basic info */}
            <DetailSection title={t("users:section_basic_info")}>
              <InfoRow icon={Mail} label={t("users:label_email")} value={selectedUser.email} />
              <InfoRow
                icon={Building2}
                label={t("users:label_department")}
                value={selectedUser.department}
              />
              <InfoRow icon={UserCog} label={t("users:label_title")} value={selectedUser.title} />
              <InfoRow
                icon={FolderTree}
                label={t("users:label_ou")}
                value={selectedUser.ou}
                mono
              />
              <InfoRow
                icon={Clock}
                label={t("users:label_created")}
                value={formatDate(selectedUser.created_at)}
              />
              <InfoRow
                icon={Clock}
                label={t("users:label_last_logon")}
                value={formatDate(selectedUser.last_logon)}
              />
            </DetailSection>

            {/* Groups */}
            <DetailSection
              title={t("users:section_group_membership", {
                count: selectedUser.member_of?.length ?? 0,
              })}
            >
              {selectedUser.member_of?.length ? (
                <div className="flex flex-wrap gap-1.5 p-4">
                  {selectedUser.member_of.map((g) => (
                    <span
                      key={g}
                      className="badge bg-blue/10 text-blue"
                      title={g}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="p-4 text-xs text-muted">{t("users:empty_no_groups")}</p>
              )}
            </DetailSection>

            {/* Management actions */}
            <DetailSection title={t("users:section_account_management")}>
              <div className="space-y-2 p-4">
                <button
                  onClick={handleToggleEnabled}
                  disabled={actionLoading === "toggle"}
                  className="btn-outline w-full justify-center disabled:opacity-50"
                >
                  {actionLoading === "toggle" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Power size={16} />
                  )}
                  {selectedUser.enabled
                    ? t("users:btn_disable")
                    : t("users:btn_enable")}
                </button>

                <button
                  onClick={() => {
                    setShowReset((v) => !v);
                    setResetError(null);
                  }}
                  className="btn-outline w-full justify-center"
                >
                  <Key size={16} /> {t("users:btn_reset_password")}
                </button>

                {showReset && (
                  <div className="rounded-md border border-border-subtle bg-root/50 p-3">
                    <label className="label">{t("users:label_new_password")}</label>
                    <input
                      type="password"
                      className="input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t("users:ph_new_password")}
                      autoComplete="new-password"
                    />
                    {resetError && (
                      <p className="mt-1 text-xs text-red">{resetError}</p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          setShowReset(false);
                          setNewPassword("");
                          setResetError(null);
                        }}
                        className="btn-outline flex-1 justify-center"
                      >
                        {t("users:btn_cancel")}
                      </button>
                      <button
                        onClick={handleResetPassword}
                        disabled={actionLoading === "reset"}
                        className="btn-primary flex-1 justify-center disabled:opacity-50"
                      >
                        {actionLoading === "reset" ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Check size={16} />
                        )}
                        {t("users:btn_reset")}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger w-full justify-center"
                >
                  <Trash2 size={16} /> {t("users:btn_delete_user")}
                </button>

                {showDeleteConfirm && (
                  <div className="rounded-md border border-red/30 bg-red/5 p-3">
                    <div className="flex items-start gap-2 text-sm text-red">
                      <ShieldAlert
                        size={16}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <p>
                        {t("users:confirm_delete_user", {
                          name: selectedUser.display_name,
                        })}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="btn-outline flex-1 justify-center"
                      >
                        {t("users:btn_cancel")}
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={actionLoading === "delete"}
                        className="btn-danger flex-1 justify-center disabled:opacity-50"
                      >
                        {actionLoading === "delete" ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        {t("users:btn_delete_confirm")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </DetailSection>
          </div>
        )}
      </Drawer>

      {/* ── Create Drawer ────────────────────────── */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("users:drawer_title_create")}
        width="lg"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("users:label_username")} error={formErrors.username}>
              <input
                className="input font-mono"
                value={form.username}
                onChange={(e) => setField("username", e.target.value)}
                placeholder={t("users:ph_username")}
                autoComplete="off"
              />
            </Field>
            <Field label={t("users:label_display_name")} error={formErrors.display_name}>
              <input
                className="input"
                value={form.display_name}
                onChange={(e) => setField("display_name", e.target.value)}
                placeholder={t("users:ph_display_name")}
                autoComplete="off"
              />
            </Field>
          </div>

          <Field label={t("users:label_email_required")} error={formErrors.email}>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder={t("users:ph_email")}
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t("users:label_department_form")}>
              <input
                className="input"
                value={form.department}
                onChange={(e) => setField("department", e.target.value)}
                placeholder={t("users:ph_department")}
                autoComplete="off"
              />
            </Field>
            <Field label={t("users:label_title_form")}>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder={t("users:ph_title")}
                autoComplete="off"
              />
            </Field>
          </div>

          <Field
            label={t("users:label_password")}
            error={formErrors.password}
            hint={t("users:hint_password_complexity")}
          >
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder={t("users:ph_password")}
              autoComplete="new-password"
            />
          </Field>

          <Field
            label={t("users:label_ou_form")}
            hint={t("users:hint_ou_example")}
          >
            <input
              className="input font-mono"
              value={form.ou}
              onChange={(e) => setField("ou", e.target.value)}
              placeholder={t("users:ph_ou")}
              autoComplete="off"
            />
          </Field>

          <Field
            label={t("users:label_groups")}
            hint={t("users:hint_groups_comma")}
          >
            <input
              className="input"
              value={form.groups}
              onChange={(e) => setField("groups", e.target.value)}
              placeholder={t("users:ph_groups")}
              autoComplete="off"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-outline"
              onClick={() => setCreateOpen(false)}
            >
              {t("users:btn_cancel")}
            </button>
            <button
              type="submit"
              className="btn-primary disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> {t("users:btn_creating")}
                </>
              ) : (
                <>
                  <UserPlus size={16} /> {t("users:btn_create")}
                </>
              )}
            </button>
          </div>
        </form>
      </Drawer>

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
function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="flex items-center gap-2 text-xs text-secondary">
        <Icon size={14} className="flex-shrink-0 text-muted" />
        {label}
      </span>
      <span
        className={clsx(
          "max-w-[60%] truncate text-right text-sm",
          mono ? "font-mono text-muted" : "text-primary",
        )}
        title={value ?? undefined}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h4>
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {children}
      </div>
    </div>
  );
}
