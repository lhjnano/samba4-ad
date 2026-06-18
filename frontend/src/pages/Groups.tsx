import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  category: string;
  scope: string;
  ou: string;
}

const EMPTY_FORM: CreateForm = {
  name: "",
  description: "",
  category: "Security",
  scope: "Global",
  ou: "",
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

function normalize(v: string): string {
  return (v ?? "").toLowerCase().replace(/[\s_]+/g, "");
}

function groupTypeLabel(type: string, t: TFunc): string {
  const k = normalize(type);
  if (k.includes("secur")) return t("groups:group_type_security");
  if (k.includes("distrib")) return t("groups:group_type_distribution");
  return type || "—";
}

function scopeLabel(scope: string, t: TFunc): string {
  const k = normalize(scope);
  if (k.includes("domainlocal")) return t("groups:scope_domain_local");
  if (k.includes("global")) return t("groups:scope_global");
  if (k.includes("universal")) return t("groups:scope_universal");
  return scope || "—";
}

// ── Page ───────────────────────────────────────────
export function Groups() {
  const { t } = useTranslation();

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
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
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
          t("groups:error_load_list"),
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, t]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
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
          t("groups:error_load_detail"),
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
      setToast({ type: "success", message: t("groups:toast_group_deleted") });
      closeDetail();
      fetchGroups();
    } catch (err) {
      setToast({
        type: "error",
        message: (err as { message?: string })?.message ?? t("groups:toast_delete_failed"),
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
    if (!form.name.trim()) errs.name = t("groups:validation_name_required");
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        scope: form.scope,
        ou: form.ou.trim() || undefined,
      };
      await api.post<ADGroup>(`${API_BASE}/groups`, body);
      setToast({ type: "success", message: t("groups:toast_group_created") });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      fetchGroups();
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ?? t("groups:toast_group_create_failed"),
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
      header: t("groups:th_group_name"),
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
      header: t("groups:th_description"),
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
      key: "category",
      header: t("groups:th_type"),
      render: (g: ADGroup) => (
        <span
          className={clsx(
            "badge",
            normalize(g.category).includes("secur")
              ? "bg-blue/10 text-blue"
              : "bg-purple/10 text-purple",
          )}
        >
          {groupTypeLabel(g.category, t)}
        </span>
      ),
    },
    {
      key: "scope",
      header: t("groups:th_scope"),
      render: (g: ADGroup) => (
        <span className="badge bg-muted/15 text-secondary">
          {scopeLabel(g.scope, t)}
        </span>
      ),
    },
    {
      key: "member_count",
      header: t("groups:th_member_count"),
      render: (g: ADGroup) => (
        <span className="font-mono text-primary">
          {g.member_count?.toLocaleString() ?? 0}
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
          <h1 className="text-xl font-bold text-primary">{t("groups:title")}</h1>
          <p className="mt-0.5 text-sm text-secondary">
            {t("groups:subtitle_count", { count: total.toLocaleString() })}
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
            placeholder={t("groups:ph_search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-primary" onClick={openCreate}>
          <UserPlus size={16} /> {t("groups:btn_add_group")}
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
            {t("groups:btn_retry")}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <DataTable
          columns={columns}
          data={visibleGroups}
          loading={loading}
          emptyMessage={t("groups:empty_no_groups")}
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
        title={t("groups:drawer_title_detail")}
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
                      normalize(selectedGroup.category).includes("secur")
                        ? "bg-blue/10 text-blue"
                        : "bg-purple/10 text-purple",
                    )}
                  >
                    {groupTypeLabel(selectedGroup.category, t)}
                  </span>
                  <span className="badge bg-muted/15 text-secondary">
                    {scopeLabel(selectedGroup.scope, t)}
                  </span>
                  <span className="badge bg-green/10 text-green">
                    {t("groups:badge_members_count", {
                      count: selectedGroup.member_count?.toLocaleString() ?? 0,
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Basic info */}
            <DetailSection title={t("groups:section_basic_info")}>
              <InfoRow
                icon={Layers}
                label={t("groups:label_group_name")}
                value={selectedGroup.name}
                mono
              />
              <InfoRow
                icon={Info}
                label={t("groups:label_description")}
                value={selectedGroup.description}
              />
              <InfoRow
                icon={ShieldAlert}
                label={t("groups:label_type")}
                value={groupTypeLabel(selectedGroup.category, t)}
              />
              <InfoRow
                icon={Layers}
                label={t("groups:label_scope")}
                value={scopeLabel(selectedGroup.scope, t)}
              />
              <InfoRow
                icon={Users}
                label={t("groups:label_managed_by")}
                value={selectedGroup.managed_by}
                mono
              />
            </DetailSection>

            {/* Members */}
            <DetailSection
              title={t("groups:section_members", {
                count:
                  selectedGroup.members?.length ??
                  selectedGroup.member_count ??
                  0,
              })}
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
                    title={t("groups:empty_no_members_title")}
                    description={t("groups:empty_no_members_desc")}
                  />
                </div>
              )}
            </DetailSection>

            {/* Danger zone */}
            <DetailSection title={t("groups:section_group_management")}>
              <div className="space-y-2 p-4">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger w-full justify-center"
                >
                  <Trash2 size={16} /> {t("groups:btn_delete_group")}
                </button>

                {showDeleteConfirm && (
                  <div className="rounded-md border border-red/30 bg-red/5 p-3">
                    <div className="flex items-start gap-2 text-sm text-red">
                      <ShieldAlert
                        size={16}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <p>
                        {t("groups:confirm_delete_group", {
                          name: selectedGroup.name,
                        })}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="btn-outline flex-1 justify-center"
                      >
                        {t("groups:btn_cancel")}
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
                        {t("groups:btn_delete_confirm")}
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
        title={t("groups:drawer_title_create")}
        width="lg"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          <Field label={t("groups:label_group_name_required")} error={formErrors.name}>
            <input
              className="input font-mono"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder={t("groups:ph_group_name")}
              autoComplete="off"
            />
          </Field>

          <Field label={t("groups:label_description_form")}>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder={t("groups:ph_description")}
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t("groups:label_type_form")}>
              <SelectInput
                value={form.category}
                onChange={(v) => setField("category", v)}
              >
                {GROUP_TYPES.map((gt) => (
                  <option key={gt} value={gt}>
                    {groupTypeLabel(gt, t)} ({gt})
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label={t("groups:label_scope_form")}>
              <SelectInput
                value={form.scope}
                onChange={(v) => setField("scope", v)}
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {scopeLabel(s, t)} ({s})
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <Field
            label={t("groups:label_ou_form")}
            hint={t("groups:hint_ou_example")}
          >
            <input
              className="input font-mono"
              value={form.ou}
              onChange={(e) => setField("ou", e.target.value)}
              placeholder={t("groups:ph_ou")}
              autoComplete="off"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-outline"
              onClick={() => setCreateOpen(false)}
            >
              {t("groups:btn_cancel")}
            </button>
            <button
              type="submit"
              className="btn-primary disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> {t("groups:btn_creating")}
                </>
              ) : (
                <>
                  <UserPlus size={16} /> {t("groups:btn_create")}
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
