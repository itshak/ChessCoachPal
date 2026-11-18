"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm";

export function AddStudentForm({
  guardians = [],
}: {
  guardians?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const t=useTranslations("students");
  const toUserError=useLocalizedApiError();
  const [name, setName] = useState("");
  const [guardianId, setGuardianId] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [adultSelf, setAdultSelf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkExisting = Boolean(guardianId);
  const wantsContact =
    !linkExisting &&
    (adultSelf || Boolean(contactEmail.trim()) || Boolean(contactPhone.trim()) ||
      Boolean(contactName.trim()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    if (!linkExisting) {
      const email = contactEmail.trim();
      const phone = contactPhone.trim();
      const parent = contactName.trim();

      if ((email || phone) && !adultSelf && !parent) {
        setError(
          t("guardianRequiredError")
        );
        return;
      }
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        birthdate: birthdate || null,
        guardianId: guardianId || null,
        contactEmail: linkExisting ? null : contactEmail.trim() || null,
        contactPhone: linkExisting ? null : contactPhone.trim() || null,
        contactName: linkExisting ? null : contactName.trim() || null,
        adultSelf: linkExisting ? false : adultSelf,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const base = toUserError(data, t("addFailed"));
      setError(
        data.code === "HOSTED_LIMIT_REACHED" && data.upgradePath
          ? `${base} See ${data.upgradePath}.`
          : base
      );
      setLoading(false);
      return;
    }

    setName("");
    setGuardianId("");
    setBirthdate("");
    setContactEmail("");
    setContactPhone("");
    setContactName("");
    setAdultSelf(false);
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        placeholder={t("name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
        required
      />
      <select
        value={guardianId}
        onChange={(e) => setGuardianId(e.target.value)}
        className={inputClass}
      >
        <option value="">{t("contactOption")}</option>
        {guardians.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {!linkExisting && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-xs text-muted">
            {t("contactHint")}
          </p>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={adultSelf}
              onChange={(e) => setAdultSelf(e.target.checked)}
            />
            {t("adultSelf")}
          </label>
          <input
            type="text"
            placeholder={
              adultSelf
                ? t("contactNameOptional")
                : wantsContact
                  ? t("guardianNameRequired")
                  : t("guardianName")
            }
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className={inputClass}
            required={wantsContact && !adultSelf}
          />
          <input
            type="email"
            placeholder={t("email")}
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className={inputClass}
          />
          <input
            type="tel"
            placeholder={t("phone")}
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs text-muted">
        {t("birthday")}
        <input
          type="date"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
          className={inputClass}
        />
      </label>
      {error && <p className="text-error text-xs">{error}</p>}
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? t("adding") : t("addButton")}
      </Button>
    </form>
  );
}
