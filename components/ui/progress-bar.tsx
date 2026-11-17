"use client";
import {useTranslations} from "next-intl";

interface ProgressBarProps {
  current: number;
  total: number;
  className?: string;
}

export function ProgressBar({
  current,
  total,
  className = "",
}: ProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const t=useTranslations("quizProgress");

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between text-sm text-muted mb-1">
        <span>
          {t("question",{current,total})}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-3 bg-surface-dim rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
