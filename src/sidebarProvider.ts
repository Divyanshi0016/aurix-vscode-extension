import * as vscode from "vscode";
import * as path from "path";
import { AuthManager } from "./auth";
import { ScanMode } from "./packager";
import { Finding, findingFile, findingLine, findingPatchCode } from "./apiConnector";
import { getApiEndpoint, getProjectId } from "./config";
import { escapeHtml } from "./attackPathWebview";
import { calculateScorecard } from "./scorecard";

type ScanTrigger = (mode: ScanMode) => void;

interface SidebarState {
  isLoggedIn: boolean;
  email?: string;
  projectId: string;
  apiEndpoint: string;
  scanning: boolean;
  scanLabel?: string;
  findings: Finding[];
  hasScanned: boolean;
}

const SEVERITY_ORDER: Finding["severity"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export class AurixSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "aurixSidebar";

  private view?: vscode.WebviewView;
  private state: SidebarState = {
    isLoggedIn: false,
    projectId: getProjectId(),
    apiEndpoint: getApiEndpoint(),
    scanning: false,
    findings: [],
    hasScanned: false,
  };

  constructor(private readonly auth: AuthManager, private readonly onScanRequested: ScanTrigger) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(async (msg: { type: string; id?: string; mode?: ScanMode }) => {
      switch (msg.type) {
        case "login":
          await vscode.commands.executeCommand("aurix.login");
          break;
        case "logout":
          await vscode.commands.executeCommand("aurix.logout");
          break;
        case "setProjectId":
          await vscode.commands.executeCommand("aurix.setProjectId");
          break;
        case "scan":
          if (msg.mode) this.onScanRequested(msg.mode);
          break;
        case "openFinding":
          if (msg.id) await this.openFinding(msg.id);
          break;
        case "viewAttackPath":
          if (msg.id) await vscode.commands.executeCommand("aurix.showAttackPath", msg.id);
          break;
        case "reviewPatch":
          if (msg.id) {
            const f = this.findingById(msg.id);
            if (f) await vscode.commands.executeCommand("aurix.reviewPatch", f);
          }
          break;
        case "applyPatch":
          if (msg.id) await this.applyPatchById(msg.id);
          break;
        case "autoFixAll":
          await vscode.commands.executeCommand("aurix.autoFixAll");
          break;
        case "exportReport":
          await vscode.commands.executeCommand("aurix.exportHtmlReport");
          break;
        case "openMissionControl":
          await vscode.commands.executeCommand("aurix.openMissionControl");
          break;
        case "openUserGuide":
          await vscode.commands.executeCommand("aurix.openUserGuide");
          break;
        case "viewHistory":
          await vscode.commands.executeCommand("aurix.viewHistory");
          break;
      }
    });

    this.render();
  }

  async refresh(): Promise<void> {
    const token = await this.auth.getToken();
    this.state.isLoggedIn = !!token;
    this.state.email = token ? await this.auth.getEmail() : undefined;
    this.state.projectId = getProjectId();
    this.state.apiEndpoint = getApiEndpoint();
    this.render();
  }

  setScanning(scanning: boolean, label?: string): void {
    this.state.scanning = scanning;
    this.state.scanLabel = label;
    this.render();
  }

  setFindings(findings: Finding[]): void {
    this.state.findings = findings;
    this.state.hasScanned = true;
    this.render();
  }

  private findingById(id: string): Finding | undefined {
    return this.state.findings.find((f) => f.id === id);
  }

  private locate(finding: Finding): { uri: vscode.Uri; range: vscode.Range } | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return undefined;

    const relFile = findingFile(finding).replace(/^\/+/, "");
    if (!relFile) return undefined;

    const absPath = path.join(folders[0].uri.fsPath, relFile);
    const lineIdx = Math.max(findingLine(finding) - 1, 0);
    const range = new vscode.Range(new vscode.Position(lineIdx, 0), new vscode.Position(lineIdx, Number.MAX_SAFE_INTEGER));
    return { uri: vscode.Uri.file(absPath), range };
  }

  private async openFinding(id: string): Promise<void> {
    const finding = this.findingById(id);
    if (!finding) return;
    const loc = this.locate(finding);
    if (!loc) {
      vscode.window.showWarningMessage("AURIX: this finding has no file location to open.");
      return;
    }
    await vscode.window.showTextDocument(loc.uri, { selection: loc.range });
  }

  private async applyPatchById(id: string): Promise<void> {
    const finding = this.findingById(id);
    if (!finding) return;
    const loc = this.locate(finding);
    if (!loc) {
      vscode.window.showWarningMessage("AURIX: this finding has no file location to patch.");
      return;
    }
    await vscode.commands.executeCommand("aurix.applyPatch", loc.uri, loc.range, finding);
  }

  private render(): void {
    if (!this.view) return;
    this.view.webview.html = this.html();
  }

  private html(): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

    return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>${CSS}</style>
