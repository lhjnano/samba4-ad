import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: Props) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-xs text-muted">
        {t("common:pagination_page", { page, total: totalPages })}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={clsx(
            "rounded-md p-1.5",
            page <= 1
              ? "cursor-not-allowed text-muted"
              : "text-secondary hover:bg-hover hover:text-primary"
          )}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={clsx(
            "rounded-md p-1.5",
            page >= totalPages
              ? "cursor-not-allowed text-muted"
              : "text-secondary hover:bg-hover hover:text-primary"
          )}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
