import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Finding, findingFile, findingLine } from "./apiConnector";
import { calculateScorecard, getOwaspUrl } from "./scorecard";
import { escapeHtml } from "./attackPathWebview";
import { logger } from "./outputLogger";

export async function exportHtmlReport(findings: Finding[], workspaceName?: string): Promise<string | undefined> {
  const score = calculateScorecard(findings);
  const dateStr = new Date().toLocaleString();
  const folderName = workspaceName ?? vscode.workspace.workspaceFolders?.[0]?.name ?? "Workspace";

  const findingsRows = findings.map((f, i) => {
    const owasp = getOwaspUrl(f);
    const loc = findingFile(f) ? `${escapeHtml(findingFile(f))}:${findingLine(f)}` : "Workspace";
    
    return `
    <div class="finding-card ${f.severity.toLowerCase()}">
      <div class="finding-header">
        <span class="sev-badge ${f.severity.toLowerCase()}">${f.severity}</span>
        <span class="finding-title">#${i + 1}. ${escapeHtml(f.title)}</span>
        ${f.wargame_status ? `<span class="status-tag">${escapeHtml(f.wargame_status)}</span>` : ""}
      </div>
      <div class="finding-meta">
        <strong>Location:</strong> <code>${loc}</code> | <strong>Rule:</strong> <code>${escapeHtml(f.rule_id)}</code>
      </div>
      <div class="finding-body">
        <p><strong>AI Reasoning:</strong> ${escapeHtml(f.ai_reasoning ?? f.description ?? "No description provided.")}</p>
        ${
          f.evidence
            ? `<div class="code-block-title">Evidence Code Snippet</div><pre class="code-block">${escapeHtml(f.evidence)}</pre>`
            : ""
        }
        ${
          f.patch_code
            ? `<div class="code-block-title">AI Suggested Security Patch</div><pre class="code-block patch">${escapeHtml(f.patch_code)}</pre>`
            : ""
        }
        <div class="owasp-link">
          🔗 <a href="${owasp}" target="_blank">View Official OWASP Security Guidelines</a>
        </div>
      </div>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AURIX Security Scan Report — ${escapeHtml(folderName)}</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --text: #c9d1d9;
      --text-heading: #f0f6fc;
      --border: #30363d;
      --primary: #58a6ff;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 30px;
      line-height: 1.5;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 2px solid var(--border);
    }
    .brand-title {
      font-size: 28px;
      font-weight: 800;
      color: var(--text-heading);
      letter-spacing: 1px;
    }
    .brand-subtitle {
      color: #8b949e;
      font-size: 14px;
    }
    .scorecard-banner {
      display: flex;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
      gap: 24px;
    }
    .badge-box {
      width: 100px;
      height: 100px;
      border-radius: 16px;
      background: ${score.gradient};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 42px;
      font-weight: 900;
      color: ${score.textColor};
      box-shadow: 0 8px 24px ${score.shadowColor};
      flex-shrink: 0;
    }
    .metrics-summary {
      flex: 1;
    }
    .metrics-summary h2 {
      margin: 0 0 8px 0;
      font-size: 22px;
      color: var(--text-heading);
    }
    .stat-pills {
      display: flex;
      gap: 12px;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    .pill {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .pill.critical { background: rgba(255, 0, 85, 0.2); color: #ff3377; border: 1px solid #ff3377; }
    .pill.high { background: rgba(255, 81, 47, 0.2); color: #ff6647; border: 1px solid #ff6647; }
    .pill.medium { background: rgba(255, 210, 0, 0.2); color: #ffd700; border: 1px solid #ffd700; }
    .pill.low { background: rgba(0, 217, 246, 0.2); color: #00d9f6; border: 1px solid #00d9f6; }
    
    .section-header {
      font-size: 20px;
      color: var(--text-heading);
      margin: 32px 0 16px 0;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    .finding-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 16px;
    }
    .finding-card.critical { border-left: 5px solid #ff0055; }
    .finding-card.high { border-left: 5px solid #ff512f; }
    .finding-card.medium { border-left: 5px solid #ffd200; }
    .finding-card.low { border-left: 5px solid #00d9f6; }

    .finding-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .sev-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .sev-badge.critical { background: #ff0055; color: #fff; }
    .sev-badge.high { background: #ff512f; color: #fff; }
    .sev-badge.medium { background: #ffd200; color: #000; }
    .sev-badge.low { background: #00d9f6; color: #000; }

    .finding-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-heading);
    }
    .status-tag {
      margin-left: auto;
      font-size: 11px;
      background: #21262d;
      border: 1px solid var(--border);
      padding: 2px 8px;
      border-radius: 12px;
      color: #8b949e;
    }
    .finding-meta {
      font-size: 13px;
      color: #8b949e;
      margin: 8px 0 12px 0;
    }
    code {
      font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      background: rgba(110, 118, 129, 0.2);
      padding: 2px 6px;
      border-radius: 4px;
      color: #e6edf3;
    }
    .code-block-title {
      font-size: 12px;
      font-weight: 600;
      color: #8b949e;
      margin-top: 10px;
    }
    .code-block {
      background: #090d11;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      font-family: monospace;
      font-size: 13px;
      overflow-x: auto;
      white-space: pre-wrap;
      color: #79c0ff;
    }
    .code-block.patch {
      color: #7ee787;
      border-color: rgba(46, 160, 67, 0.4);
    }
    .owasp-link {
      margin-top: 12px;
      font-size: 13px;
    }
    .owasp-link a {
      color: var(--primary);
      text-decoration: none;
    }
    .owasp-link a:hover {
      text-decoration: underline;
    }

    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .container { max-width: 100%; }
      .finding-card, .scorecard-banner { background: #fff; border: 1px solid #ccc; color: #000; }
      .code-block { background: #f5f5f5; color: #000; border: 1px solid #ccc; }
      .brand-title, .finding-title, .metrics-summary h2 { color: #000; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand-title">🛡️ AURIX Security Executive Report</div>
        <div class="brand-subtitle">AI-Driven Workspace Vulnerability Assessment Report</div>
      </div>
      <div style="text-align: right; font-size: 13px; color: #8b949e;">
        <div><strong>Project:</strong> ${escapeHtml(folderName)}</div>
        <div><strong>Generated:</strong> ${dateStr}</div>
      </div>
    </div>

    <div class="scorecard-banner">
      <div class="badge-box">${score.grade}</div>
      <div class="metrics-summary">
        <h2>Security Grade: ${score.grade} (${score.score}/100)</h2>
        <div style="color: #8b949e; font-size: 14px;">Status: <strong>${score.label}</strong></div>
        <div class="stat-pills">
          <span class="pill critical">${score.criticalCount} Critical</span>
          <span class="pill high">${score.highCount} High</span>
          <span class="pill medium">${score.mediumCount} Medium</span>
          <span class="pill low">${score.lowCount} Low</span>
          <span class="pill" style="background:#21262d;color:#fff;">${score.total} Total Findings</span>
        </div>
      </div>
    </div>

    <div class="section-header">Detailed Security Findings (${findings.length})</div>
    ${findings.length > 0 ? findingsRows : '<p style="color:#8b949e;">No security vulnerabilities were found in this workspace. 🎉</p>'}
  </div>
</body>
</html>`;

  // Determine Desktop path
  let desktopPath = path.join(os.homedir(), "Desktop");
  if (!fs.existsSync(desktopPath)) {
    desktopPath = os.homedir();
  }

  const timestampStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `AURIX_Security_Report_${timestampStr}.html`;
  const fullPath = path.join(desktopPath, fileName);

  try {
    fs.writeFileSync(fullPath, html, "utf-8");
    logger.info(`HTML Security Report exported to ${fullPath}`);

    const choice = await vscode.window.showInformationMessage(
      `AURIX HTML Security Report saved to Desktop! (${fileName})`,
      "Open Report"
    );

    if (choice === "Open Report") {
      await vscode.env.openExternal(vscode.Uri.file(fullPath));
    }

    return fullPath;
  } catch (err: any) {
    logger.error(`Failed to write HTML report: ${err.message}`);
    vscode.window.showErrorMessage(`AURIX: Failed to save report to Desktop: ${err.message}`);
    return undefined;
  }
}