</head>
<body>
  ${this.headerHtml()}
  ${this.scorecardHtml()}
  ${this.accountHtml()}
  ${this.scanHtml()}
  ${this.findingsHtml()}
  <script nonce="${nonce}">${CLIENT_JS}</script>
</body>
</html>`;
  }

  private headerHtml(): string {
    return /* html */ `
    <header class="brand">
      <svg class="brand-mark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2 4 5.5v6c0 5.2 3.4 9.4 8 10.5 4.6-1.1 8-5.3 8-10.5v-6L12 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="m9 12 2 2 4-4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div>
        <div class="brand-name">AURIX Security</div>
        <div class="brand-sub">AI Workspace Scanner</div>
      </div>
      <div style="margin-left:auto; display:flex; gap:4px;">
        <button class="btn ghost tiny" data-action="openUserGuide" title="Open User Tour & Guide">❓ Tour</button>
        <button class="btn ghost tiny" data-action="openMissionControl" title="Open Dashboard">🚀 Dashboard</button>
      </div>
    </header>`;
  }

  private scorecardHtml(): string {
    if (!this.state.hasScanned && this.state.findings.length === 0) return "";
    const score = calculateScorecard(this.state.findings);

    return /* html */ `
    <section class="card scorecard-card">
      <div class="scorecard-container">
        <div class="score-badge" style="background:${score.gradient};color:${score.textColor};box-shadow: 0 4px 14px ${score.shadowColor};">
          ${score.grade}
        </div>
        <div class="score-details">
          <div class="score-title">Grade ${score.grade} (${score.score}/100)</div>
          <div class="score-label">${escapeHtml(score.label)}</div>
        </div>
      </div>
    </section>`;
  }

  private accountHtml(): string {
    const s = this.state;
    return /* html */ `
    <section class="card">
      <div class="row spread">
        <div class="status-dot ${s.isLoggedIn ? "on" : "off"}"></div>
        <div class="grow">
          ${
            s.isLoggedIn
              ? `<div class="label">Signed in</div><div class="value">${escapeHtml(s.email ?? "")}</div>`
              : `<div class="label">Not signed in</div><div class="value muted">Sign in to run scans</div>`
          }
        </div>
        <button class="btn ${s.isLoggedIn ? "ghost" : "primary"}" data-action="${s.isLoggedIn ? "logout" : "login"}">
          ${s.isLoggedIn ? "Sign out" : "Sign in"}
        </button>
      </div>
      <div class="row spread project-row">
        <div class="grow">
          <div class="label">Project ID</div>
          <div class="value mono">${s.projectId ? escapeHtml(s.projectId) : "Not set"}</div>
        </div>
        <button class="btn ghost" data-action="setProjectId">${s.projectId ? "Change" : "Set"}</button>
      </div>
    </section>`;
  }

  private scanHtml(): string {
    const s = this.state;
    const disabled = !s.isLoggedIn || s.scanning;
    const patchableCount = s.findings.filter((f) => !!findingPatchCode(f)).length;

    const scanBtn = (mode: ScanMode, label: string) =>
      `<button class="btn scan-btn" data-action="scan" data-mode="${mode}" ${disabled ? "disabled" : ""}>${label}</button>`;

    return /* html */ `
    <section class="card">
      <div class="scan-buttons">
        ${scanBtn("activeFile", "Scan Active File")}
        ${scanBtn("workspace", "Scan Full Workspace")}
        ${scanBtn("stagedChanges", "Scan Staged Changes")}
      </div>
      ${
        patchableCount > 0
          ? `<button class="btn warning-btn" data-action="autoFixAll" style="margin-top:8px;width:100%;">⚡ Auto-Fix All (${patchableCount} Patches)</button>`
          : ""
      }
      <div class="quick-tools">
        <button class="btn ghost tiny" data-action="exportReport">📊 Export HTML Report</button>
        <button class="btn ghost tiny" data-action="viewHistory">📜 Scan History</button>
      </div>
      ${
        s.scanning
          ? `<div class="scan-status"><span class="spinner"></span>${escapeHtml(s.scanLabel ?? "Scanning…")}</div>`
          : ""
      }
    </section>`;
  }

  private findingsHtml(): string {
    const s = this.state;
    const counts = new Map<string, number>();
    for (const f of s.findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);

    const chips = SEVERITY_ORDER.filter((sev) => counts.get(sev)).map(
      (sev) => `<span class="chip ${sev.toLowerCase()}">${counts.get(sev)} ${titleCase(sev)}</span>`
    );

    const sorted = [...s.findings].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    );

    let body: string;
    if (s.scanning) {
      body = "";
    } else if (!s.hasScanned) {
      body = /* html */ `
      <div class="card tour-card">
        <div style="font-weight: 700; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; color: var(--vscode-textLink-foreground);">
          🗺️ Quick User Tour — How to Use AURIX
        </div>
        <div style="font-size: 11.5px; line-height: 1.5; color: var(--vscode-descriptionForeground);">
          <div style="margin-bottom: 6px;"><b>1. Sign In</b>: Click the <b>Sign in</b> button above to authenticate with Supabase.</div>
          <div style="margin-bottom: 6px;"><b>2. Select Scan Mode</b>: Click <b>Scan Active File</b> or <b>Scan Full Workspace</b> above.</div>
          <div style="margin-bottom: 6px;"><b>3. Auto-Fix</b>: View detected vulnerabilities and click <b>⚡ Apply</b> or <b>⚡ Auto-Fix All</b> to automatically patch code!</div>
          <div style="margin-bottom: 4px;"><b>4. Mission Control</b>: Click <b>🚀 Dashboard</b> at top right for live AI execution logs & scorecards.</div>
        </div>
        <button class="btn primary tiny" data-action="openUserGuide" style="margin-top: 8px; width: 100%;">📖 Launch Full Guided User Tour</button>
      </div>`;
    } else if (sorted.length === 0) {
      body = `<div class="empty">No verified vulnerabilities found. 🎉</div>`;
    } else {
      body = sorted.map((f) => this.findingRowHtml(f)).join("");
    }

    return /* html */ `
    <section class="findings">
      <div class="findings-header">
        <span class="section-title">Findings${s.hasScanned ? ` (${s.findings.length})` : ""}</span>
        <div class="chips">${chips.join("")}</div>
      </div>
      <div class="findings-list">${body}</div>
    </section>`;
  }

  private findingRowHtml(f: Finding): string {
    const status = f.wargame_status;
    const location = findingFile(f) ? `${escapeHtml(shortenPath(findingFile(f)))}:${findingLine(f)}` : "";

    return /* html */ `
    <div class="finding" data-id="${escapeHtml(f.id)}">
      <div class="finding-main" data-action="openFinding" data-id="${escapeHtml(f.id)}">
        <span class="sev-dot ${f.severity.toLowerCase()}" title="${f.severity}"></span>
        <div class="finding-text">
          <div class="finding-title">${escapeHtml(f.title)}</div>
          <div class="finding-meta">
            ${location ? `<span class="mono">${location}</span>` : ""}
            ${status ? `<span class="status-badge ${statusClass(status)}">${escapeHtml(status)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="finding-actions">
        <button class="btn tiny ghost" data-action="viewAttackPath" data-id="${escapeHtml(f.id)}">Attack Path</button>
        ${
          findingPatchCode(f)
            ? `<button class="btn tiny ghost" data-action="reviewPatch" data-id="${escapeHtml(f.id)}">👀 Review</button>`
            : ""
        }
        ${
          findingPatchCode(f)
            ? `<button class="btn tiny primary" data-action="applyPatch" data-id="${escapeHtml(f.id)}">⚡ Apply</button>`
            : ""
        }
      </div>
    </div>`;
  }
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  return parts.length > 3 ? `…/${parts.slice(-2).join("/")}` : p;
}

