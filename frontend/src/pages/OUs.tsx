import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  FolderPlus,
  Trash2,
  FolderTree,
  ShieldAlert,
  Info,
  Link2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Network,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import type { ADOU, Paginated } from "@/types/api";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Constants ──────────────────────────────────────
const PAGE_SIZE = 50;
const API_BASE = "/api/v1";

interface CreateForm {
  name: string;
  description: string;
  parent_dn: string;
}

const EMPTY_FORM: CreateForm = {
  name: "",
  description: "",
  parent_dn: "",
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

// ── Page ───────────────────────────────────────────
export function OUs() {
  // List state
  const [ous, setOUs] = useState<ADOU[]>([]);
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
  const [selectedOU, setSelectedOU] = useState<ADOU | null>(null);

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
  const fetchOUs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<Paginated<ADOU>>(`${API_BASE}/ous`, {
        params,
      });
      setOUs(data.items);
      setTotal(data.total);
      setTotalPages(data.pages || 1);
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          "OU 목록을 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchOUs();
  }, [fetchOUs]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Detail ───────────────────────────────────────
  function openDetail(ou: ADOU) {
    setSelectedOU(ou);
    setDetailOpen(true);
    setShowDeleteConfirm(false);
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelectedOU(null);
    setShowDeleteConfirm(false);
  }

  // ── Delete ───────────────────────────────────────
  async function handleDelete() {
    if (!selectedOU) return;
    setActionLoading("delete");
    try {
      await api.delete(`${API_BASE}/ous/${selectedOU.id}`);
      setToast({ type: "success", message: "OU가 삭제되었습니다" });
      closeDetail();
      fetchOUs();
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
    if (!form.name.trim()) errs.name = "OU 이름을 입력하세요";
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        parent_dn: form.parent_dn.trim() || undefined,
      };
      await api.post<ADOU>(`${API_BASE}/ous`, body);
      setToast({ type: "success", message: "OU가 생성되었습니다" });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      fetchOUs();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? "OU 생성에 실패했습니다",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const visibleOUs = useMemo(() => ous, [ous]);

  // ── Columns ──────────────────────────────────────
  const columns = [
    {
      key: "name",
      header: "이름",
      render: (o: ADOU) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue/15 text-blue">
            <FolderTree size={14} />
          </span>
          <span className="font-medium text-primary">{o.name || "—"}</span>
        </div>
      ),
    },
    {
      key: "description",
      header: "설명",
      render: (o: ADOU) => (
        <span
          className="block max-w-[280px] truncate text-secondary"
          title={o.description ?? undefined}
        >
          {o.description || "—"}
        </span>
      ),
    },
    {
      key: "child_ous",
      header: "하위 OU",
      render: (o: ADOU) => (
        <span className="font-mono text-primary">
          {o.child_ous?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      key: "user_count",
      header: "사용자 수",
      render: (o: ADOU) => (
        <span className="font-mono text-primary">
          {o.user_count?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      key: "computer_count",
      header: "컴퓨터 수",
      render: (o: ADOU) => (
        <span className="font-mono text-primary">
          {o.computer_count?.toLocaleString() ?? 0}
        </span>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">조직 단위 관리</h1>
          <p className="mt-0.5 text-sm text-secondary">
            총 {total.toLocaleString()}개의 조직 단위
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
            placeholder="OU 이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-primary" onClick={openCreate}>
          <FolderPlus size={16} /> OU 추가
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchOUs}
            className="ml-auto rounded px-2 py-1 text-xs hover:bg-red/10"
          >
            재시도
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        {!loading && !visibleOUs.length ? (
          <EmptyState
            icon={FolderTree}
            title="OU가 없습니다"
            description={
              debouncedSearch
                ? "검색 조건에 일치하는 조직 단위가 없습니다."
                : "등록된 조직 단위가 없습니다."
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={visibleOUs}
            loading={loading}
            emptyMessage="OU가 없습니다"
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
        title="조직 단위 상세"
        width="lg"
      >
        {selectedOU && (
          <div className="space-y-6">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-blue/15 text-lg font-semibold text-blue">
                <FolderTree size={26} />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-primary">
                  {selectedOU.name || "—"}
                </h3>
                <p
                  className="truncate font-mono text-sm text-muted"
                  title={selectedOU.dn ?? undefined}
                >
                  {selectedOU.dn || "—"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="badge bg-blue/10 text-blue">
                    하위 OU {selectedOU.child_ous?.toLocaleString() ?? 0}개
                  </span>
                  <span className="badge bg-green/10 text-green">
                    사용자 {selectedOU.user_count?.toLocaleString() ?? 0}명
                  </span>
                  <span className="badge bg-purple/10 text-purple">
                    컴퓨터 {selectedOU.computer_count?.toLocaleString() ?? 0}대
                  </span>
                </div>
              </div>
            </div>

            {/* Basic info */}
            <DetailSection title="기본 정보">
              <InfoRow
                icon={FolderTree}
                label="이름"
                value={selectedOU.name}
              />
              <InfoRow
                icon={Info}
                label="설명"
                value={selectedOU.description}
              />
              <InfoRow
                icon={Network}
                label="고유 이름 (DN)"
                value={selectedOU.dn}
                mono
              />
            </DetailSection>

            {/* GPO Links */}
            <DetailSection
              title={`연결된 GPO (${selectedOU.gpo_links?.length ?? 0})`}
            >
              {selectedOU.gpo_links?.length ? (
                <div className="flex flex-wrap gap-1.5 p-4">
                  {selectedOU.gpo_links.map((g) => (
                    <span
                      key={g}
                      className="badge bg-blue/10 text-blue"
                      title={g}
                    >
                      <Link2 size={11} /> {g}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="p-2">
                  <EmptyState
                    icon={Link2}
                    title="연결된 GPO가 없습니다"
                    description="이 조직 단위에 연결된 그룹 정책 개체가 없습니다."
                  />
                </div>
              )}
            </DetailSection>

            {/* Danger zone */}
            <DetailSection title="OU 관리">
              <div className="space-y-2 p-4">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger w-full justify-center"
                >
                  <Trash2 size={16} /> OU 삭제
                </button>

                {showDeleteConfirm && (
                  <div className="rounded-md border border-red/30 bg-red/5 p-3">
                    <div className="flex items-start gap-2 text-sm text-red">
                      <ShieldAlert
                        size={16}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <p>
                        정말 <strong>{selectedOU.name}</strong> 조직 단위를
                        삭제하시겠습니까? 하위 개체에 영향을 줄 수 있으며 이
                        작업은 되돌릴 수 없습니다.
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
        title="조직 단위 추가"
        width="lg"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <Field label="OU 이름 *" error={formErrors.name}>
            <input
              className="input font-mono"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Staff"
              autoComplete="off"
            />
          </Field>

          <Field label="설명">
            <input
              className="input"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="직원 조직 단위"
              autoComplete="off"
            />
          </Field>

          <Field
            label="상위 조직 단위 (DN)"
            hint="비워두면 도메인 루트에 생성됩니다. 예: DC=corp,DC=example,DC=com"
          >
            <input
              className="input font-mono"
              value={form.parent_dn}
              onChange={(e) => setField("parent_dn", e.target.value)}
              placeholder="OU=Departments,DC=corp,DC=example,DC=com"
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
                  <FolderPlus size={16} /> 생성
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
