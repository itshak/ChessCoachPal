import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(new URL('./contacts-schema.sql', import.meta.url), 'utf8');
const docs = readFileSync(new URL('./README.md', import.meta.url), 'utf8');

test('contacts and billing accounts have separate identities and tenant owner keys', () => {
  for (const table of ['contacts', 'student_contacts', 'billing_accounts']) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table} \\(`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`CREATE POLICY ${table}_teacher`));
  }
  assert.match(sql, /FOREIGN KEY \(teacher_id,student_id\) REFERENCES public\.students\(teacher_id,id\)/);
  assert.match(sql, /FOREIGN KEY \(teacher_id,contact_id\) REFERENCES public\.contacts\(teacher_id,id\)/);
  assert.match(sql, /FOREIGN KEY \(teacher_id,billing_account_id\) REFERENCES public\.billing_accounts\(teacher_id,id\)/);
});

test('contact association does not automatically confer email or portal access', () => {
  assert.match(sql, /may_receive_messages boolean NOT NULL DEFAULT false/);
  assert.doesNotMatch(sql, /CREATE POLICY .*portal|portal_token/i);
  assert.match(sql, /REVOKE ALL ON public\.guardian_contact_transition FROM anon, authenticated/);
});

test('staging artifact explicitly forbids standalone deployment', () => {
  assert.match(docs, /not a deployable migration/i);
  assert.match(docs, /must not be archived or deployed/i);
});
