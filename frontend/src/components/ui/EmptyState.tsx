import { clsx } from "clsx";

interface Props {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div className={clsx("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-hover">
        <Icon size={24} className="text-muted" />
      </div>
      <p className="text-sm font-medium text-primary">{title}</p>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