function statusClass(status: string): string {
  if (status === "Neutralized") return "ok";
  if (status === "Exploit Confirmed") return "bad";
  return "warn";
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

const CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    padding: 0 0 16px 0;
    margin: 0;
  }
  .brand {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 14px 10px 14px;
  }
  .brand-mark { width: 22px; height: 22px; color: var(--vscode-textLink-foreground); flex-shrink: 0; }
  .brand-name { font-weight: 600; letter-spacing: 0.03em; font-size: 13px; }
  .brand-sub { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 1px; }

  .card { margin: 0 14px 12px 14px; padding: 10px 12px; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 4px; }
  
  .scorecard-card { padding: 12px; }
  .scorecard-container { display: flex; align-items: center; gap: 14px; }
  .score-badge { width: 44px; height: 44px; border-radius: 10px; font-size: 20px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .score-title { font-weight: 700; font-size: 13px; }
  .score-label { font-size: 11px; color: var(--vscode-descriptionForeground); }

  .row { display: flex; align-items: center; gap: 8px; }
  .row.spread { justify-content: space-between; }
  .project-row { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
  .grow { flex: 1; min-width: 0; }

  .label { font-size: 10.5px; text-transform: none; color: var(--vscode-descriptionForeground); }
  .value { font-size: 12.5px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value.muted { color: var(--vscode-descriptionForeground); }
  .mono { font-family: var(--vscode-editor-font-family, monospace); font-size: 11.5px; }

  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .status-dot.on { background: var(--vscode-testing-iconPassed, #3fb950); }
  .status-dot.off { background: var(--vscode-descriptionForeground); opacity: 0.5; }

  .btn {
    border: 1px solid transparent; border-radius: 3px; padding: 4px 10px;
    font-size: 12px; cursor: pointer; white-space: nowrap;
    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
  }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn.primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn.ghost { background: transparent; border-color: var(--vscode-widget-border, var(--vscode-panel-border)); color: var(--vscode-foreground); }
  .btn.tiny { padding: 2px 8px; font-size: 11px; }
  .btn:disabled { opacity: 0.45; cursor: default; }

  .warning-btn {
    background: linear-gradient(135deg, #d97706, #f59e0b);
    color: white; border: none; font-weight: bold; border-radius: 4px; padding: 6px; cursor: pointer;
  }

  .quick-tools { display: flex; gap: 6px; margin-top: 8px; justify-content: space-between; }

  .scan-buttons { display: flex; flex-direction: column; gap: 6px; }
  .scan-btn { width: 100%; text-align: left; padding: 6px 10px; }
  .scan-status { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--vscode-descriptionForeground); }

  .spinner {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid var(--vscode-descriptionForeground); border-top-color: transparent;
    animation: spin 0.8s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .findings { margin-top: 4px; }
  .findings-header { display: flex; align-items: center; justify-content: space-between; padding: 0 14px 8px 14px; }
  .section-title { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); }
  .chips { display: flex; gap: 5px; flex-wrap: wrap; }
  .chip { font-size: 10.5px; padding: 1px 7px; border-radius: 9px; border: 1px solid; }
  .chip.critical { color: var(--vscode-editorError-foreground); border-color: var(--vscode-editorError-foreground); }
  .chip.high { color: var(--vscode-editorError-foreground); border-color: var(--vscode-editorError-foreground); opacity: 0.85; }
  .chip.medium { color: var(--vscode-editorWarning-foreground); border-color: var(--vscode-editorWarning-foreground); }
  .chip.low { color: var(--vscode-editorInfo-foreground); border-color: var(--vscode-editorInfo-foreground); }

  .empty { padding: 10px 14px 4px 14px; font-size: 12px; color: var(--vscode-descriptionForeground); }

  .finding { border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); padding: 9px 14px; cursor: default; }
  .finding-main { display: flex; gap: 9px; cursor: pointer; }
  .finding-main:hover .finding-title { text-decoration: underline; }
  .sev-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
  .sev-dot.critical, .sev-dot.high { background: var(--vscode-editorError-foreground); }
  .sev-dot.medium { background: var(--vscode-editorWarning-foreground); }
  .sev-dot.low { background: var(--vscode-editorInfo-foreground); }
  .finding-text { min-width: 0; }
  .finding-title { font-size: 12.5px; line-height: 1.35; }
  .finding-meta { display: flex; gap: 8px; align-items: center; margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; flex-wrap: wrap; }
  .status-badge { padding: 0 6px; border-radius: 8px; border: 1px solid; font-size: 10px; }
  .status-badge.ok { color: var(--vscode-testing-iconPassed, #3fb950); border-color: var(--vscode-testing-iconPassed, #3fb950); }
  .status-badge.bad { color: var(--vscode-editorError-foreground); border-color: var(--vscode-editorError-foreground); }
  .status-badge.warn { color: var(--vscode-editorWarning-foreground); border-color: var(--vscode-editorWarning-foreground); }
  .finding-actions { display: flex; gap: 6px; margin-top: 8px; padding-left: 17px; }
`;

const CLIENT_JS = `
  const vscode = acquireVsCodeApi();
  vscode.postMessage({ type: "ready" });

  document.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const type = el.getAttribute("data-action");
      const id = el.getAttribute("data-id") || undefined;
      const mode = el.getAttribute("data-mode") || undefined;
      vscode.postMessage({ type, id, mode });
    });
  });
`;
