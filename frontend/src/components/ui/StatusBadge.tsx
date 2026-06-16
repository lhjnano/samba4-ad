import { clsx } from "clsx";

interface Props {
  status: "enabled" | "disabled" | "locked" | "healthy" | "degraded" | "down";
  label?: string;
}

const config = {
  enabled: { cls: "bg-green/10 text-green", defaultLabel: "활성" },
  healthy: { cls: "bg-green/10 text-green", defaultLabel: "정상" },
  disabled: { cls: "bg-muted/15 text-muted", defaultLabel: "비활성" },
  down: { cls: "bg-red/10 text-red", defaultLabel: "중단" },
  locked: { cls: "bg-red/10 text-red", defaultLabel: "잠김" },
  degraded: { cls: "bg-yellow/10 text-yellow", defaultLabel: "저하" },
} as const;

export function StatusBadge({ status, label }: Props) {
  const c = config[status];
  return (
    <span className={clsx("badge", c.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label || c.defaultLabel}
    </span>
  );
}
