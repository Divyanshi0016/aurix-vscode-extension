# AURIX VS Code Extension — Divyanshi's Component

Scaffold for the "IDE & Integration Engineer" role, updated to match the
**VS Code Extension Integration Roadmap** exactly (upload field names,
status values, project_id requirement).

## Connecting to Bhavya's real backend

1. Base URL is already set as the default: `https://major-project-yo0n.onrender.com`
   — this is set in `aurix.apiEndpoint`. **Do not** point it at any
   `/api/internal/webhook/...` path — that's server-to-server only, between
   Bhavya's backend and Divyansh's AWS worker.
2. You need a **Project ID** before you can scan. Run `AURIX: Set Project ID`
   and paste the UUID (ask Bhavya/Bhumika how a project gets created — likely
   via the Web Dashboard first).
3. Log in with `AURIX: Login` using real AURIX credentials.
4. Run a scan. First request may be slow (~30-60s) if Render's free tier has
   spun the server down from inactivity — that's normal, not a bug.

## What changed from earlier drafts, per the real roadmap doc

| Item | Old assumption | Actual (roadmap) |
|---|---|---|
| Upload form field | `file` | `source_code` (+ required `project_id`) |
| Upload success status | 200 | 202 Accepted |
| Poll response shape | `{status, report: {...}}` | flat: `{scan_id, status, findings, summary, ...}` |
| Status values | `queued/running/completed/failed` | `PENDING/SCANNING/COMPLETED/FAILED` |
| Upload size limit | none enforced | 10MB — now checked client-side before upload (`aurix.maxUploadMb`) |
| Typical scan time | assumed short | 2-3 min typical (roadmap) — some team docs say up to 15 min; timeout defaults to 300s, raise via `aurix.scanTimeout` if needed |

**Still unconfirmed with the team:** exactly how a `project_id` is created
and where its UUID is surfaced to the user — nothing in the docs says this
yet. Ask Bhavya/Bhumika before your first real scan.

**Field-name discrepancy to watch:** the roadmap PDF prose says findings use
`file_path`/`line_number`, but the real sample JSON from Divyansh's engine
uses `file`/`line`. This client (`apiConnector.ts`) supports both defensively
via `findingFile()`/`findingLine()` helpers, but confirm which one the live
backend actually sends so you're not silently relying on a fallback.

## Local mock backend (still works, now matches the real contract)

```bash
node mock-server/server.js
```
Returns your real 13-finding sample report after ~8s, using the same field
names, status values, and response shape as the real backend per the
roadmap — so testing locally now accurately predicts real-backend behavior.

## Getting started

```bash
npm install
npm run compile
# F5 in VS Code to launch the Extension Development Host
```

## Component checklist status

| File | Component | Status |
|---|---|---|
| `src/auth.ts` | VS Code Auth Module (SecretStorage) | ✅ |
| `src/packager.ts` | Workspace Packager + 10MB size guard | ✅ |
| `src/apiConnector.ts` | API Connector (upload + polling, real contract) | ✅ |
| `src/secretGuard.ts` | AI-Powered Secret Guard | ✅ regex + AI classify call |
| `src/diagnostics.ts` | IDE Diagnostics UI | ✅ |
| `src/quickFix.ts` | "Quick Fix" Auto-Patcher | ✅ |
| `src/ghostTextPatcher.ts` | "Ghost-Text" inline AI patch streaming | ✅ |
| `src/attackPathWebview.ts` | Attack Path Webview | ✅ |
| `src/outputLogger.ts` | AURIX Output Logger | ✅ |
| `src/config.ts` | Configuration Manager + Project ID prompt | ✅ |
