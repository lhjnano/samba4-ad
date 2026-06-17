import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

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
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
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
      const { data } = await api.get<Paginated<ADOU>>(`${API_BASE}/ou`, {
        params,
      });
      setOUs(data.items);
      setTotal(data.total);
      setTotalPages(data.pages || 1);
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          t("ous:error_load_list"),
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, t]);

  useEffect(() => {
    fetchOUs();
  }, [fetchOUs]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
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
      await api.delete(`${API_BASE}/ou/${selectedOU.id}`);
      setToast({ type: "success", message: t("ous:toast_ou_deleted") });
      closeDetail();
      fetchOUs();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? t("ous:toast_delete_failed"),
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
    if (!form.name.trim()) errs.name = t("ous:validation_name_required");
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        parent_dn: form.parent_dn.trim() || undefined,
      };
      await api.post<ADOU>(`${API_BASE}/ou`, body);
      setToast({ type: "success", message: t("ous:toast_ou_created") });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      fetchOUs();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? t("ous:toast_ou_create_failed"),
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
      header: t("ous:th_name"),
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
      header: t("ous:th_description"),
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
      header: t("ous:th_child_ous"),
      render: (o: ADOU) => (
        <span className="font-mono text-primary">
          {o.child_ous?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      key: "user_count",
      header: t("ous:th_user_count"),
      render: (o: ADOU) => (
        <span className="font-mono text-primary">
          {o.user_count?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      key: "computer_count",
      header: t("ous:th_computer_count"),
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
          <h1 className="text-xl font-bold text-primary">{t("ous:title")}</h1>
          <p className="mt-0.5 text-sm text-secondary">
            {t("ous:subtitle_count", { count: total.toLocaleString() })}
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
            placeholder={t("ous:ph_search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-primary" onClick={openCreate}>
          <FolderPlus size={16} /> {t("ous:btn_add_ou")}
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
            {t("ous:btn_retry")}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        {!loading && !visibleOUs.length ? (
          <EmptyState
            icon={FolderTree}
            title={t("ous:empty_no_ous_title")}
            description={
              debouncedSearch
                ? t("ous:empty_no_ous_filtered")
                : t("ous:empty_no_ous_registered")
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={visibleOUs}
            loading={loading}
            emptyMessage={t("ous:empty_no_ous")}
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
        title={t("ous:drawer_title_detail")}
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
                    {t("ous:badge_child_ous", { count: selectedOU.child_ous ?? 0 })}
                  </span>
                  <span className="badge bg-green/10 text-green">
                    {t("ous:badge_users", { count: selectedOU.user_count ?? 0 })}
                  </span>
                  <span className="badge bg-purple/10 text-purple">
                    {t("ous:badge_computers", { count: selectedOU.computer_count ?? 0 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Basic info */}
            <DetailSection title={t("ous:section_basic_info")}>
              <InfoRow
                icon={FolderTree}
                label={t("ous:label_name")}
                value={selectedOU.name}
              />
              <InfoRow
                icon={Info}
                label={t("ous:label_description")}
                value={selectedOU.description}
              />
              <InfoRow
                icon={Network}
                label={t("ous:label_dn")}
                value={selectedOU.dn}
                mono
              />
            </DetailSection>

            {/* GPO Links */}
            <DetailSection
              title={t("ous:section_gpo_links", { count: selectedOU.gpo_links?.length ?? 0 })}
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
                    title={t("ous:empty_no_gpo_links_title")}
                    description={t("ous:empty_no_gpo_links_desc")}
                  />
                </div>
              )}
            </DetailSection>

            {/* Danger zone */}
            <DetailSection title={t("ous:section_ou_management")}>
              <div className="space-y-2 p-4">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger w-full justify-center"
                >
                  <Trash2 size={16} /> {t("ous:btn_delete_ou")}
                </button>

                {showDeleteConfirm && (
                  <div className="rounded-md border border-red/30 bg-red/5 p-3">
                    <div className="flex items-start gap-2 text-sm text-red">
                      <ShieldAlert
                        size={16}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <p>
                        {t("ous:confirm_delete_ou", { name: selectedOU.name })}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="btn-outline flex-1 justify-center"
                      >
                        {t("ous:btn_cancel")}
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
                        {t("ous:btn_delete_confirm")}
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
        title={t("ous:drawer_title_create")}
        width="lg"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <Field label={t("ous:label_name_required")} error={formErrors.name}>
            <input
              className="input font-mono"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder={t("ous:ph_name")}
              autoComplete="off"
            />
          </Field>

          <Field label={t("ous:label_description_form")}>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder={t("ous:ph_description")}
              autoComplete="off"
            />
          </Field>

          <Field
            label={t("ous:label_parent_dn")}
            hint={t("ous:hint_parent_dn")}
          >
            <input
              className="input font-mono"
              value={form.parent_dn}
              onChange={(e) => setField("parent_dn", e.target.value)}
              placeholder={t("ous:ph_parent_dn")}
              autoComplete="off"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-outline"
              onClick={() => setCreateOpen(false)}
            >
              {t("ous:btn_cancel")}
            </button>
            <button
              type="submit"
              className="btn-primary disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> {t("ous:btn_creating")}
                </>
              ) : (
                <>
                  <FolderPlus size={16} /> {t("ous:btn_create")}
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
