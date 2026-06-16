import { clsx } from "clsx";

type Col<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
};

interface Props<T> {
  columns: Col<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading,
  emptyMessage = "데이터가 없습니다",
  onRowClick,
}: Props<T>) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="text-sm text-muted">로딩 중...</div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="text-sm text-muted">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left text-xs text-secondary">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={clsx("px-4 py-3 font-medium", col.className)}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={clsx(
                "border-b border-border-subtle transition-colors",
                onRowClick && "cursor-pointer hover:bg-hover"
              )}
            >
              {columns.map((col) => (
                <td key={String(col.key)} className={clsx("px-4 py-3 text-sm", col.className)}>
                  {col.render ? col.render(row) : row[col.key as keyof T] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
