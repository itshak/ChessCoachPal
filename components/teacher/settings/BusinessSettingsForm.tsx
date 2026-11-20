"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TeacherPolicy } from "@/lib/schedule";

const inputClass =
  "px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm";

const COMMON_BLOCKS = [15, 20, 30, 45, 60, 90];

export function BusinessSettingsForm({ policy }: { policy: TeacherPolicy }) {
  const router = useRouter();
  const t=useTranslations("businessSettings");
  const toUserError=useLocalizedApiError();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState(policy.business_name);
  const [lessonLabel, setLessonLabel] = useState(policy.lesson_label);
  const [businessWebsite, setBusinessWebsite] = useState(policy.business_website);
  const [businessContact, setBusinessContact] = useState(policy.business_contact);
  const [businessInfo, setBusinessInfo] = useState(policy.business_info);
  const [blocks, setBlocks] = useState<number[]>(
    [...policy.lesson_duration_options].sort((a, b) => a - b)
  );
  const [customBlock, setCustomBlock] = useState("");

  const chipChoices = [...new Set([...COMMON_BLOCKS, ...blocks])].sort(
    (a, b) => a - b
  );

  function toggleBlock(minutes: number) {
    setBlocks((prev) =>
      prev.includes(minutes)
        ? prev.filter((b) => b !== minutes)
        : [...prev, minutes].sort((a, b) => a - b)
    );
  }

  function addCustom() {
    const minutes = Number(customBlock);
    if (Number.isInteger(minutes) && minutes >= 5 && minutes <= 240) {
      setBlocks((prev) =>
        prev.includes(minutes) ? prev : [...prev, minutes].sort((a, b) => a - b)
      );
      setCustomBlock("");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (blocks.length === 0) {
      setMessage(t("needBlock"));
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/settings/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName,
        lessonLabel,
        businessWebsite,
        businessContact,
        businessInfo,
        lessonDurationOptions: blocks,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMessage(t("saved"));
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(toUserError(data, t("saveError")));
    }
    setTimeout(() => setMessage(null), 2500);
  }

  return (
    <Card padding="sm">
      <h2 className="font-semibold mb-3">{t("title")}</h2>
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">
            {t("businessName")}
          </span>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder={t("businessPlaceholder")}
            maxLength={120}
            className={`${inputClass} w-full`}
          />
          <span className="block text-xs text-muted mt-1">
            {t("businessHint")}
          </span>
        </label>

        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">
            {t("lessonLabel")}
          </span>
          <input
            type="text"
            value={lessonLabel}
            onChange={(e) => setLessonLabel(e.target.value)}
            placeholder={t("lessonPlaceholder")}
            maxLength={60}
            className={`${inputClass} w-full`}
          />
          <span className="block text-xs text-muted mt-1">
            {t("lessonHint")}
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted mb-1">
              {t("website")}
            </span>
            <input
              type="url"
              value={businessWebsite}
              onChange={(e) => setBusinessWebsite(e.target.value)}
              placeholder={t("websitePlaceholder")}
              dir="ltr"
              maxLength={300}
              className={`${inputClass} w-full`}
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted mb-1">
              {t("contact")}
            </span>
            <input
              type="text"
              value={businessContact}
              onChange={(e) => setBusinessContact(e.target.value)}
              placeholder={t("contactPlaceholder")}
              maxLength={300}
              className={`${inputClass} w-full`}
            />
          </label>
        </div>

        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">
            {t("info")}
          </span>
          <textarea
            value={businessInfo}
            onChange={(e) => setBusinessInfo(e.target.value)}
            placeholder={
              t("infoPlaceholder")
            }
            rows={4}
            maxLength={5000}
            className={`${inputClass} w-full resize-y`}
          />
          <span className="block text-xs text-muted mt-1">
            {t("infoHint")}
          </span>
        </label>

        <fieldset>
          <legend className="text-xs font-semibold text-muted mb-1">
            {t("timeBlocks")}
          </legend>
          <div className="flex flex-wrap gap-2 mb-2">
            {chipChoices.map((minutes) => {
              const active = blocks.includes(minutes);
              return (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => toggleBlock(minutes)}
                  className={`px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-colors ${
                    active
                      ? "bg-primary text-white border-primary"
                      : "bg-background text-muted border-border hover:border-primary/50"
                  }`}
                >
                  {t("minutes",{count:minutes})}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={240}
              step={5}
              placeholder={t("custom")}
              value={customBlock}
              onChange={(e) => setCustomBlock(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              className={`${inputClass} w-24`}
            />
            <Button type="button" size="sm" variant="secondary" onClick={addCustom}>
              {t("add")}
            </Button>
          </div>
          <span className="block text-xs text-muted mt-1">
            {t("durationHint")}
          </span>
        </fieldset>

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={busy}>
            {busy?t("saving"):t("save")}
          </Button>
          {message && <span className="text-xs text-muted">{message}</span>}
        </div>
      </form>
    </Card>
  );
}
