import * as vscode from "vscode";
import { Finding, findingFile, findingLine } from "./apiConnector";

export function showAttackPathPanel(finding: Finding) {
  const panel = vscode.window.createWebviewPanel(
    "aurixAttackPath",
    `AURIX: ${finding.title}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );

  panel.webview.html = renderHtml(finding);
}

function badgeColor(status?: Finding["wargame_status"]): string {
  switch (status) {
    case "Neutralized":
      return "var(--vscode-testing-iconPassed)";
    case "Exploit Confirmed":
      return "var(--vscode-editorError-foreground)";
    case "PoC Failed":
    default:
      return "var(--vscode-editorWarning-foreground)";
  }
}

function renderHtml(finding: Finding): string {
  const status = finding.wargame_status ?? "Unverified";

  return /* html */ `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); }
      h1 { font-size: 1.2em; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;
               background: ${badgeColor(finding.wargame_status)}; color: black; }
      .sev { opacity: 0.8; font-size: 0.85em; }
      pre { background: var(--vscode-textCodeBlock-background); padding: 12px; overflow-x: auto;
            white-space: pre-wrap; }
      section { margin-top: 18px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(finding.title)} <span class="badge">${escapeHtml(status)}</span></h1>
    <p class="sev">${escapeHtml(finding.severity)}${finding.cvss ? ` · CVSS ${finding.cvss}` : ""}${finding.tool ? ` · ${escapeHtml(finding.tool)}` : ""} · ${escapeHtml(findingFile(finding))}:${findingLine(finding)}</p>

    <section>
      <h3>AI Reasoning</h3>
      <p>${escapeHtml(finding.ai_reasoning ?? finding.description ?? "No description available.")}</p>
    </section>

    ${
      finding.poc_script
        ? `<section><h3>Proof-of-Concept Script (Red Agent)</h3><pre>${escapeHtml(finding.poc_script)}</pre></section>`
        : ""
    }

    ${
      finding.patch_code
        ? `<section><h3>Suggested Patch (Blue Agent)</h3><pre>${escapeHtml(finding.patch_code)}</pre></section>`
        : `<section><p><em>No patch was generated for this finding (status: ${escapeHtml(status)}).</em></p></section>`
    }
  </body>
  </html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
