import Papa from "papaparse";
import * as XLSX from "xlsx";

/**
 * Spreadsheet → students/families import (non-AI path).
 * Heuristic column mapping + row normalization. AI assist is optional.
 */

export const IMPORT_FIELDS = [
  "student_name",
  "student_birthdate",
  "level",
  "teacher_notes",
  "archived",
  "guardian_name",
  "family_name",
  "email",
  "phone",
  "secondary_name",
  "secondary_email",
  "secondary_phone",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ColumnMapping = Partial<Record<ImportField, string | null>>;

export interface NormalizedImportRow {
  studentName: string;
  birthdate: string | null;
  level: string | null;
  teacherNotes: string | null;
  archived: boolean;
  guardianName: string | null;
  familyName: string | null;
  email: string | null;
  phone: string | null;
  secondaryName: string | null;
  secondaryEmail: string | null;
  secondaryPhone: string | null;
  /** 1-based spreadsheet row for error messages */
  sourceRow: number;
}

export interface ImportPreviewIssue {
  row: number;
  message: string;
}

const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  student_name: [
    "student",
    "student name",
    "student_name",
    "name",
    "child",
    "child name",
    "learner",
    "pupil",
    "שם התלמיד","שם תלמיד","תלמיד","имя ученика","ученик","ученица",
  ],
  student_birthdate: [
    "birthdate",
    "birthday",
    "dob",
    "date of birth",
    "birth date",
    "student birthdate",
    "תאריך לידה","дата рождения",
  ],
  level: ["level","rcm","grade","book","method level","רמה","уровень"],
  teacher_notes: ["notes","teacher notes","comments","memo","הערות מורה","הערות","заметки тренера","примечания"],
  archived: ["archived","former student","inactive","student status","בארכיון","מצב תלמיד","в архиве","архив","статус ученика"],
  guardian_name: [
    "guardian",
    "guardian name",
    "parent",
    "parent name",
    "mom",
    "dad",
    "mother",
    "father",
    "contact name",
    "primary contact",
    "שם ההורה","שם האפוטרופוס","שם אפוטרופוס","הורה",
    "имя родителя","имя опекуна","родитель","опекун",
  ],
  family_name: ["family","family name","household","שם המשפחה","фамилия","название семьи"],
  email: [
    "email",
    "e-mail",
    "parent email",
    "guardian email",
    "contact email",
    "email address",
    "דוא״ל",'דוא"ל',"אימייל","эл. почта","электронная почта","почта",
  ],
  phone: [
    "phone",
    "mobile",
    "cell",
    "telephone",
    "parent phone",
    "guardian phone",
    "contact phone",
    "טלפון","נייד","телефон","мобильный",
  ],
  secondary_name: [
    "secondary",
    "secondary name",
    "second guardian",
    "parent 2",
    "other parent",
    "אפוטרופוס נוסף","הורה נוסף","второй опекун","второй родитель",
  ],
  secondary_email: ["secondary email","parent 2 email","other email","דוא״ל נוסף","электронная почта второго опекуна","дополнительная почта"],
  secondary_phone: ["secondary phone","parent 2 phone","other phone","טלפון נוסף","дополнительный телефон"],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Suggest only unambiguous EXPLICIT header synonyms. A former substring
 * heuristic treated e.g. "Parent Name" as a student "Name", silently
 * importing a guardian under the child's identity. With multilingual column
 * names we must fail closed instead of guessing where family/student roles
 * overlap. Callers expose the unassigned columns for manual review.
 */
export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((raw) => ({raw, norm: normalizeHeader(raw)}));
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) {
    const synonyms = new Set(HEADER_SYNONYMS[field].map(normalizeHeader));
    const candidates = normalized.filter(h => !used.has(h.raw) && synonyms.has(h.norm));
    // A lone "Name" column can mean the pupil only when no stronger student
    // header exists; "Parent Name"/"Family Name" are NEVER student aliases.
    // If two distinct specific aliases exist for one field, let the teacher
    // choose instead of arbitrarily taking one based on spreadsheet order.
    const specific = field === "student_name"
      ? candidates.filter(h=>h.norm!=="name")
      : candidates;
    const choices=specific.length?specific:candidates;
    if (choices.length!==1) continue;
    mapping[field]=choices[0].raw;
    used.add(choices[0].raw);
  }
  return mapping;
}

