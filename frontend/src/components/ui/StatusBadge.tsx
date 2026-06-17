import { clsx } from "clsx";
import { useTranslation } from "react-i18next";

interface Props {
  status: "enabled" | "disabled" | "locked" | "healthy" | "degraded" | "down";
  label?: string;
}

export function StatusBadge({ status, label }: Props) {
  const { t } = useTranslation();

  const cls = {
    enabled: "bg-green/10 text-green",
    healthy: "bg-green/10 text-green",
    disabled: "bg-muted/15 text-muted",
    down: "bg-red/10 text-red",
    locked: "bg-red/10 text-red",
    degraded: "bg-yellow/10 text-yellow",
  } as const;

  const defaultLabel = t(`common:status_${status}`);

  return (
    <span className={clsx("badge", cls[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label || defaultLabel}
    </span>
  );
}
