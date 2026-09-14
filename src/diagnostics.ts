import * as vscode from "vscode";
import * as path from "path";
import { Finding, ScanStatusResponse, verifiedFindings, findingFile, findingLine } from "./apiConnector";

export const AURIX_DIAGNOSTIC_SOURCE = "AURIX";

export const findingStore = new Map<string, Finding>();

export function publishDiagnostics(
  collection: vscode.DiagnosticCollection,
  workspaceRoot: string,
  response: ScanStatusResponse
) {
  collection.clear();
  findingStore.clear();

  const byFile = new Map<string, vscode.Diagnostic[]>();

  for (const finding of verifiedFindings(response)) {
    findingStore.set(finding.id, finding);

    const lineIdx = Math.max(findingLine(finding) - 1, 0);
    const range = new vscode.Range(
      new vscode.Position(lineIdx, 0),
      new vscode.Position(lineIdx, Number.MAX_SAFE_INTEGER)
    );

    const summary = finding.ai_reasoning ?? finding.description ?? finding.title;
    const statusTag = finding.wargame_status ? ` [${finding.wargame_status}]` : "";

    const diagnostic = new vscode.Diagnostic(
      range,
      `${finding.title}${statusTag}\n${summary}`,
      severityToVsCode(finding.severity)
    );
    diagnostic.source = AURIX_DIAGNOSTIC_SOURCE;
    diagnostic.code = finding.id;

    const relFile = findingFile(finding).replace(/^\/+/, "");
    if (!relFile) continue; // nothing to anchor the diagnostic to
    const absPath = path.join(workspaceRoot, relFile);

    const existing = byFile.get(absPath) ?? [];
    existing.push(diagnostic);
    byFile.set(absPath, existing);
  }

  for (const [absPath, diags] of byFile.entries()) {
    collection.set(vscode.Uri.file(absPath), diags);
  }
}

function severityToVsCode(sev: Finding["severity"]): vscode.DiagnosticSeverity {
  switch (sev) {
    case "CRITICAL":
    case "HIGH":
      return vscode.DiagnosticSeverity.Error;
    case "MEDIUM":
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}
