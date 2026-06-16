import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  Plus,
  Trash2,
  Server,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronDown,
  Clock,
  Network,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import type { DNSZone, DNSRecord } from "@/types/api";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Constants ──────────────────────────────────────
const API_BASE = "/api/v1";

const RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "PTR",
  "SRV",
  "SOA",
] as const;

const DEFAULT_TTL = 3600;

interface CreateForm {
  name: string;
  type: string;
  value: string;
  ttl: number;
}

const EMPTY_FORM: CreateForm = {
  name: "",
  type: "A",
  value: "",
  ttl: DEFAULT_TTL,
};

type Toast = { type: "success" | "error"; message: string } | null;

// ── Helpers ────────────────────────────────────────
function zoneTypeBadge(t: string): string {
  const k = (t ?? "").toLowerCase();
  if (k.includes("primary") || k.includes("master")) return "주 영역";
  if (k.includes("secondary") || k.includes("slave")) return "보조 영역";
  if (k.includes("stub")) return "스텁 영역";
  if (k.includes("forward")) return "전달 영역";
  return t || "영역";
}

function formatTtl(ttl: number): string {
  if (!ttl && ttl !== 0) return "—";
  if (ttl < 60) return `${ttl}초`;
  if (ttl < 3600) return `${Math.round(ttl / 60)}분`;
  if (ttl < 86400) return `${Math.round(ttl / 3600)}시간`;
  return `${Math.round(ttl / 86400)}일`;
}

