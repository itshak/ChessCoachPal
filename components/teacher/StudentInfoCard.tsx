"use client";

import { useState } from "react";
import {useLocale,useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { centsToDollarsInput, dollarsToCents, formatMoney } from "@/lib/billing";
import {
  createdAtToPracticeStartDate,
  formatPracticeSince,
  yearsSincePracticeStart,
  isYearOnlyPracticeStart,
  yearToPracticeStartDate,
} from "@/lib/students-practice";

/**
 * Editable student details: level, birthday, practicing since, and optional rates.
 */
export function StudentInfoCard({
  studentId,
  initialLevel,
  initialBirthdate,
  initialPracticeStartDate,
  createdAt,
  initialDefaultRateCents,
  initialTravelFeeCents = null,
}: {
  studentId: string;
  initialLevel: string | null;
  initialBirthdate: string | null;
  initialPracticeStartDate: string | null;
  createdAt: string;
  initialDefaultRateCents: number | null;
  initialTravelFeeCents?: number | null;
}) {
  const t=useTranslations("studentInfo"),locale=useLocale();
  return (
    <Card padding="sm" className="mb-6">
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <InfoField
          studentId={studentId}
          label={t("level")}
          field="level"
          type="text"
          initialValue={initialLevel}
          placeholder={t("levelHint")}
          emptyLabel={t("setLevel")}
          display={(v) => v}
        />
        <InfoField
          studentId={studentId}
          label={t("birthday")}
          field="birthdate"
          type="date"
          initialValue={initialBirthdate}
          emptyLabel={t("setBirthday")}
          display={(v) => {
            const age = ageFromBirthdate(v);
            return age !== null
              ? formatBirthdate(v,locale)+" ("+t("age",{age})+")"
              : formatBirthdate(v,locale);
          }}
        />
        <PracticeSinceField
          studentId={studentId}
          initialValue={initialPracticeStartDate}
          createdAt={createdAt}
        />
        <MoneyOverrideField
          studentId={studentId}
          label={t("rate")}
          field="defaultRateCents"
          initialCents={initialDefaultRateCents}
          displaySuffix={t("hourSuffix")}
          editTitle={t("rateTitle")}
        />
        <MoneyOverrideField
          studentId={studentId}
          label={t("travelFee")}
          field="travelFeeCents"
          initialCents={initialTravelFeeCents}
          editTitle={t("travelFeeTitle")}
        />
      </div>
    </Card>
  );
}

function PracticeSinceField({
  studentId,
  initialValue,
  createdAt,
}: {
  studentId: string;
  initialValue: string | null;
  createdAt: string;
}) {
  const router = useRouter();
  const t=useTranslations("studentInfo"),locale=useLocale();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"year" | "date">(
    initialValue && !isYearOnlyPracticeStart(initialValue) ? "date" : "year"
  );
  const [year, setYear] = useState(
    initialValue ? initialValue.slice(0, 4) : ""
  );
  const [date, setDate] = useState(
    initialValue && !isYearOnlyPracticeStart(initialValue) ? initialValue : ""
  );
  const [saving, setSaving] = useState(false);

  async function saveValue(practiceStartDate: string | null) {
    setSaving(true);
    await fetch(`/api/students/${studentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ practiceStartDate }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  function openEdit() {
    setMode(
      initialValue && !isYearOnlyPracticeStart(initialValue) ? "date" : "year"
    );
    setYear(initialValue ? initialValue.slice(0, 4) : "");
    setDate(
      initialValue && !isYearOnlyPracticeStart(initialValue) ? initialValue : ""
    );
    setEditing(true);
  }

  return (
    <div>
      <div className="text-xs text-muted font-medium mb-0.5">{t("practiceSince")}</div>
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMode("year")}
              className={`cursor-pointer ${
                mode === "year" ? "text-primary font-semibold" : "text-muted"
              }`}
            >
              {t("yearOnly")}
            </button>
            <span className="text-muted">·</span>
            <button
              type="button"
              onClick={() => setMode("date")}
              className={`cursor-pointer ${
                mode === "date" ? "text-primary font-semibold" : "text-muted"
              }`}
            >
              {t("exactDate")}
            </button>
          </div>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {mode === "year" ? (
              <input
                autoFocus
                type="number"
                min={1950}
                max={new Date().getFullYear()}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const y = Number(year);
                    if (y >= 1950 && y <= new Date().getFullYear()) {
                      saveValue(yearToPracticeStartDate(y));
                    }
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
                placeholder="e.g. 2021"
                className="px-2 py-0.5 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm w-24"
              />
            ) : (
              <input
                autoFocus
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && date) saveValue(date);
                  if (e.key === "Escape") setEditing(false);
                }}
                className="px-2 py-0.5 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm w-44"
              />
            )}
            <button
              onClick={() => {
                if (mode === "year") {
                  const y = Number(year);
                  if (y >= 1950 && y <= new Date().getFullYear()) {
                    saveValue(yearToPracticeStartDate(y));
                  }
                } else if (date) {
                  saveValue(date);
                }
              }}
              disabled={saving}
              className="text-xs text-primary hover:text-primary-dark font-semibold cursor-pointer"
            >
              {saving ? "…" : t("save")}
            </button>
            <button
              type="button"
              onClick={() => saveValue(null)}
              disabled={saving}
              className="text-xs text-muted hover:text-foreground cursor-pointer"
            >
              {t("clear")}
            </button>
          </span>
          <button
            type="button"
            onClick={() => {
              const addDate = createdAtToPracticeStartDate(createdAt);
              if (addDate) saveValue(addDate);
            }}
            disabled={saving}
            className="text-xs text-muted hover:text-primary text-start cursor-pointer"
          >
            {t("useAddedDate")}
          </button>
        </div>
      ) : (
        <button
          onClick={openEdit}
          className="text-sm hover:text-primary transition-colors cursor-pointer"
          title={t("editPractice")}
        >
          {initialValue ? (
            <span className="font-medium">{locale==="en"?formatPracticeSince(initialValue):
             t("practiceSinceDate",{date:formatLocalizedPracticeDate(initialValue,locale)})+
             ((yearsSincePracticeStart(initialValue)??0)>=1?
                " "+t("practiceApproxYears",{count:yearsSincePracticeStart(initialValue)!}):"")}</span>
          ) : (
            <span className="text-muted">{t("setStart")}</span>
          )}
        </button>
      )}
    </div>
  );
}

function MoneyOverrideField({
  studentId,
  label,
  field,
  initialCents,
  displaySuffix = "",
  editTitle,
}: {
  studentId: string;
  label: string;
  field: "defaultRateCents" | "travelFeeCents";
  initialCents: number | null;
  displaySuffix?: string;
  editTitle: string;
}) {
  const router = useRouter();
  const t=useTranslations("studentInfo");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(centsToDollarsInput(initialCents));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveCents(cents: number | null) {
    setSaving(true);
    setError(null);
    await fetch(`/api/students/${studentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: cents }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function save() {
    const cents = value.trim() === "" ? null : dollarsToCents(value);
    if (value.trim() !== "" && cents === null) {
      setError(t("invalidAmount"));
      return;
    }
    await saveCents(cents);
  }

  return (
    <div>
      <div className="text-xs text-muted font-medium mb-0.5">{label}</div>
      {editing ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-sm text-muted">$</span>
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={t("useDefault")}
            className="px-2 py-0.5 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm w-24"
          />
          <button
            onClick={save}
            disabled={saving}
            className="text-xs text-primary hover:text-primary-dark font-semibold cursor-pointer"
          >
            {saving ? "…" : t("save")}
          </button>
          <button
            type="button"
            onClick={() => saveCents(null)}
            disabled={saving}
            className="text-xs text-muted hover:text-foreground cursor-pointer"
          >
            {t("clear")}
          </button>
          {error && <span className="text-xs text-error">{error}</span>}
        </span>
      ) : (
        <button
          onClick={() => {
            setValue(centsToDollarsInput(initialCents));
            setEditing(true);
          }}
          className="text-sm hover:text-primary transition-colors cursor-pointer"
          title={editTitle}
        >
          {initialCents != null ? (
            <span className="font-medium">
              {formatMoney(initialCents)}
              {displaySuffix}
            </span>
          ) : (
            <span className="text-muted">{t("useDefault")}</span>
          )}
        </button>
      )}
    </div>
  );
}

function InfoField({
  studentId,
  label,
  field,
  type,
  initialValue,
  placeholder,
  emptyLabel,
  display,
}: {
  studentId: string;
  label: string;
  field: "level" | "birthdate";
  type: "text" | "date";
  initialValue: string | null;
  placeholder?: string;
  emptyLabel: string;
  display: (value: string) => string;
}) {
  const router = useRouter();
  const t=useTranslations("studentInfo");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/students/${studentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <div>
      <div className="text-xs text-muted font-medium mb-0.5">{label}</div>
      {editing ? (
        <span className="inline-flex items-center gap-1.5">
          <input
            autoFocus
            type={type}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={placeholder}
            className="px-2 py-0.5 rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm w-44"
          />
          <button
            onClick={save}
            disabled={saving}
            className="text-xs text-primary hover:text-primary-dark font-semibold cursor-pointer"
          >
            {saving ? "…" : t("save")}
          </button>
        </span>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm hover:text-primary transition-colors cursor-pointer"
          title={t("editField",{field:label.toLowerCase()})}
        >
          {initialValue ? (
            <span className="font-medium"><bdi dir="auto">{display(initialValue)}</bdi></span>
          ) : (
            <span className="text-muted">{emptyLabel}</span>
          )}
        </button>
      )}
    </div>
  );
}

/** Parse a YYYY-MM-DD date string as local date parts (avoids UTC shifting). */
function parseDateParts(dateString: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function ageFromBirthdate(birthdate: string): number | null {
  const parts = parseDateParts(birthdate);
  if (!parts) return null;
  const [year, month, day] = parts;
  const now = new Date();
  let age = now.getFullYear() - year;
  const hadBirthdayThisYear =
    now.getMonth() + 1 > month ||
    (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!hadBirthdayThisYear) age--;
  return age >= 0 && age < 130 ? age : null;
}

function formatBirthdate(birthdate: string,locale:string): string {
  const parts = parseDateParts(birthdate);
  if (!parts) return birthdate;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Human-readable locale display only; stored date sentinel is not modified. */
function formatLocalizedPracticeDate(date:string,locale:string):string {
  const parts=parseDateParts(date);
  if(!parts)return date;
  const [year,month,day]=parts;
  if(isYearOnlyPracticeStart(date))return String(year);
  return new Intl.DateTimeFormat(locale,day===1?
    {month:"short",year:"numeric"}:{day:"numeric",month:"short",year:"numeric"})
    .format(new Date(year,month-1,day));
}
