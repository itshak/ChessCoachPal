# Design — chess learning fundamentals

## Current fresh-install schema

- Teacher-owned skill categories: stable ID, name, optional description and ordering; configurable beyond sensible chess defaults.
- Teacher-scoped student/session observations: student ID, optional session/workplace, skill category, text, observed timestamp, author/source and verified state. Teacher approval preserves provenance.
- Learning resource links: teacher ID, optional student/session, label, HTTPS URL, resource type (selected Lichess Study or generic), optional provider study/chapter ID, created/updated timestamps.

Join all records using teacher/workplace authorization and real Supabase RLS. Student-specific observations in one workplace cannot leak through another workplace's private report.

## Read and write path

Build a small Learning panel in the web student/session views with observation history, category editor, verified/suggested distinction, safe add/edit controls and resource links. Reuse the shared teacher-owned domain service for any future AI tool in milestone 2; never grant a model the ability to declare its own suggestion teacher-verified.

Do not server-fetch arbitrary user URLs as a proxy. Validate HTTPS and safe provider identifiers; leave full external content on its provider. Outage of Lichess cannot break internal student records.

## Verification

Use synthetic studies and observations, with no mandatory network provider in CI. Test correction/reload, teacher B isolation, unverified-to-verified explicit approval, invalid URLs and fallback when the link target is unavailable. Record evidence in docs/STATUS.md.

ADR-0001 applies: no CogNote assessment migration or older ChessCoachPal schema compatibility.