// ── Page ───────────────────────────────────────────
export function DNS() {
  // Zones
  const [zones, setZones] = useState<DNSZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  // Records
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  // Create drawer
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<Toast>(null);

  // ── Fetch zones ──────────────────────────────────
  const fetchZones = useCallback(async () => {
    setZonesLoading(true);
    setZonesError(null);
    try {
      const { data } = await api.get<DNSZone[]>(`${API_BASE}/dns/zones`);
      const list = Array.isArray(data) ? data : [];
      setZones(list);
      if (list.length && !selectedZone) {
        setSelectedZone(list[0].name);
      } else if (selectedZone && !list.some((z) => z.name === selectedZone)) {
        setSelectedZone(list[0]?.name ?? null);
      }
    } catch (err) {
      setZonesError(
        (err as { message?: string })?.message ??
          "DNS 영역 목록을 불러오지 못했습니다",
      );
    } finally {
      setZonesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  // ── Fetch records for selected zone ──────────────
  const fetchRecords = useCallback(async () => {
    if (!selectedZone) {
      setRecords([]);
      return;
    }
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const { data } = await api.get<DNSRecord[]>(
        `${API_BASE}/dns/zones/${encodeURIComponent(selectedZone)}/records`,
      );
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setRecordsError(
        (err as { message?: string })?.message ??
          "레코드 목록을 불러오지 못했습니다",
      );
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [selectedZone]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Create ───────────────────────────────────────
  function openCreate() {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setCreateOpen(true);
  }

  function setField<K extends keyof CreateForm>(key: K, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedZone) return;
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "레코드 이름을 입력하세요";
    if (!form.value.trim()) errs.value = "값을 입력하세요";
    if (form.ttl < 0) errs.ttl = "TTL은 0 이상이어야 합니다";
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        type: form.type,
        value: form.value.trim(),
        ttl: Number(form.ttl),
      };
      await api.post<DNSRecord>(
        `${API_BASE}/dns/zones/${encodeURIComponent(selectedZone)}/records`,
        body,
      );
      setToast({ type: "success", message: "레코드가 추가되었습니다" });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormErrors({});
      fetchRecords();
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ?? "레코드 추가에 실패했습니다",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Delete ───────────────────────────────────────
  async function handleDelete(name: string) {
    if (!selectedZone) return;
    setDeletingName(name);
    try {
      await api.delete(
        `${API_BASE}/dns/zones/${encodeURIComponent(selectedZone)}/records/${encodeURIComponent(name)}`,
      );
      setToast({ type: "success", message: "레코드가 삭제되었습니다" });
      setConfirmName(null);
      fetchRecords();
    } catch (err) {
      setToast({
        type: "error",
        message:
          (err as { message?: string })?.message ?? "삭제에 실패했습니다",
      });
    } finally {
      setDeletingName(null);
    }
  }

  // ── Columns ──────────────────────────────────────
  const columns = [
    {
      key: "name",
      header: "이름",
      render: (r: DNSRecord) => (
        <span className="font-mono text-sm font-medium text-primary">
          {r.name || "@"}
        </span>
      ),
    },
    {
      key: "type",
      header: "유형",
      render: (r: DNSRecord) => (
        <span className="badge bg-blue/10 text-blue">{r.type}</span>
      ),
    },
    {
      key: "value",
      header: "값",
      render: (r: DNSRecord) => (
        <span
          className="block max-w-[320px] truncate font-mono text-xs text-secondary"
          title={r.value ?? undefined}
        >
          {r.value || "—"}
        </span>
      ),
    },
    {
      key: "ttl",
      header: "TTL",
      render: (r: DNSRecord) => (
        <span className="inline-flex items-center gap-1 font-mono text-xs text-muted">
          <Clock size={12} />
          {formatTtl(r.ttl)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-16 text-right",
      render: (r: DNSRecord) => (
        <div className="flex justify-end">
          {confirmName === r.name ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConfirmName(null)}
                className="rounded px-2 py-1 text-xs text-muted hover:text-primary"
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(r.name)}
                disabled={deletingName === r.name}
                className="btn-danger px-2 py-1 text-xs disabled:opacity-50"
              >
                {deletingName === r.name ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
                확인
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmName(r.name)}
              className="rounded p-1.5 text-muted transition-colors hover:bg-red/10 hover:text-red"
              title="레코드 삭제"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">DNS 관리</h1>
          <p className="mt-0.5 text-sm text-secondary">
            DNS 영역 및 레코드를 관리합니다
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={openCreate}
          disabled={!selectedZone}
        >
          <Plus size={16} /> 레코드 추가
        </button>
      </div>

      {/* Zones error */}
      {zonesError && (
        <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{zonesError}</span>
          <button
            onClick={fetchZones}
            className="ml-auto rounded px-2 py-1 text-xs hover:bg-red/10"
          >
            재시도
          </button>
        </div>
      )}

      {/* Zone tabs */}
      {zonesLoading ? (
        <div className="card flex h-24 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-secondary" />
        </div>
      ) : zones.length === 0 && !zonesError ? (
        <div className="card">
          <EmptyState
            icon={Globe}
            title="DNS 영역이 없습니다"
            description="구성된 DNS 영역을 찾을 수 없습니다."
          />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {zones.map((zone) => (
            <button
              key={zone.name}
              onClick={() => setSelectedZone(zone.name)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-all duration-150",
                selectedZone === zone.name
                  ? "border-blue bg-blue/10 text-blue"
                  : "border-border bg-card text-secondary hover:border-border hover:bg-hover hover:text-primary",
              )}
            >
              <Network
                size={14}
                className={selectedZone === zone.name ? "text-blue" : "text-muted"}
              />
              <span className="font-mono font-medium">{zone.name}</span>
              <span
                className={clsx(
                  "badge px-1.5 py-0 text-[10px]",
                  selectedZone === zone.name
                    ? "bg-blue/15 text-blue"
                    : "bg-muted/15 text-muted",
                )}
              >
                {zoneTypeBadge(zone.zone_type)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Records */}
      {selectedZone && (
        <div className="card">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <Server size={15} className="text-blue" />
              <span className="font-mono text-sm font-medium text-primary">
                {selectedZone}
              </span>
              <span className="text-xs text-muted">
                · {records.length}개 레코드
              </span>
            </div>
          </div>

          {recordsError && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-red">
              <AlertCircle size={16} />
              <span>{recordsError}</span>
              <button
                onClick={fetchRecords}
                className="ml-auto rounded px-2 py-1 text-xs hover:bg-red/10"
              >
                재시도
              </button>
            </div>
          )}

          {records.length === 0 && !recordsLoading && !recordsError ? (
            <EmptyState
              icon={Globe}
              title="레코드가 없습니다"
              description="이 영역에 DNS 레코드를 추가하세요."
              action={
                <button className="btn-primary" onClick={openCreate}>
                  <Plus size={16} /> 레코드 추가
                </button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={records}
              loading={recordsLoading}
              emptyMessage="레코드가 없습니다"
            />
          )}
        </div>
      )}

      {/* ── Create Drawer ────────────────────────── */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="레코드 추가"
        width="lg"
      >
        <form onSubmit={handleCreate} className="space-y-5">
          {selectedZone && (
            <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-hover px-3 py-2 text-xs">
              <Network size={14} className="text-blue" />
              <span className="text-muted">대상 영역:</span>
              <span className="font-mono text-secondary">{selectedZone}</span>
            </div>
          )}

          <Field label="이름 *" error={formErrors.name}>
            <input
              className="input font-mono"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="@ 또는 www"
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="유형">
              <SelectInput
                value={form.type}
                onChange={(v) => setField("type", v)}
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="TTL (초)">
              <input
                type="number"
                min={0}
                className="input font-mono"
                value={form.ttl}
                onChange={(e) => setField("ttl", e.target.value)}
                placeholder="3600"
              />
            </Field>
          </div>

          <Field
            label="값 *"
            error={formErrors.value}
            hint={
              form.type === "MX"
                ? "예: 10 mail.example.com."
                : form.type === "A"
                  ? "예: 192.168.1.10"
                  : form.type === "CNAME"
                    ? "예: target.example.com."
                    : undefined
            }
          >
            <input
              className="input font-mono"
              value={form.value}
              onChange={(e) => setField("value", e.target.value)}
              placeholder={
                form.type === "A"
                  ? "192.168.1.10"
                  : form.type === "MX"
                    ? "10 mail.example.com."
                    : "값 입력"
              }
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
                  <Loader2 size={16} className="animate-spin" /> 추가 중...
                </>
              ) : (
                <>
                  <Plus size={16} /> 추가
                </>
              )}
            </button>
          </div>
        </form>
      </Drawer>

      {/* ── Toast ───────────────────────────────── */}
      <ToastView toast={toast} onClose={() => setToast(null)} />
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
        className="input cursor-pointer appearance-none pr-9 font-mono"
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

function ToastView({
  toast,
  onClose,
}: {
  toast: Toast;
  onClose: () => void;
}) {
  if (!toast) return null;
  return (
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
        onClick={onClose}
        className="ml-2 rounded p-0.5 text-muted hover:text-primary"
      >
        <X size={14} />
      </button>
    </div>
  );
}
