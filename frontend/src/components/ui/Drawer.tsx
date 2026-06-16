import { useEffect } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}

const widths = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Drawer({ open, onClose, title, children, width = "lg" }: Props) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={clsx(
          "relative ml-auto h-full w-full overflow-y-auto border-l border-border bg-card shadow-2xl",
          widths[width]
        )}
      >
        {/* Header */}
        {title && (
          <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-card px-6">
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-secondary hover:bg-hover hover:text-primary"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
