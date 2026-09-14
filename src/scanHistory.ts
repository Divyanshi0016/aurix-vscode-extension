import * as vscode from "vscode";
import { Finding } from "./apiConnector";
import { calculateScorecard, Grade } from "./scorecard";
import { escapeHtml } from "./attackPathWebview";

export interface ScanHistoryRecord {
  id: string;
  timestamp: string;
  workspaceName: string;
  scanMode: string;
  grade: Grade;
  score: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

const HISTORY_KEY = "aurix.scanHistory";
const MAX_HISTORY_ITEMS = 50;

export class ScanHistoryManager {
  constructor(private context: vscode.ExtensionContext) {}

  getHistory(): ScanHistoryRecord[] {
    return this.context.globalState.get<ScanHistoryRecord[]>(HISTORY_KEY, []);
  }

  async recordScan(findings: Finding[], scanMode: string): Promise<ScanHistoryRecord> {
    const score = calculateScorecard(findings);
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? "Workspace";

    const record: ScanHistoryRecord = {
      id: `scan-${Date.now()}`,
      timestamp: new Date().toISOString(),
      workspaceName,
      scanMode,
      grade: score.grade,
      score: score.score,
      totalFindings: score.total,
      criticalCount: score.criticalCount,
      highCount: score.highCount,
      mediumCount: score.mediumCount,
      lowCount: score.lowCount,
    };

    const history = this.getHistory();
    history.unshift(record);
    if (history.length > MAX_HISTORY_ITEMS) {
      history.pop();
    }

    await this.context.globalState.update(HISTORY_KEY, history);
    return record;
  }

  async clearHistory(): Promise<void> {
    await this.context.globalState.update(HISTORY_KEY, []);
  }
}

export function showHistoryPanel(manager: ScanHistoryManager) {
  const panel = vscode.window.createWebviewPanel(
    "aurixHistory",
    "AURIX Scan History",
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const history = manager.getHistory();

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.command === "clear") {
      await manager.clearHistory();
      showHistoryPanel(manager);
      panel.dispose();
    }
  });

  panel.webview.html = renderHistoryHtml(history);
}

function renderHistoryHtml(history: ScanHistoryRecord[]): string {
  const rows = history.map((rec) => {
    const dateStr = new Date(rec.timestamp).toLocaleString();
    let badgeBg = "#00D9F6";
    let badgeColor = "#000";
    if (rec.grade === "A+") { badgeBg = "#00F5A0"; badgeColor = "#0B2B1B"; }
    if (rec.grade === "B") { badgeBg = "#FFD200"; badgeColor = "#3D2B00"; }
    if (rec.grade === "C") { badgeBg = "#FF512F"; badgeColor = "#FFF"; }
    if (rec.grade === "F") { badgeBg = "#FF0055"; badgeColor = "#FFF"; }

    return `
    <div class="history-item">
      <div class="grade-badge" style="background:${badgeBg};color:${badgeColor};">${rec.grade}</div>
      <div class="history-details">
        <div class="history-title">${escapeHtml(rec.workspaceName)} <span class="mode-tag">${escapeHtml(rec.scanMode)}</span></div>
        <div class="history-meta">${dateStr} · Score: ${rec.score}/100</div>
        <div class="pills">
          <span class="pill critical">${rec.criticalCount} Critical</span>
          <span class="pill high">${rec.highCount} High</span>
          <span class="pill medium">${rec.mediumCount} Medium</span>
          <span class="pill low">${rec.lowCount} Low</span>
          <span class="pill total">${rec.totalFindings} Total</span>
        </div>
      </div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 12px; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 20px; }
    .btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; }
    .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .history-list { display: flex; flex-direction: column; gap: 12px; }
    .history-item { display: flex; align-items: center; gap: 16px; background: var(--vscode-welcomePage-tileBackground, #1e1e1e); border: 1px solid var(--vscode-widget-border); padding: 14px; border-radius: 8px; }
    .grade-badge { width: 48px; height: 48px; border-radius: 10px; font-size: 22px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .history-details { flex: 1; }
    .history-title { font-size: 15px; font-weight: 600; }
    .mode-tag { font-size: 11px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
    .history-meta { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 3px; }
    .pills { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .pill { font-size: 11px; padding: 1px 8px; border-radius: 10px; border: 1px solid; }
    .pill.critical { color: #ff0055; border-color: #ff0055; }
    .pill.high { color: #ff512f; border-color: #ff512f; }
    .pill.medium { color: #ffd200; border-color: #ffd200; }
    .pill.low { color: #00d9f6; border-color: #00d9f6; }
    .pill.total { color: var(--vscode-foreground); border-color: var(--vscode-widget-border); }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📜 AURIX Local Scan History</h1>
    ${history.length > 0 ? '<button class="btn" onclick="clearHistory()">Clear History</button>' : ""}
  </div>
  <div class="history-list">
    ${history.length > 0 ? rows : '<div class="empty">No scan history recorded yet. Run a scan to build your security scorecard history.</div>'}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function clearHistory() {
      vscode.postMessage({ command: 'clear' });
    }
  </script>
</body>
</html>`;
}
