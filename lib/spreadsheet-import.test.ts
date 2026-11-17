import { describe, expect, it } from "vitest";
import {
  familyGroupKey,
  normalizeImportRows,
  parseDelimitedText,
  suggestColumnMapping,
  type NormalizedImportRow,
} from "@/lib/spreadsheet-import";

describe("suggestColumnMapping", () => {
  it("maps common MMS-like headers", () => {
    const mapping = suggestColumnMapping([
      "Student Name",
      "Parent Name",
      "Email",
      "Phone",
      "Birthdate",
      "Level",
    ]);
    expect(mapping.student_name).toBe("Student Name");
    expect(mapping.guardian_name).toBe("Parent Name");
    expect(mapping.email).toBe("Email");
    expect(mapping.phone).toBe("Phone");
    expect(mapping.student_birthdate).toBe("Birthdate");
    expect(mapping.level).toBe("Level");
  });

  it("maps localized Hebrew and Russian CSV template headers", () => {
    const he=suggestColumnMapping(["שם התלמיד","שם ההורה","דוא״ל","טלפון","תאריך לידה","רמה"]);
    expect(he).toMatchObject({student_name:"שם התלמיד",guardian_name:"שם ההורה",
      email:"דוא״ל",phone:"טלפון",student_birthdate:"תאריך לידה",level:"רמה"});
    const ru=suggestColumnMapping(["Имя ученика","Имя родителя","Эл. почта","Телефон","Дата рождения","Уровень"]);
    expect(ru).toMatchObject({student_name:"Имя ученика",guardian_name:"Имя родителя",
      email:"Эл. почта",phone:"Телефон",student_birthdate:"Дата рождения",level:"Уровень"});
  });

  it("never infers a student from parent/family column names in any supported language",()=>{
    for(const columns of [
      ["Parent Name","Family Name","Email"],
      ["שם ההורה","שם המשפחה","דוא״ל"],
      ["Имя родителя","Название семьи","Эл. почта"],
    ]){
      const mapping=suggestColumnMapping(columns);
      expect(mapping.student_name).toBeUndefined();
      expect(mapping.guardian_name).toBe(columns[0]);
      expect(mapping.family_name).toBe(columns[1]);
    }
  });

  it("prefers explicit student header over generic Name, but refuses ambiguous student identities",()=>{
    const chosen=suggestColumnMapping(["Name","Student Name","Parent Name"]);
    expect(chosen.student_name).toBe("Student Name");
    expect(chosen.guardian_name).toBe("Parent Name");
    expect(suggestColumnMapping(["Child Name","Student Name"]).student_name).toBeUndefined();
    expect(suggestColumnMapping(["Student Name","Student Name"])
      .student_name).toBeUndefined();
  });

  it("does not arbitrarily select one of multiple email or guardian contact columns",()=>{
    const mapping=suggestColumnMapping(["Student Name","Email","Parent Email","Guardian Name","Parent Name"]);
    expect(mapping.student_name).toBe("Student Name");
    expect(mapping.email).toBeUndefined();
    expect(mapping.guardian_name).toBeUndefined();
  });

  it("maps a lone Name column to student_name", () => {
    const mapping = suggestColumnMapping(["Name", "Email"]);
    expect(mapping.student_name).toBe("Name");
    expect(mapping.email).toBe("Email");
  });
});

describe("normalizeImportRows", () => {
  it("skips blank rows and parses US dates", () => {
    const mapping = suggestColumnMapping([
      "Student Name",
      "Email",
      "Birthdate",
    ]);
    const { rows, issues } = normalizeImportRows(
      [
        {
          "Student Name": "Alex",
          Email: "a@example.com",
          Birthdate: "4/12/2015",
        },
        { "Student Name": "", Email: "", Birthdate: "" },
        {
          "Student Name": "",
          Email: "orphan@example.com",
          Birthdate: "",
        },
      ],
      mapping
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].studentName).toBe("Alex");
    expect(rows[0].birthdate).toBe("2015-04-12");
    expect(issues.some((i) => i.message.includes("Missing student name"))).toBe(
      true
    );
  });
  it("recognizes explicit Hebrew and Russian archive flags without guessing", () => {
    const he=suggestColumnMapping(["שם התלמיד","בארכיון"]);
    const ru=suggestColumnMapping(["Имя ученика","В архиве"]);
    const a=normalizeImportRows([{"שם התלמיד":"תלמיד קודם","בארכיון":"כן"},
       {"שם התלמיד":"תלמיד פעיל","בארכיון":"לא"}],he);
    expect(a.rows.map(r=>r.archived)).toEqual([true,false]);
    const b=normalizeImportRows([{"Имя ученика":"Бывший","В архиве":"в архиве"},
      {"Имя ученика":"Текущий","В архиве":"нет"},
      {"Имя ученика":"Неизвестный","В архиве":"может быть"}],ru);
    expect(b.rows.map(r=>r.archived)).toEqual([true,false]);
    expect(b.issues).toHaveLength(1);
  });

  it("recognizes archived and active spreadsheet values and rejects unknown statuses", () => {
    const mapping = suggestColumnMapping(["Student Name", "Archived"]);
    expect(mapping.archived).toBe("Archived");
    const { rows, issues } = normalizeImportRows(
      [
        { "Student Name": "Former pupil", Archived: "inactive" },
        { "Student Name": "Current pupil", Archived: "no" },
        { "Student Name": "Ambiguous pupil", Archived: "sometimes" },
      ],
      mapping
    );
    expect(rows.map(({ studentName, archived }) => ({ studentName, archived }))).toEqual([
      { studentName: "Former pupil", archived: true },
      { studentName: "Current pupil", archived: false },
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ row: 4, message: expect.stringContaining("Unknown archive status") }),
    ]);
  });

});

describe("familyGroupKey", () => {
  it("groups siblings by email", () => {
    const a: NormalizedImportRow = {
      studentName: "Alex",
      birthdate: null,
      level: null,
      teacherNotes: null,
      archived: false,
      guardianName: "Jordan",
      familyName: null,
      email: "jordan@example.com",
      phone: null,
      secondaryName: null,
      secondaryEmail: null,
      secondaryPhone: null,
      sourceRow: 2,
    };
    const b = { ...a, studentName: "Sam", sourceRow: 3 };
    expect(familyGroupKey(a)).toBe(familyGroupKey(b));
  });
});

describe("parseDelimitedText", () => {
  it("parses CSV with headers", () => {
    const { headers, rows } = parseDelimitedText(
      "Student Name,Email\nAlex,a@example.com\n"
    );
    expect(headers).toEqual(["Student Name", "Email"]);
    expect(rows[0]["Student Name"]).toBe("Alex");
  });
});
