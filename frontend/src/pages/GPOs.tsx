import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import type { GPO, GPODetail, Paginated } from "@/types/api";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Constants ──────────────────────────────────────
const PAGE_SIZE = 20;
const API_BASE = "/api/v1";

interface CreateForm {
  display_name: string;
  description: string;
}

const EMPTY_FORM: CreateForm = {
  display_name: "",
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

// ── Page ───────────────────────────────────────────
export function GPOs() {
  const { t } = useTranslation();

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
  const [selectedGPO, setSelectedGPO] = useState<GPODetail | null>(null);

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

  // ── GPO status (i18n) ────────────────────────────
  function gpoStatus(s: GPO["status"]): {
    status: "enabled" | "disabled";
    label: string;
  } {
    switch (s) {
      case "enabled":
        return { status: "enabled", label: t("gpos:status_enabled") };
      case "all_settings_disabled":
        return { status: "disabled", label: t("gpos:status_all_disabled") };
      default:
        return { status: "disabled", label: t("gpos:status_disabled") };
    }
  }

  // ── Debounced search ─────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
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
          t("gpos:error_load_list"),
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, t]);

  useEffect(() => {
    fetchGPOs();
  }, [fetchGPOs]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Detail ───────────────────────────────────────
  async function openDetail(gpo: GPO) {
    setDetailOpen(true);
    setShowDeleteConfirm(false);
    setSelectedGPO(null);
    try {
      const { data } = await api.get<GPODetail>(`${API_BASE}/gpo/${gpo.id}`);
      setSelectedGPO(data);
    } catch {
      // Fallback: convert summary to minimal detail
      setSelectedGPO({
        ...gpo,
        guid: gpo.id,
        dn: "",
        when_created: null,
        when_changed: null,
        version_user: 0,
        version_computer: 0,
        wmi_filter: null,
        linked_ous: [],
      });
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelectedGPO(null);
    setShowDeleteConfirm(false);
  }

  // ── Toggle status ────────────────────────────────
  async function handleToggleStatus() {
    if (!selectedGPO) return;
    setActionLoading("toggle");
    try {
      const newStatus = selectedGPO.status === "enabled" ? "disabled" : "enabled";
      await api.patch(`${API_BASE}/gpo/${selectedGPO.id}/status`, null, {
        params: { status: newStatus },
      });
      // Refresh detail
      const { data } = await api.get<GPODetail>(`${API_BASE}/gpo/${selectedGPO.id}`);
      setSelectedGPO(data);
      setToast({ type: "success", message: t("gpos:toast_status_updated") });
      fetchGPOs();
    } catch {
      setToast({ type: "error", message: t("gpos:toast_status_update_failed") });
    } finally {
      setActionLoading(null);
    }
  }

  // ── Delete ───────────────────────────────────────
  async function handleDelete() {
    if (!selectedGPO) return;
    setActionLoading("delete");
    try {
      await api.delete(`${API_BASE}/gpo/${selectedGPO.id}`);
      setToast({ type: "success", message: t("gpos:toast_gpo_deleted") });
      closeDetail();
      fetchGPOs();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? t("gpos:toast_delete_failed"),
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
    if (!form.display_name.trim()) errs.display_name = t("gpos:validation_name_required");
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const body = {
        display_name: form.display_name.trim(),
        description: form.description.trim() || undefined,
      };
      await api.post<GPO>(`${API_BASE}/gpo`, body);
      setToast({ type: "success", message: t("gpos:toast_gpo_created") });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      fetchGPOs();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? t("gpos:toast_gpo_create_failed"),
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
      header: t("gpos:th_name"),
      render: (g: GPO) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue/15 text-blue">
            <ShieldAlert size={14} />
          </span>
          <span className="font-medium text-primary">{g.display_name || "—"}</span>
        </div>
      ),
    },
    {
      key: "description",
      header: t("gpos:th_description"),
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
      header: t("gpos:th_status"),
      render: (g: GPO) => {
        const s = gpoStatus(g.status);
        return <StatusBadge status={s.status} label={s.label} />;
      },
    },
    {
      key: "links",
      header: t("gpos:th_links"),
      render: (g: GPO) => (
        <span className="font-mono text-primary">
          {g.link_count ?? 0}
        </span>
      ),
    },
    {
      key: "modified",
      header: t("gpos:th_modified"),
      render: (g: GPO) => (
        <span className="text-muted">{g.status}</span>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">{t("gpos:title")}</h1>
          <p className="mt-0.5 text-sm text-secondary">
            {t("gpos:subtitle_count", { count: total.toLocaleString() })}
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
            placeholder={t("gpos:ph_search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-primary" onClick={openCreate}>
          <FilePlus2 size={16} /> {t("gpos:btn_add_gpo")}
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
            {t("gpos:btn_retry")}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        {!loading && !visibleGPOs.length ? (
          <EmptyState
            icon={ShieldAlert}
            title={t("gpos:empty_no_gpos_title")}
            description={
              debouncedSearch
                ? t("gpos:empty_no_gpos_filtered")
                : t("gpos:empty_no_gpos_registered")
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={visibleGPOs}
            loading={loading}
            emptyMessage={t("gpos:empty_no_gpos")}
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
        title={t("gpos:drawer_title_detail")}
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
                  {selectedGPO.display_name || "—"}
                </h3>
                <p
                  className="truncate font-mono text-sm text-muted"
                  title={selectedGPO.guid ?? undefined}
                >
                  {selectedGPO.guid || "—"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const s = gpoStatus(selectedGPO.status);
                    return <StatusBadge status={s.status} label={s.label} />;
                  })()}
                  <span className="badge bg-blue/10 text-blue">
                    {t("gpos:badge_links_count", { count: selectedGPO.linked_ous?.length ?? 0 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Basic info */}
            <DetailSection title={t("gpos:section_basic_info")}>
              <InfoRow
                icon={ShieldAlert}
                label={t("gpos:label_policy_name")}
                value={selectedGPO.display_name}
              />
              <InfoRow
                icon={Info}
                label={t("gpos:label_description")}
                value={selectedGPO.description}
              />
              <InfoRow
                icon={Network}
                label={t("gpos:label_dn")}
                value={selectedGPO.guid}
                mono
              />
              <InfoRow
                icon={RefreshCw}
                label={t("gpos:label_created")}
                value={formatDate(selectedGPO.when_created)}
              />
              <InfoRow
                icon={RefreshCw}
                label={t("gpos:label_modified")}
                value={formatDate(selectedGPO.when_changed)}
              />
            </DetailSection>

            {/* Version info */}
            <DetailSection title={t("gpos:section_version_info")}>
              <div className="grid grid-cols-2 divide-x divide-border-subtle">
                <div className="flex flex-col items-center gap-1 px-4 py-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue/15 text-blue">
                    <Monitor size={16} />
                  </span>
                  <span className="text-xs text-secondary">{t("gpos:label_computer_config")}</span>
                  <span className="font-mono text-lg font-semibold text-primary">
                    {selectedGPO.version_computer ?? 0}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1 px-4 py-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-purple/15 text-purple">
                    <User size={16} />
                  </span>
                  <span className="text-xs text-secondary">{t("gpos:label_user_config")}</span>
                  <span className="font-mono text-lg font-semibold text-primary">
                    {selectedGPO.version_user ?? 0}
                  </span>
                </div>
              </div>
            </DetailSection>

            {/* Linked OUs */}
            <DetailSection
              title={t("gpos:section_linked_ous", { count: selectedGPO.linked_ous?.length ?? 0 })}
            >
              {selectedGPO.linked_ous?.length ? (
                <div className="max-h-64 overflow-y-auto">
                  {selectedGPO.linked_ous.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 last:border-0"
                    >
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-hover text-muted">
                        <FolderTree size={12} />
                      </span>
                      <span
                        className="truncate font-mono text-xs text-secondary"
                        title={l.ou_dn}
                      >
                        {l.ou_dn}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-2">
                  <EmptyState
                    icon={Link2}
                    title={t("gpos:empty_no_linked_ous_title")}
                    description={t("gpos:empty_no_linked_ous_desc")}
                  />
                </div>
              )}
            </DetailSection>

            {/* Danger zone */}
            <DetailSection title={t("gpos:section_policy_management")}>
              <div className="space-y-2 p-4">
                <button
                  onClick={handleToggleStatus}
                  disabled={actionLoading === "toggle"}
                  className="btn-outline w-full justify-center disabled:opacity-50"
                >
                  {actionLoading === "toggle" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : null}
                  {selectedGPO.status === "enabled"
                    ? t("gpos:btn_disable")
                    : t("gpos:btn_enable")}
                </button>

                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger w-full justify-center"
                >
                  <Trash2 size={16} /> {t("gpos:btn_delete_gpo")}
                </button>

                {showDeleteConfirm && (
                  <div className="rounded-md border border-red/30 bg-red/5 p-3">
                    <div className="flex items-start gap-2 text-sm text-red">
                      <ShieldAlert
                        size={16}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <p>
                        {t("gpos:confirm_delete_gpo", { name: selectedGPO.display_name })}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="btn-outline flex-1 justify-center"
                      >
                        {t("gpos:btn_cancel")}
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
                        {t("gpos:btn_delete_confirm")}
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
        title={t("gpos:drawer_title_create")}
        width="lg"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <Field label={t("gpos:label_name_required")} error={formErrors.display_name}>
            <input
              className="input font-mono"
              value={form.display_name}
              onChange={(e) => setField("display_name", e.target.value)}
              placeholder={t("gpos:ph_name")}
              autoComplete="off"
            />
          </Field>

          <Field label={t("gpos:label_description_form")}>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder={t("gpos:ph_description")}
              autoComplete="off"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-outline"
              onClick={() => setCreateOpen(false)}
            >
              {t("gpos:btn_cancel")}
            </button>
            <button
              type="submit"
              className="btn-primary disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> {t("gpos:btn_creating")}
                </>
              ) : (
                <>
                  <FilePlus2 size={16} /> {t("gpos:btn_create")}
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
