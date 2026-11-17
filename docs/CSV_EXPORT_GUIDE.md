# Portable CSV export — website and MCP

The existing full JSON backup remains the **only restore format**. It is
available from Account → Export & Import or `ccp_settings_export` (small,
redacted MCP response). CSV is intended for analysis and moving data to
spreadsheets, **not reimporting as a database backup**.

- Website: Account → **Export all data as CSV ZIP** (authenticated
  `GET /api/settings/export?format=csv`). A ZIP contains one UTF-8 CSV per
  domain table and a README manifest with row counts, including archived
  student history and dated/aggregate historical evidence.
- MCP: `ccp_settings_export_csv({"confirmed":true})` lists exact available
  table names and counts. Fetch each using e.g.
  `{"confirmed":true,"table":"students","offset":0,"limit":100}`.
  Continue from `nextOffset` until null; each response contains a header and
  only that page's data. The model interface cannot download a full ZIP.
- Security: family portal login tokens, provider keys, OAuth secrets and
  credentials are not included in CSV. No raw binary objects. Spreadsheet
  formula-leading values are encoded as literal text to reduce CSV injection.
  Treat exported CSVs as private student/guardian data.
- Completeness: the server gathers all supported teacher-owned tables using
  the existing bounded, failure-on-error full export; no silent 1,000-row
  PostgREST truncation. An overlarge table fails explicitly rather than
  offering a misleading partial archive.