function cell(
  row: Record<string, string>,
  header: string | null | undefined
): string {
  if (!header) return "";
  const v = row[header];
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

function parseBirthdate(raw: string): string | null {
  if (!raw) return null;
  // Excel serial dates sometimes arrive as numbers-as-strings
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const mdy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (mdy) {
    const a = Number(mdy[1]);
    const b = Number(mdy[2]);
    let y = Number(mdy[3]);
    if (y < 100) y += 2000;
    // Prefer M/D/Y (US)
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function normalizeImportRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  /** Spreadsheet row index of the first data row (usually 2 if row 1 is headers). */
  firstDataRowNumber = 2
): { rows: NormalizedImportRow[]; issues: ImportPreviewIssue[] } {
  const out: NormalizedImportRow[] = [];
  const issues: ImportPreviewIssue[] = [];

  rows.forEach((row, i) => {
    const sourceRow = firstDataRowNumber + i;
    const studentName = cell(row, mapping.student_name);
    if (!studentName) {
      const anyValue = Object.values(row).some((v) => String(v ?? "").trim());
      if (anyValue) {
        issues.push({
          row: sourceRow,
          message: "Missing student name (skipped)",
        });
      }
      return;
    }

    const birthRaw = cell(row, mapping.student_birthdate);
    let birthdate: string | null = null;
    if (birthRaw) {
      birthdate = parseBirthdate(birthRaw);
      if (!birthdate) {
        issues.push({
          row: sourceRow,
          message: `Could not parse birthdate "${birthRaw}"`,
        });
      }
    }

    const statusRaw = cell(row, mapping.archived).trim().toLowerCase();
    const archived = ["true","yes","1","archived","inactive","former","כן","בארכיון","לא פעיל","да","в архиве","неактивен"].includes(statusRaw);
    if (statusRaw && !archived && !["false","no","0","active","current","לא","פעיל","нет","активен"].includes(statusRaw)) {
      issues.push({ row: sourceRow, message: `Unknown archive status "${statusRaw}" (row skipped)` });
      return;
    }
    out.push({
      archived,
      studentName,
      birthdate,
      level: cell(row, mapping.level) || null,
      teacherNotes: cell(row, mapping.teacher_notes) || null,
      guardianName: cell(row, mapping.guardian_name) || null,
      familyName: cell(row, mapping.family_name) || null,
      email: cell(row, mapping.email) || null,
      phone: cell(row, mapping.phone) || null,
      secondaryName: cell(row, mapping.secondary_name) || null,
      secondaryEmail: cell(row, mapping.secondary_email) || null,
      secondaryPhone: cell(row, mapping.secondary_phone) || null,
      sourceRow,
    });
  });

  return { rows: out, issues };
}

/** Family grouping key for commit: email → family name → guardian name → student. */
export function familyGroupKey(row: NormalizedImportRow): string {
  const email = row.email?.toLowerCase();
  if (email) return `email:${email}`;
  if (row.familyName) return `family:${row.familyName.toLowerCase()}`;
  if (row.guardianName) return `guardian:${row.guardianName.toLowerCase()}`;
  return `solo:${row.studentName.toLowerCase()}:${row.sourceRow}`;
}

export function parseDelimitedText(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });
  const headers = result.meta.fields?.filter(Boolean) ?? [];
  const rows = (result.data ?? []).map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      out[h] = r[h] == null ? "" : String(r[h]);
    }
    return out;
  });
  return { headers, rows };
}

export function parseSpreadsheetBuffer(
  buffer: ArrayBuffer,
  filename: string
): { headers: string[]; rows: Record<string, string>[] } {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    return parseDelimitedText(text);
  }

  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (json.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(json[0]).map((h) => String(h).trim());
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      const v = r[h];
      out[h] = v == null ? "" : String(v).trim();
    }
    return out;
  });
  return { headers, rows };
}
