import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  FolderTree,
  ShieldAlert,
  Clock,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Info,
  Layers,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import type { ADGroup, Paginated } from "@/types/api";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

// Detail endpoint may include a member list beyond the list shape.
type GroupDetail = ADGroup & { members?: string[] };

// ── Constants ──────────────────────────────────────
const PAGE_SIZE = 20;
const API_BASE = "/api/v1";

const GROUP_TYPES = ["Security", "Distribution"] as const;
const SCOPES = ["Domain Local", "Global", "Universal"] as const;

interface CreateForm {
  name: string;
  description: string;
  group_type: string;
  scope: string;
  ou: string;
}

const EMPTY_FORM: CreateForm = {
  name: "",
  description: "",
  group_type: "Security",
  scope: "Global",
  ou: "",
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

function normalize(v: string): string {
  return (v ?? "").toLowerCase().replace(/[\s_]+/g, "");
}

function groupTypeLabel(t: string): string {
  const k = normalize(t);
  if (k.includes("secur")) return "보안";
  if (k.includes("distrib")) return "배포";
  return t || "—";
}

function scopeLabel(s: string): string {
  const k = normalize(s);
  if (k.includes("domainlocal")) return "도메인 로컬";
  if (k.includes("global")) return "글로벌";
  if (k.includes("universal")) return "유니버설";
  return s || "—";
}

// ── Page ───────────────────────────────────────────
export function Groups() {
  // List state
  const [groups, setGroups] = useState<ADGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Detail actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<Paginated<ADGroup>>(`${API_BASE}/groups`, {
        params,
      });
      setGroups(data.items);
      setTotal(data.total);
      setTotalPages(data.pages || 1);
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          "그룹 목록을 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Detail ───────────────────────────────────────
  async function openDetail(group: ADGroup) {
    setSelectedGroup(group);
    setDetailOpen(true);
    setDetailError(null);
    setShowDeleteConfirm(false);
    setDetailLoading(true);
    try {
      const { data } = await api.get<GroupDetail>(
        `${API_BASE}/groups/${group.id}`,
      );
      setSelectedGroup(data);
    } catch (err) {
      setDetailError(
        (err as { message?: string })?.message ??
          "그룹 정보를 불러오지 못했습니다",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelectedGroup(null);
    setDetailError(null);
    setShowDeleteConfirm(false);
  }

  // ── Delete ───────────────────────────────────────
  async function handleDelete() {
    if (!selectedGroup) return;
    setActionLoading("delete");
    try {
      await api.delete(`${API_BASE}/groups/${selectedGroup.id}`);
      setToast({ type: "success", message: "그룹이 삭제되었습니다" });
      closeDetail();
      fetchGroups();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? "삭제에 실패했습니다",
      });
    } finally {
      setActionLoading(null);
    }
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
    if (!form.name.trim()) errs.name = "그룹 이름을 입력하세요";
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        group_type: form.group_type,
        scope: form.scope,
        ou: form.ou.trim() || undefined,
      };
      await api.post<ADGroup>(`${API_BASE}/groups`, body);
      setToast({ type: "success", message: "그룹이 생성되었습니다" });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      fetchGroups();
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ?? "그룹 생성에 실패했습니다",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const visibleGroups = useMemo(() => groups, [groups]);

  // ── Columns ──────────────────────────────────────
  const columns = [
    {
      key: "name",
      header: "그룹명",
      render: (g: ADGroup) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue/15 text-blue">
            <Users size={14} />
          </span>
          <span className="font-medium text-primary">{g.name || "—"}</span>
        </div>
      ),
    },
    {
      key: "description",
      header: "설명",
      render: (g: ADGroup) => (
        <span
          className="block max-w-[260px] truncate text-secondary"
          title={g.description ?? undefined}
        >
          {g.description || "—"}
        </span>
      ),
    },
    {
      key: "group_type",
      header: "유형",
      render: (g: ADGroup) => (
        <span
          className={clsx(
            "badge",
            normalize(g.group_type).includes("secur")
              ? "bg-blue/10 text-blue"
              : "bg-purple/10 text-purple",
          )}
        >
          {groupTypeLabel(g.group_type)}
        </span>
      ),
    },
    {
      key: "scope",
      header: "범위",
      render: (g: ADGroup) => (
        <span className="badge bg-muted/15 text-secondary">
          {scopeLabel(g.scope)}
        </span>
      ),
    },
    {
      key: "member_count",
      header: "구성원 수",
      render: (g: ADGroup) => (
        <span className="font-mono text-primary">
          {g.member_count?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      key: "ou",
      header: "OU",
      render: (g: ADGroup) => (
        <span className="font-mono text-xs text-muted">{g.ou || "—"}</span>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">그룹 관리</h1>
          <p className="mt-0.5 text-sm text-secondary">
            총 {total.toLocaleString()}개의 그룹
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
            placeholder="그룹 이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-primary" onClick={openCreate}>
          <UserPlus size={16} /> 그룹 추가
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchGroups}
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
          data={visibleGroups}
          loading={loading}
          emptyMessage="그룹이 없습니다"
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
        title="그룹 상세"
        width="lg"
      >
        {detailLoading && !selectedGroup && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-secondary" />
          </div>
        )}

        {detailError && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
            <AlertCircle size={16} /> {detailError}
          </div>
        )}

        {selectedGroup && (
          <div className="space-y-6">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-blue/15 text-lg font-semibold text-blue">
                {selectedGroup.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-primary">
                  {selectedGroup.name || "—"}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={clsx(
                      "badge",
                      normalize(selectedGroup.group_type).includes("secur")
                        ? "bg-blue/10 text-blue"
                        : "bg-purple/10 text-purple",
                    )}
                  >
                    {groupTypeLabel(selectedGroup.group_type)}
                  </span>
                  <span className="badge bg-muted/15 text-secondary">
                    {scopeLabel(selectedGroup.scope)}
                  </span>
                  <span className="badge bg-green/10 text-green">
                    구성원 {selectedGroup.member_count?.toLocaleString() ?? 0}명
                  </span>
                </div>
              </div>
            </div>

            {/* Basic info */}
            <DetailSection title="기본 정보">
              <InfoRow
                icon={Layers}
                label="그룹 이름"
                value={selectedGroup.name}
                mono
              />
              <InfoRow
                icon={Info}
                label="설명"
                value={selectedGroup.description}
              />
              <InfoRow
                icon={ShieldAlert}
                label="유형"
                value={groupTypeLabel(selectedGroup.group_type)}
              />
              <InfoRow
                icon={Layers}
                label="범위"
                value={scopeLabel(selectedGroup.scope)}
              />
              <InfoRow
                icon={FolderTree}
                label="조직 단위"
                value={selectedGroup.ou}
                mono
              />
              <InfoRow
                icon={Clock}
                label="생성일"
                value={formatDate(selectedGroup.created_at)}
              />
            </DetailSection>

            {/* Members */}
            <DetailSection
              title={`구성원 (${
                selectedGroup.members?.length ?? selectedGroup.member_count ?? 0
              })`}
            >
              {selectedGroup.members?.length ? (
                <div className="max-h-64 overflow-y-auto">
                  {selectedGroup.members.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 last:border-0"
                    >
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-hover text-muted">
                        <Users size={12} />
                      </span>
                      <span
                        className="truncate font-mono text-xs text-secondary"
                        title={m}
                      >
                        {m}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-2">
                  <EmptyState
                    icon={Users}
                    title="구성원이 없습니다"
                    description="이 그룹에 속한 계정이 없습니다."
                  />
                </div>
              )}
            </DetailSection>

            {/* Danger zone */}
            <DetailSection title="그룹 관리">
              <div className="space-y-2 p-4">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger w-full justify-center"
                >
                  <Trash2 size={16} /> 그룹 삭제
                </button>

                {showDeleteConfirm && (
                  <div className="rounded-md border border-red/30 bg-red/5 p-3">
                    <div className="flex items-start gap-2 text-sm text-red">
                      <ShieldAlert
                        size={16}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <p>
                        정말 <strong>{selectedGroup.name}</strong>{" "}
                        그룹을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
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
        title="그룹 추가"
        width="lg"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <Field label="그룹 이름 *" error={formErrors.name}>
            <input
              className="input font-mono"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Domain Admins"
              autoComplete="off"
            />
          </Field>

          <Field label="설명">
            <input
              className="input"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="도메인 관리자 그룹"
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="유형">
              <SelectInput
                value={form.group_type}
                onChange={(v) => setField("group_type", v)}
              >
                {GROUP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {groupTypeLabel(t)} ({t})
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="범위">
              <SelectInput
                value={form.scope}
                onChange={(v) => setField("scope", v)}
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {scopeLabel(s)} ({s})
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <Field
            label="조직 단위 (OU)"
            hint="예: OU=Groups,DC=corp,DC=example,DC=com"
          >
            <input
              className="input font-mono"
              value={form.ou}
              onChange={(e) => setField("ou", e.target.value)}
              placeholder="OU=Groups,DC=corp,DC=example,DC=com"
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

function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        className="input cursor-pointer appearance-none pr-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
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
