import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";

// Fast, infrastructure-free guard. Parsing and actual GoTrue SMTP delivery
// must additionally be tested against the pinned auth image before release.
const flows=["invite","confirmation","recovery","email_change","magic_link","reauthentication"];
for(const flow of flows){
  const html=readFileSync(join("public","auth-email-templates",flow+".html"),"utf8");
  assert.ok(html.startsWith('{{ if eq .Data.preferred_locale "he" }}'),flow);
  assert.ok(html.includes('{{ else if eq .Data.preferred_locale "ru" }}'),flow);
  assert.ok(html.includes('{{ else }}')&&html.trimEnd().endsWith('{{ end }}'),flow);
  for(const [locale,dir] of [["en","ltr"],["he","rtl"],["ru","ltr"]])
    assert.ok(html.includes(`lang="${locale}" dir="${dir}"`),`${flow}: missing ${locale} body/direction`);
  assert.match(html,/[\u0590-\u05ff]/u,`${flow}: Hebrew missing`);
  assert.match(html,/[\u0400-\u052f]/u,`${flow}: Russian missing`);
  assert.ok(html.includes(flow==="reauthentication"?"{{ .Token }}":"{{ .ConfirmationURL }}"),
    `${flow}: cannot perform auth flow`);
  assert.doesNotMatch(html,/AUTH_SMTP_PASS|RESEND_API_KEY|BETA_ACCESS_CODE|SERVICE_ROLE_KEY/,
    `${flow}: secret name leaked`);
  const localConfig=readFileSync(join("supabase","config.toml"),"utf8");
  assert.ok(localConfig.includes(`[auth.email.template.${flow}]`),
    `Supabase CLI does not load ${flow} template`);
  assert.ok(localConfig.includes(`content_path = "./public/auth-email-templates/${flow}.html"`),
    `Supabase CLI project-root path differs from HTML assets`);
  for(const compose of ["docker-compose.coolify.yml","docker-compose.example.yml"]){
    const yml=readFileSync(compose,"utf8");
    assert.ok(yml.includes(`GOTRUE_MAILER_TEMPLATES_${flow.toUpperCase()}:`),
      `${compose}: ${flow} template not wired`);
    assert.ok(yml.includes(`GOTRUE_MAILER_SUBJECTS_${flow.toUpperCase()}:`),
      `${compose}: ${flow} subject not wired`);
  }
}
console.log(`Auth email templates: ${flows.length} flows, 3 locales each, static Compose URL/subject coverage valid`);
