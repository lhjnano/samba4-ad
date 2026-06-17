import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { LANGUAGES } from "@/i18n";

interface Props {
  variant?: "compact" | "select";
  className?: string;
}

/**
 * Reusable language switcher.
 * - "compact": icon button with dropdown (for topbar / login)
 * - "select": native <select> (for settings page)
 */
export function LanguageSwitcher({ variant = "compact", className = "" }: Props) {
  const { i18n } = useTranslation();

  if (variant === "select") {
    return (
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className={`input ${className}`}
      >
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <Globe size={18} className="text-secondary" />
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="cursor-pointer appearance-none border-0 bg-transparent py-1 pl-1.5 pr-6 text-sm text-secondary hover:text-primary focus:outline-none"
        title="Language"
        aria-label="Language"
      >
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
