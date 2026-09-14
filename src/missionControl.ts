import * as vscode from "vscode";
import { Finding } from "./apiConnector";
import { calculateScorecard } from "./scorecard";
import { escapeHtml } from "./attackPathWebview";
import { logger } from "./outputLogger";

export interface LogMessage {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
}

export class MissionControlManager {
  private panel?: vscode.WebviewPanel;
  private logs: LogMessage[] = [];
  private findings: Finding[] = [];
  private isScanning: boolean = false;
  private currentScanLabel: string = "";
  private hasScanned: boolean = false;

  constructor(private context: vscode.ExtensionContext) {
    // Intercept or hook outputLogger if desired
    this.addLog("INFO", "AURIX Mission Control Initialized.");
  }

  showPanel(onMessageCallback?: (msg: any) => void) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "aurixMissionControl",
      "🛡️ AURIX Mission Control",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    if (onMessageCallback) {
      this.panel.webview.onDidReceiveMessage(onMessageCallback);
    }

    this.render();
  }

  addLog(level: "INFO" | "WARN" | "ERROR", message: string) {
    const timeStr = new Date().toLocaleTimeString();
    const logItem: LogMessage = { timestamp: timeStr, level, message };
    this.logs.push(logItem);
    if (this.logs.length > 500) this.logs.shift();

    if (this.panel) {
      this.panel.webview.postMessage({ type: "newLog", log: logItem });
    }
  }

  setScanning(scanning: boolean, label?: string) {
    this.isScanning = scanning;
    this.currentScanLabel = label ?? "Scanning...";
    this.render();
  }

  setFindings(findings: Finding[]) {
    this.findings = findings;
    this.hasScanned = true;
    this.isScanning = false;
    this.render();
  }

  private render() {
    if (!this.panel) return;
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const scorecard = calculateScorecard(this.findings);
    const folderName = vscode.workspace.workspaceFolders?.[0]?.name ?? "Workspace";

    const findingsRows = this.findings.map((f) => {
      const loc = f.file ?? f.file_path ? `${escapeHtml(f.file ?? f.file_path ?? "")}:${f.line ?? f.line_number ?? 1}` : "";
      return `
      <div class="finding-card ${f.severity.toLowerCase()}">
        <div class="finding-top">
          <span class="sev-badge ${f.severity.toLowerCase()}">${f.severity}</span>
          <span class="finding-title">${escapeHtml(f.title)}</span>
          ${f.wargame_status ? `<span class="status-badge">${escapeHtml(f.wargame_status)}</span>` : ""}
        </div>
        <div class="finding-sub">${loc ? `<code>${loc}</code>` : ""}</div>
        <div class="finding-desc">${escapeHtml(f.ai_reasoning ?? f.description ?? "")}</div>
        <div class="finding-actions">
          <button class="btn ghost tiny" onclick="send('viewAttackPath', '${f.id}')">Attack Path</button>
          ${f.patch_code ? `<button class="btn primary tiny" onclick="send('reviewPatch', '${f.id}')">👀 Review Patch</button>` : ""}
          ${f.patch_code ? `<button class="btn success tiny" onclick="send('applyPatch', '${f.id}')">⚡ Apply Patch</button>` : ""}
        </div>
      </div>`;
    }).join("");

    const logsHtml = this.logs
      .map(
        (l) =>
          `<div class="log-line ${l.level.toLowerCase()}"><span class="ts">[${l.timestamp}]</span> <span class="lvl">[${l.level}]</span> ${escapeHtml(l.message)}</div>`
      )
      .join("");

    const patchableCount = this.findings.filter((f) => !!f.patch_code).length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AURIX Mission Control Dashboard</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --panel-border: #1f2937;
      --text: #e5e7eb;
      --text-muted: #9ca3af;
      --accent-cyan: #00d9f6;
      --accent-green: #00f5a0;
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      background-color: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 20px;
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      background: var(--card-bg);
      padding: 16px 20px;
      border-radius: 12px;
      border: 1px solid var(--panel-border);
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      background: linear-gradient(90deg, #00d9f6, #00f5a0);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .action-group {
      display: flex;
      gap: 10px;
    }
    .btn {
      padding: 8px 14px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      border: 1px solid transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn.primary { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; }
    .btn.success { background: linear-gradient(135deg, #059669, #10b981); color: white; }
    .btn.warning { background: linear-gradient(135deg, #d97706, #f59e0b); color: white; }
    .btn.ghost { background: transparent; border-color: var(--panel-border); color: var(--text); }
    .btn.tiny { padding: 4px 8px; font-size: 11px; }
    .btn:hover { opacity: 0.9; transform: translateY(-1px); }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 20px;
    }
    .card-title {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Scorecard */
    .scorecard {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .badge {
      width: 80px;
      height: 80px;
      border-radius: 14px;
      background: ${scorecard.gradient};
      color: ${scorecard.textColor};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      font-weight: 900;
      box-shadow: 0 4px 20px ${scorecard.shadowColor};
      animation: pulse 2s infinite ease-in-out;
      flex-shrink: 0;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.03); }
    }
    .score-info h3 { margin: 0 0 4px 0; font-size: 18px; }
    .score-info p { margin: 0; font-size: 13px; color: var(--text-muted); }

    /* Live Terminal Console */
    .terminal-container {
      background: #030712;
      border: 1px solid #1f2937;
      border-radius: 8px;
      padding: 12px;
      font-family: SFMono-Regular, Consolas, monospace;
      font-size: 12px;
      height: 280px;
      overflow-y: auto;
      color: #34d399;
      box-shadow: inset 0 2px 8px rgba(0,0,0,0.6);
    }
    .log-line { margin-bottom: 4px; line-height: 1.4; word-break: break-all; }
    .log-line .ts { color: #6b7280; }
    .log-line .lvl { color: #60a5fa; font-weight: bold; }
    .log-line.warn .lvl { color: #fbbf24; }
    .log-line.error .lvl { color: #f87171; }
    .log-line.error { color: #f87171; }

    /* Spinner loader */
    .spinner-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(0, 217, 246, 0.1);
      border: 1px solid rgba(0, 217, 246, 0.3);
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      color: #00d9f6;
    }
    .spinner {
      width: 18px;
      height: 18px;
      border: 3px solid rgba(0, 217, 246, 0.2);
      border-top-color: #00d9f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .finding-card {
      background: #1f2937;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
      border-left: 4px solid var(--panel-border);
    }
    .finding-card.critical { border-left-color: #ef4444; }
    .finding-card.high { border-left-color: #f97316; }
    .finding-card.medium { border-left-color: #eab308; }
    .finding-card.low { border-left-color: #06b6d4; }

    .finding-top { display: flex; align-items: center; gap: 8px; font-weight: 600; }
    .sev-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; color: white; }
    .sev-badge.critical { background: #ef4444; }
    .sev-badge.high { background: #f97316; }
    .sev-badge.medium { background: #eab308; color: black; }
    .sev-badge.low { background: #06b6d4; color: black; }

    .finding-sub { margin: 4px 0; font-size: 11px; color: var(--text-muted); }
    .finding-desc { font-size: 12px; color: var(--text); margin: 6px 0; }
    .finding-actions { display: flex; gap: 6px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="top-bar">
    <div class="brand-title">
      🛡️ AURIX Mission Control
      <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">(${escapeHtml(folderName)})</span>
    </div>
    <div class="action-group">
      <button class="btn primary" onclick="send('scanWorkspace')">🚀 Scan Workspace</button>
      ${patchableCount > 0 ? `<button class="btn warning" onclick="send('autoFixAll')">⚡ Auto-Fix All (${patchableCount})</button>` : ""}
      <button class="btn ghost" onclick="send('exportReport')">📊 Export HTML Report</button>
      <button class="btn ghost" onclick="send('viewHistory')">📜 View History</button>
    </div>
  </div>

  ${
    this.isScanning
      ? `<div class="spinner-bar"><div class="spinner"></div><span>${escapeHtml(this.currentScanLabel)}</span></div>`
      : ""
  }

  <div class="grid">
    <div class="main-content">
      <div class="card">
        <div class="card-title">
          <span>Security Scorecard</span>
          <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">Workspace Health</span>
        </div>
        <div class="scorecard">
          <div class="badge">${scorecard.grade}</div>
          <div class="score-info">
            <h3>Grade ${scorecard.grade} (${scorecard.score}/100)</h3>
            <p>${escapeHtml(scorecard.label)}</p>
            <div style="margin-top: 8px; font-size: 12px; display: flex; gap: 12px;">
              <span>🚨 ${scorecard.criticalCount} Critical</span>
              <span>⚠️ ${scorecard.highCount} High</span>
              <span>⚡ ${scorecard.mediumCount} Medium</span>
              <span>ℹ️ ${scorecard.lowCount} Low</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span>Detected Vulnerabilities (${this.findings.length})</span>
        </div>
        <div>
          ${
            this.findings.length > 0
              ? findingsRows
              : this.hasScanned
              ? '<p style="color: var(--text-muted);">No security issues found! 🎉</p>'
              : '<p style="color: var(--text-muted);">No scan executed yet. Click "Scan Workspace" to start scanning.</p>'
          }
        </div>
      </div>
    </div>

    <div class="side-content">
      <div class="card">
        <div class="card-title">
          <span style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #00f5a0; box-shadow: 0 0 8px #00f5a0; animation: pulse 1.5s infinite ease-in-out;"></span>
            📟 Live AI Backend Stream
          </span>
          <button class="btn ghost tiny" onclick="clearLogs()">Clear</button>
        </div>
        <div class="terminal-container" id="terminal">
          ${logsHtml}
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const terminal = document.getElementById('terminal');

    function send(type, id) {
      vscode.postMessage({ type, id });
    }

    function clearLogs() {
      terminal.innerHTML = '';
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'newLog') {
        const div = document.createElement('div');
        div.className = 'log-line ' + msg.log.level.toLowerCase();
        div.innerHTML = '<span class="ts">[' + msg.log.timestamp + ']</span> <span class="lvl">[' + msg.log.level + ']</span> ' + escapeHtml(msg.log.message);
        terminal.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
      }
    });

    function escapeHtml(s) {
      return (s || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    terminal.scrollTop = terminal.scrollHeight;
  </script>
</body>
</html>`;
  }
}
