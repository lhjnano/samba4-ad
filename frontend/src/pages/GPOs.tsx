import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  FilePlus2,
  Trash2,
  ShieldAlert,
  Info,
  Link2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Network,
  FolderTree,
  RefreshCw,
  Monitor,
  User,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import type { GPO, Paginated } from "@/types/api";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Constants ──────────────────────────────────────
const PAGE_SIZE = 20;
const API_BASE = "/api/v1";

interface CreateForm {
  name: string;
  description: string;
}

const EMPTY_FORM: CreateForm = {
  name: "",
  description: "",
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

function gpoStatus(s: GPO["status"]): {
  status: "enabled" | "disabled";
  label: string;
} {
  switch (s) {
    case "enabled":
      return { status: "enabled", label: "활성" };
    case "all_settings_disabled":
      return { status: "disabled", label: "전체 비활성" };
    default:
      return { status: "disabled", label: "비활성" };
  }
}

// ── Page ───────────────────────────────────────────
export function GPOs() {
  // List state
  const [gpos, setGPOs] = useState<GPO[]>([]);
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
  const [selectedGPO, setSelectedGPO] = useState<GPO | null>(null);

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
  const fetchGPOs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<Paginated<GPO>>(`${API_BASE}/gpo`, {
        params,
      });
      setGPOs(data.items);
      setTotal(data.total);
      setTotalPages(data.pages || 1);
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          "GPO 목록을 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchGPOs();
  }, [fetchGPOs]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Detail ───────────────────────────────────────
  function openDetail(gpo: GPO) {
    setSelectedGPO(gpo);
    setDetailOpen(true);
    setShowDeleteConfirm(false);
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelectedGPO(null);
    setShowDeleteConfirm(false);
  }

  // ── Delete ───────────────────────────────────────
  async function handleDelete() {
    if (!selectedGPO) return;
    setActionLoading("delete");
    try {
      await api.delete(`${API_BASE}/gpo/${selectedGPO.id}`);
      setToast({ type: "success", message: "GPO가 삭제되었습니다" });
      closeDetail();
      fetchGPOs();
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
    if (!form.name.trim()) errs.name = "GPO 이름을 입력하세요";
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      };
      await api.post<GPO>(`${API_BASE}/gpo`, body);
      setToast({ type: "success", message: "GPO가 생성되었습니다" });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      fetchGPOs();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? "GPO 생성에 실패했습니다",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const visibleGPOs = useMemo(() => gpos, [gpos]);

  // ── Columns ──────────────────────────────────────
  const columns = [
    {
      key: "name",
      header: "이름",
      render: (g: GPO) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue/15 text-blue">
            <ShieldAlert size={14} />
          </span>
          <span className="font-medium text-primary">{g.name || "—"}</span>
        </div>
      ),
    },
    {
      key: "description",
      header: "설명",
      render: (g: GPO) => (
        <span
          className="block max-w-[280px] truncate text-secondary"
          title={g.description ?? undefined}
        >
          {g.description || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "상태",
      render: (g: GPO) => {
        const s = gpoStatus(g.status);
        return <StatusBadge status={s.status} label={s.label} />;
      },
    },
    {
      key: "links",
      header: "링크 수",
      render: (g: GPO) => (
        <span className="font-mono text-primary">
          {g.links?.length ?? 0}
        </span>
      ),
    },
    {
      key: "modified",
      header: "수정일",
      render: (g: GPO) => (
        <span className="text-muted">{formatDate(g.modified)}</span>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">그룹 정책 관리</h1>
          <p className="mt-0.5 text-sm text-secondary">
            총 {total.toLocaleString()}개의 그룹 정책 개체
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
            placeholder="GPO 이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-primary" onClick={openCreate}>
          <FilePlus2 size={16} /> GPO 추가
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchGPOs}
            className="ml-auto rounded px-2 py-1 text-xs hover:bg-red/10"
          >
            재시도
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        {!loading && !visibleGPOs.length ? (
          <EmptyState
            icon={ShieldAlert}
            title="GPO가 없습니다"
            description={
              debouncedSearch
                ? "검색 조건에 일치하는 그룹 정책 개체가 없습니다."
                : "등록된 그룹 정책 개체가 없습니다."
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={visibleGPOs}
            loading={loading}
            emptyMessage="GPO가 없습니다"
            onRowClick={openDetail}
          />
        )}
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
        title="그룹 정책 상세"
        width="lg"
      >
        {selectedGPO && (
          <div className="space-y-6">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-blue/15 text-blue">
                <ShieldAlert size={26} />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-primary">
                  {selectedGPO.name || "—"}
                </h3>
                <p
                  className="truncate font-mono text-sm text-muted"
                  title={selectedGPO.dn ?? undefined}
                >
                  {selectedGPO.dn || "—"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const s = gpoStatus(selectedGPO.status);
                    return <StatusBadge status={s.status} label={s.label} />;
                  })()}
                  <span className="badge bg-blue/10 text-blue">
                    링크 {selectedGPO.links?.length ?? 0}개
                  </span>
                </div>
              </div>
            </div>

            {/* Basic info */}
            <DetailSection title="기본 정보">
              <InfoRow
                icon={ShieldAlert}
                label="정책 이름"
                value={selectedGPO.name}
              />
              <InfoRow
                icon={Info}
                label="설명"
                value={selectedGPO.description}
              />
              <InfoRow
                icon={Network}
                label="고유 이름 (DN)"
                value={selectedGPO.dn}
                mono
              />
              <InfoRow
                icon={RefreshCw}
                label="생성일"
                value={formatDate(selectedGPO.created)}
              />
              <InfoRow
                icon={RefreshCw}
                label="수정일"
                value={formatDate(selectedGPO.modified)}
              />
            </DetailSection>

            {/* Version info */}
            <DetailSection title="버전 정보">
              <div className="grid grid-cols-2 divide-x divide-border-subtle">
                <div className="flex flex-col items-center gap-1 px-4 py-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue/15 text-blue">
                    <Monitor size={16} />
                  </span>
                  <span className="text-xs text-secondary">컴퓨터 구성</span>
                  <span className="font-mono text-lg font-semibold text-primary">
                    {selectedGPO.computer_version ?? 0}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1 px-4 py-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-purple/15 text-purple">
                    <User size={16} />
                  </span>
                  <span className="text-xs text-secondary">사용자 구성</span>
                  <span className="font-mono text-lg font-semibold text-primary">
                    {selectedGPO.user_version ?? 0}
                  </span>
                </div>
              </div>
            </DetailSection>

            {/* Linked OUs */}
            <DetailSection
              title={`연결된 OU (${selectedGPO.links?.length ?? 0})`}
            >
              {selectedGPO.links?.length ? (
                <div className="max-h-64 overflow-y-auto">
                  {selectedGPO.links.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 last:border-0"
                    >
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-hover text-muted">
                        <FolderTree size={12} />
                      </span>
                      <span
                        className="truncate font-mono text-xs text-secondary"
                        title={l}
                      >
                        {l}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-2">
                  <EmptyState
                    icon={Link2}
                    title="연결된 OU가 없습니다"
                    description="이 그룹 정책이 연결된 조직 단위가 없습니다."
                  />
                </div>
              )}
            </DetailSection>

            {/* Danger zone */}
            <DetailSection title="정책 관리">
              <div className="space-y-2 p-4">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger w-full justify-center"
                >
                  <Trash2 size={16} /> GPO 삭제
                </button>

                {showDeleteConfirm && (
                  <div className="rounded-md border border-red/30 bg-red/5 p-3">
                    <div className="flex items-start gap-2 text-sm text-red">
                      <ShieldAlert
                        size={16}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <p>
                        정말 <strong>{selectedGPO.name}</strong> 그룹 정책
                        개체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
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
        title="그룹 정책 추가"
        width="lg"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <Field label="GPO 이름 *" error={formErrors.name}>
            <input
              className="input font-mono"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Default Domain Policy"
              autoComplete="off"
            />
          </Field>

          <Field label="설명">
            <input
              className="input"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="도메인 기본 정책"
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
                  <FilePlus2 size={16} /> 생성
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
