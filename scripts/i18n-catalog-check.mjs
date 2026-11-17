#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const root = resolve(import.meta.dirname, "..");
const langs = ["en", "he", "ru"];
const messages = Object.fromEntries(langs.map(lang => [
  lang, JSON.parse(readFileSync(resolve(root, "i18n/messages", lang + ".json"), "utf8"))
]));
function flatten(value, prefix = "") {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? prefix + "." + key : key;
    if (typeof child === "string") return [[path, child]];
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return Object.entries(flatten(child, path));
    }
    throw new Error("Invalid message type at " + path);
  }));
}
const flat = Object.fromEntries(langs.map(lang => [lang, flatten(messages[lang])]));
const base = Object.keys(flat.en).sort();
const errors = [];
// ICU plurals may repeat the same placeholder in one/few/many/other branches.
// Compare the unique variable names, not the number of occurrences.
const params = text => [...new Set(Array.from(text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g))
  .map(match => match[1]))].sort().join(",");
for (const lang of langs) {
  const keys = Object.keys(flat[lang]).sort();
  for (const key of base.filter(key => !(key in flat[lang]))) errors.push(lang + ": missing " + key);
  for (const key of keys.filter(key => !(key in flat.en))) errors.push(lang + ": unexpected " + key);
  for (const key of base) {
    const translation = flat[lang][key];
    if (typeof translation !== "string") continue;
    if (!translation.trim()) errors.push(lang + ": blank message " + key);
    if (params(translation) !== params(flat.en[key])) errors.push(lang + ": interpolation mismatch " + key);
  }
}
if (errors.length) {
  console.error("i18n catalog validation failed:\n" + errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("i18n catalogs: " + langs.join(", ") + " — " + base.length +
    " messages each, all keys and placeholders agree");
}
