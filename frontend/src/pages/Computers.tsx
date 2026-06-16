import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  Monitor,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  FolderTree,
  Clock,
  Network,
  Info,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import type { ADComputer, Paginated } from "@/types/api";
import { DataTable } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

// Detail endpoint may include extra fields beyond the list shape.
type ComputerDetail = ADComputer & { description?: string };

// ── Constants ──────────────────────────────────────
const PAGE_SIZE = 20;
const API_BASE = "/api/v1";

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

function osIconClass(os: string): string {
  const k = (os ?? "").toLowerCase();
  if (k.includes("linux")) return "bg-yellow/15 text-yellow";
  if (k.includes("mac") || k.includes("darwin")) return "bg-purple/15 text-purple";
  return "bg-blue/15 text-blue";
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportComputersCsv(rows: ADComputer[]) {
  const header = [
    "호스트명",
    "운영체제",
    "OU",
    "상태",
    "최근 로그인",
    "IP 주소",
  ];
  const lines = rows.map((c) => [
    c.hostname,
    c.os,
    c.ou,
    c.enabled ? "활성" : "비활성",
    c.last_logon ?? "",
    c.ip_address ?? "",
  ]);
  const csv = [header, ...lines].map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `computers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Page ───────────────────────────────────────────
export function Computers() {
  // List state
  const [computers, setComputers] = useState<ADComputer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [osFilter, setOsFilter] = useState("");

  // Detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedComputer, setSelectedComputer] =
    useState<ComputerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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
  const fetchComputers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get<Paginated<ADComputer>>(
        `${API_BASE}/computers`,
        { params },
      );
      setComputers(data.items);
      setTotal(data.total);
      setTotalPages(data.pages || 1);
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          "컴퓨터 목록을 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchComputers();
  }, [fetchComputers]);

  // ── OS options (derived) ─────────────────────────
  const osOptions = useMemo(() => {
    const set = new Set<string>();
    computers.forEach((c) => {
      if (c.os) set.add(c.os);
    });
    return Array.from(set).sort();
  }, [computers]);

  const visibleComputers = useMemo(
    () => (osFilter ? computers.filter((c) => c.os === osFilter) : computers),
    [computers, osFilter],
  );

  // ── Auto-dismiss toast ───────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Detail ───────────────────────────────────────
  async function openDetail(computer: ADComputer) {
    setSelectedComputer(computer);
    setDetailOpen(true);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const { data } = await api.get<ComputerDetail>(
        `${API_BASE}/computers/${computer.id}`,
      );
      setSelectedComputer(data);
    } catch (err) {
      setDetailError(
        (err as { message?: string })?.message ??
          "컴퓨터 정보를 불러오지 못했습니다",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelectedComputer(null);
    setDetailError(null);
  }

  // ── Export ───────────────────────────────────────
  function handleExport() {
    if (!visibleComputers.length) {
      setToast({ type: "error", message: "내보낼 컴퓨터가 없습니다" });
      return;
    }
    try {
      exportComputersCsv(visibleComputers);
      setToast({ type: "success", message: "CSV 내보내기 완료" });
    } catch {
      setToast({ type: "error", message: "내보내기에 실패했습니다" });
    }
  }

  // ── Columns ──────────────────────────────────────
  const columns = [
    {
      key: "hostname",
      header: "호스트명",
      render: (c: ADComputer) => (
        <div className="flex items-center gap-2.5">
          <span
            className={clsx(
              "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md",
              osIconClass(c.os),
            )}
          >
            <Monitor size={14} />
          </span>
          <span className="font-medium text-primary">{c.hostname || "—"}</span>
        </div>
      ),
    },
    {
      key: "os",
      header: "운영체제",
      render: (c: ADComputer) => (
        <span className="text-secondary">{c.os || "—"}</span>
      ),
    },
    {
      key: "ou",
      header: "OU",
      render: (c: ADComputer) => (
        <span className="font-mono text-xs text-muted">{c.ou || "—"}</span>
      ),
    },
    {
      key: "enabled",
      header: "상태",
      render: (c: ADComputer) => (
        <StatusBadge status={c.enabled ? "enabled" : "disabled"} />
      ),
    },
    {
      key: "last_logon",
      header: "최근 로그인",
      render: (c: ADComputer) => (
        <span className="text-muted">{formatDate(c.last_logon)}</span>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">컴퓨터 관리</h1>
          <p className="mt-0.5 text-sm text-secondary">
            총 {total.toLocaleString()}대의 컴퓨터
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
            placeholder="호스트 이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <Monitor
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <select
            className="input cursor-pointer appearance-none pl-9 pr-9"
            value={osFilter}
            onChange={(e) => setOsFilter(e.target.value)}
          >
            <option value="">모든 운영체제</option>
            {osOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          />
        </div>

        <button className="btn-outline" onClick={handleExport}>
          <Download size={16} /> CSV 내보내기
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchComputers}
            className="ml-auto rounded px-2 py-1 text-xs hover:bg-red/10"
          >
            재시도
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        {!loading && !visibleComputers.length ? (
          <EmptyState
            icon={Monitor}
            title="컴퓨터가 없습니다"
            description={
              debouncedSearch || osFilter
                ? "검색 조건에 일치하는 컴퓨터가 없습니다."
                : "등록된 컴퓨터가 없습니다."
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={visibleComputers}
            loading={loading}
            emptyMessage="컴퓨터가 없습니다"
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
        title="컴퓨터 상세"
        width="lg"
      >
        {detailLoading && !selectedComputer && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-secondary" />
          </div>
        )}

        {detailError && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">
            <AlertCircle size={16} /> {detailError}
          </div>
        )}

        {selectedComputer && (
          <div className="space-y-6">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div
                className={clsx(
                  "flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full",
                  osIconClass(selectedComputer.os),
                )}
              >
                <Monitor size={26} />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-primary">
                  {selectedComputer.hostname || "—"}
                </h3>
                <p className="truncate text-sm text-secondary">
                  {selectedComputer.os || "운영체제 정보 없음"}
                </p>
                <div className="mt-1.5">
                  <StatusBadge
                    status={selectedComputer.enabled ? "enabled" : "disabled"}
                  />
                </div>
              </div>
            </div>

            {/* Basic info */}
            <DetailSection title="기본 정보">
              <InfoRow
                icon={Monitor}
                label="호스트명"
                value={selectedComputer.hostname}
                mono
              />
              <InfoRow icon={Info} label="운영체제" value={selectedComputer.os} />
              <InfoRow
                icon={Network}
                label="IP 주소"
                value={selectedComputer.ip_address}
                mono
              />
              <InfoRow
                icon={FolderTree}
                label="조직 단위"
                value={selectedComputer.ou}
                mono
              />
              <InfoRow
                icon={Info}
                label="설명"
                value={selectedComputer.description}
              />
              <InfoRow
                icon={Clock}
                label="최근 로그인"
                value={formatDate(selectedComputer.last_logon)}
              />
            </DetailSection>
          </div>
        )}
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
