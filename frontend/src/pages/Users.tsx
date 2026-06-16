import { useCallback, useEffect, useMemo, useState } from "react";
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

function validatePassword(pw: string): string | null {
  if (!pw) return "비밀번호를 입력하세요";
  if (pw.length < 8) return "비밀번호는 8자 이상이어야 합니다";
  if (
    !/[A-Z]/.test(pw) ||
    !/[a-z]/.test(pw) ||
    !/[0-9]/.test(pw) ||
    !/[^A-Za-z0-9]/.test(pw)
  ) {
    return "대문자, 소문자, 숫자, 특수문자 각각 1개 이상 필요합니다";
  }
  return null;
}

// ── Page ───────────────────────────────────────────
export function Users() {
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
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
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
          "사용자 목록을 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

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
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
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
          "사용자 정보를 불러오지 못했습니다",
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
          ? "사용자가 활성화되었습니다"
          : "사용자가 비활성화되었습니다",
      });
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ?? "상태 변경에 실패했습니다",
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    const v = validatePassword(newPassword);
    if (v) {
      setResetError(v);
      return;
    }
    setActionLoading("reset");
    try {
      await api.post(`${API_BASE}/users/${selectedUser.id}/reset-password`, {
        new_password: newPassword,
      });
      setToast({ type: "success", message: "비밀번호가 재설정되었습니다" });
      setShowReset(false);
      setNewPassword("");
      setResetError(null);
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ??
          "비밀번호 재설정에 실패했습니다",
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
      setToast({ type: "success", message: "사용자가 삭제되었습니다" });
      closeDetail();
      fetchUsers();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? "삭제에 실패했습니다",
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
    if (!form.username.trim()) errs.username = "사용자 이름을 입력하세요";
    if (!form.display_name.trim()) errs.display_name = "표시 이름을 입력하세요";
    if (!form.email.trim()) errs.email = "이메일을 입력하세요";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errs.email = "올바른 이메일 형식이 아닙니다";
    const pwErr = validatePassword(form.password);
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
          ? "사용자가 생성되었으나 그룹 할당에 실패했습니다"
          : "사용자가 생성되었습니다",
      });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      fetchUsers();
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ?? "사용자 생성에 실패했습니다",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Columns ──────────────────────────────────────
  const columns = [
    {
      key: "display_name",
      header: "이름",
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
      header: "부서",
      render: (u: ADUser) => (
        <span className="text-secondary">{u.department || "—"}</span>
      ),
    },
    {
      key: "title",
      header: "직함",
      render: (u: ADUser) => (
        <span className="text-secondary">{u.title || "—"}</span>
      ),
    },
    {
      key: "status",
      header: "상태",
      render: (u: ADUser) => <StatusBadge status={statusFor(u)} />,
    },
    {
      key: "ou",
      header: "OU",
      render: (u: ADUser) => (
        <span className="font-mono text-xs text-muted">{u.ou || "—"}</span>
      ),
    },
    {
      key: "last_logon",
      header: "최근 로그인",
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
          <h1 className="text-xl font-bold text-primary">사용자 관리</h1>
          <p className="mt-0.5 text-sm text-secondary">
            총 {total.toLocaleString()}명의 사용자
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
            placeholder="이름 또는 사용자 이름 검색"
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
            <option value="">모든 부서</option>
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
            <Download size={16} /> 내보내기
          </button>
          <button className="btn-primary" onClick={openCreate}>
            <UserPlus size={16} /> 사용자 추가
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
            재시도
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={visibleUsers}
          loading={loading}
          emptyMessage="사용자가 없습니다"
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
        title="사용자 상세"
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
            <DetailSection title="기본 정보">
              <InfoRow icon={Mail} label="이메일" value={selectedUser.email} />
              <InfoRow
                icon={Building2}
                label="부서"
                value={selectedUser.department}
              />
              <InfoRow icon={UserCog} label="직함" value={selectedUser.title} />
              <InfoRow
                icon={FolderTree}
                label="조직 단위"
                value={selectedUser.ou}
                mono
              />
              <InfoRow
                icon={Clock}
                label="생성일"
                value={formatDate(selectedUser.created_at)}
              />
              <InfoRow
                icon={Clock}
                label="최근 로그인"
                value={formatDate(selectedUser.last_logon)}
              />
            </DetailSection>

            {/* Groups */}
            <DetailSection
              title={`그룹 멤버십 (${selectedUser.member_of?.length ?? 0})`}
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
                <p className="p-4 text-xs text-muted">소속된 그룹이 없습니다</p>
              )}
            </DetailSection>

            {/* Management actions */}
            <DetailSection title="계정 관리">
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
                  {selectedUser.enabled ? "비활성화" : "활성화"}
                </button>

                <button
                  onClick={() => {
                    setShowReset((v) => !v);
                    setResetError(null);
                  }}
                  className="btn-outline w-full justify-center"
                >
                  <Key size={16} /> 비밀번호 재설정
                </button>

                {showReset && (
                  <div className="rounded-md border border-border-subtle bg-root/50 p-3">
                    <label className="label">새 비밀번호</label>
                    <input
                      type="password"
                      className="input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="새 비밀번호 입력"
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
                        취소
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
                        재설정
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger w-full justify-center"
                >
                  <Trash2 size={16} /> 사용자 삭제
                </button>

                {showDeleteConfirm && (
                  <div className="rounded-md border border-red/30 bg-red/5 p-3">
                    <div className="flex items-start gap-2 text-sm text-red">
                      <ShieldAlert
                        size={16}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <p>
                        정말{" "}
                        <strong>{selectedUser.display_name}</strong>{" "}
                        사용자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                      </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="btn-outline flex-1 justify-center"
                      >
                        취소
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
                        삭제 확인
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
        title="사용자 추가"
        width="lg"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="사용자 이름 *" error={formErrors.username}>
              <input
                className="input font-mono"
                value={form.username}
                onChange={(e) => setField("username", e.target.value)}
                placeholder="jdoe"
                autoComplete="off"
              />
            </Field>
            <Field label="표시 이름 *" error={formErrors.display_name}>
              <input
                className="input"
                value={form.display_name}
                onChange={(e) => setField("display_name", e.target.value)}
                placeholder="John Doe"
                autoComplete="off"
              />
            </Field>
          </div>

          <Field label="이메일 *" error={formErrors.email}>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="john.doe@example.com"
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="부서">
              <input
                className="input"
                value={form.department}
                onChange={(e) => setField("department", e.target.value)}
                placeholder="IT 부서"
                autoComplete="off"
              />
            </Field>
            <Field label="직함">
              <input
                className="input"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="엔지니어"
                autoComplete="off"
              />
            </Field>
          </div>

          <Field
            label="비밀번호 *"
            error={formErrors.password}
            hint="대문자, 소문자, 숫자, 특수문자 각각 1개 이상, 8자 이상"
          >
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>

          <Field
            label="조직 단위 (OU)"
            hint="예: OU=Staff,DC=corp,DC=example,DC=com"
          >
            <input
              className="input font-mono"
              value={form.ou}
              onChange={(e) => setField("ou", e.target.value)}
              placeholder="OU=Users,DC=corp,DC=example,DC=com"
              autoComplete="off"
            />
          </Field>

          <Field label="그룹" hint="쉼표로 구분하여 입력">
            <input
              className="input"
              value={form.groups}
              onChange={(e) => setField("groups", e.target.value)}
              placeholder="Domain Admins, IT Team"
              autoComplete="off"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-outline"
              onClick={() => setCreateOpen(false)}
            >
              취소
            </button>
            <button
              type="submit"
              className="btn-primary disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 생성 중...
                </>
              ) : (
                <>
                  <UserPlus size={16} /> 생성
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
