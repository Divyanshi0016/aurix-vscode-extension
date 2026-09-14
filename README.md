# AURIX VS Code Extension 

Scaffold for the "IDE & Integration Engineer" role.

## Connecting to real backend

1. Base URL is already set as the default: `https://major-project-yo0n.onrender.com`
   — this is set in `aurix.apiEndpoint`. **Do not** point it at any
   `/api/internal/webhook/...` path — that's server-to-server only, between
   backend and AWS worker.
2. You need a **Project ID** before you can scan. Run `AURIX: Set Project ID`
   and paste the UUID.
3. Log in with `AURIX: Login` using real AURIX credentials.
4. Run a scan. First request may be slow (~30-60s) if Render's free tier has
   spun the server down from inactivity — that's normal, not a bug.

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
