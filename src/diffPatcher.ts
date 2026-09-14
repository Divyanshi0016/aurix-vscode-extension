import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Finding, findingFile, findingLine, findingPatchCode } from "./apiConnector";
import { logger } from "./outputLogger";

export const AURIX_PATCH_SCHEME = "aurix-patch";

class AurixPatchContentProvider implements vscode.TextDocumentContentProvider {
  private contentMap = new Map<string, string>();
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this._onDidChange.event;

  setPatchContent(uri: vscode.Uri, content: string) {
    this.contentMap.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contentMap.get(uri.toString()) ?? "// No patch content generated.";
  }
}

export const patchContentProvider = new AurixPatchContentProvider();

export function registerPatchContentProvider(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(AURIX_PATCH_SCHEME, patchContentProvider)
  );
}

export async function reviewPatch(finding: Finding): Promise<void> {
  const patchCode = findingPatchCode(finding);
  if (!patchCode) {
    vscode.window.showWarningMessage("AURIX: No patch code is available for this finding.");
    return;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage("AURIX: Open a workspace folder to review patches.");
    return;
  }

  const relFile = findingFile(finding).replace(/^\/+/, "");
  if (!relFile) {
    vscode.window.showWarningMessage("AURIX: Finding lacks a valid target file path.");
    return;
  }

  const absPath = path.join(folders[0].uri.fsPath, relFile);
  if (!fs.existsSync(absPath)) {
    vscode.window.showWarningMessage(`AURIX: Target file not found: ${relFile}`);
    return;
  }

  const originalUri = vscode.Uri.file(absPath);
  let originalContent = "";
  try {
    originalContent = fs.readFileSync(absPath, "utf-8");
  } catch (err: any) {
    vscode.window.showErrorMessage(`AURIX: Could not read file ${relFile}: ${err.message}`);
    return;
  }

  const lines = originalContent.split("\n");
  const targetLineIdx = Math.max(findingLine(finding) - 1, 0);

  // Replace line or range with patchCode
  const patchedLines = [...lines];
  if (targetLineIdx < patchedLines.length) {
    patchedLines[targetLineIdx] = patchCode;
  } else {
    patchedLines.push(patchCode);
  }
  const patchedContent = patchedLines.join("\n");

  const patchUri = vscode.Uri.parse(
    `${AURIX_PATCH_SCHEME}://patch/${encodeURIComponent(relFile)}?id=${finding.id}`
  );

  patchContentProvider.setPatchContent(patchUri, patchedContent);

  const title = `AURIX Review: ${finding.title} (${path.basename(relFile)})`;
  logger.info(`Opening Split-Screen Diff Editor for finding ${finding.id} on ${relFile}`);
  
  await vscode.commands.executeCommand("vscode.diff", originalUri, patchUri, title, {
    preview: true,
  });

  // Prompt the user in case they want to accept the patch directly from review
  const action = await vscode.window.showInformationMessage(
    `Reviewing patch for "${finding.title}". Would you like to accept and apply this AI patch?`,
    "Accept & Apply Patch",
    "Close Review"
  );

  if (action === "Accept & Apply Patch") {
    const lineRange = new vscode.Range(
      new vscode.Position(targetLineIdx, 0),
      new vscode.Position(targetLineIdx, lines[targetLineIdx]?.length ?? 0)
    );
    await vscode.commands.executeCommand("aurix.applyPatch", originalUri, lineRange, finding);
  }
}
