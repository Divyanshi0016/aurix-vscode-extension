import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Finding, findingFile, findingLine, findingPatchCode } from "./apiConnector";
import { logger } from "./outputLogger";

export interface AutoFixResult {
  appliedCount: number;
  fileCount: number;
  skippedCount: number;
}

export async function autoFixAll(findings: Finding[]): Promise<AutoFixResult> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage("AURIX: Open a workspace before auto-fixing.");
    return { appliedCount: 0, fileCount: 0, skippedCount: findings.length };
  }

  const workspaceRoot = folders[0].uri.fsPath;
  const patchableFindings = findings
    .filter((f) => !!findingPatchCode(f))
    .sort((a, b) => findingLine(b) - findingLine(a));

  if (patchableFindings.length === 0) {
    vscode.window.showInformationMessage("AURIX: No AI patches available to apply.");
    return { appliedCount: 0, fileCount: 0, skippedCount: findings.length };
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  const affectedFiles = new Set<string>();
  let appliedCount = 0;
  let skippedCount = 0;

  for (const finding of patchableFindings) {
    const patch = findingPatchCode(finding);
    if (!patch) continue;

    const relFile = findingFile(finding).replace(/^\/+/, "");
    if (!relFile) {
      skippedCount++;
      continue;
    }

    const absPath = path.join(workspaceRoot, relFile);
    if (!fs.existsSync(absPath)) {
      logger.warn(`Auto-fix skipped: File missing ${relFile}`);
      skippedCount++;
      continue;
    }

    const uri = vscode.Uri.file(absPath);
    const lineIdx = Math.max(findingLine(finding) - 1, 0);

    let lineLength = 200;
    try {
      const content = fs.readFileSync(absPath, "utf-8");
      const lines = content.split("\n");
      if (lineIdx < lines.length) {
        lineLength = lines[lineIdx].length;
      }
    } catch {
      // fallback line length
    }

    const range = new vscode.Range(
      new vscode.Position(lineIdx, 0),
      new vscode.Position(lineIdx, lineLength)
    );

    workspaceEdit.replace(uri, range, patch);
    affectedFiles.add(absPath);
    appliedCount++;
  }

  if (appliedCount > 0) {
    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (success) {
      logger.info(`Auto-Fix All: Applied ${appliedCount} patch(es) across ${affectedFiles.size} file(s).`);
      vscode.window.showInformationMessage(
        `AURIX Auto-Fix All: Successfully applied ${appliedCount} AI patch(es) across ${affectedFiles.size} file(s)! ⚡`
      );
    } else {
      logger.error("Auto-Fix All: Failed to apply workspace edit.");
      vscode.window.showErrorMessage("AURIX: Failed to apply workspace patches.");
    }
  }

  return {
    appliedCount,
    fileCount: affectedFiles.size,
    skippedCount: skippedCount + (findings.length - patchableFindings.length),
  };
}
