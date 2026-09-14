import * as vscode from "vscode";
import { AURIX_DIAGNOSTIC_SOURCE, findingStore } from "./diagnostics";
import { streamGhostTextPatch } from "./ghostTextPatcher";
import { isGhostTextEnabled } from "./config";
import { getOwaspUrl } from "./scorecard";
import { findingPatchCode } from "./apiConnector";

export class AurixCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== AURIX_DIAGNOSTIC_SOURCE) continue;
      const findingId = diagnostic.code as string;
      const finding = findingStore.get(findingId);
      if (!finding) continue;

      const patch = findingPatchCode(finding);
      if (patch) {
        // 1. Lightbulb: Apply AI Security Patch
        const applyAction = new vscode.CodeAction("AURIX: ⚡ Apply AI Security Patch", vscode.CodeActionKind.QuickFix);
        applyAction.diagnostics = [diagnostic];
        applyAction.isPreferred = true;
        applyAction.command = {
          command: "aurix.applyPatch",
          title: "Apply AI Security Patch",
          arguments: [document.uri, diagnostic.range, finding],
        };
        actions.push(applyAction);

        // 2. Lightbulb: Review Patch (Split Diff)
        const reviewAction = new vscode.CodeAction("AURIX: 👀 Review Patch (Split Diff)", vscode.CodeActionKind.QuickFix);
        reviewAction.diagnostics = [diagnostic];
        reviewAction.command = {
          command: "aurix.reviewPatch",
          title: "Review Patch (Split Diff)",
          arguments: [finding],
        };
        actions.push(reviewAction);
      }

      // 3. Lightbulb: View Attack Path
      const viewAction = new vscode.CodeAction("AURIX: 🔍 View Attack Path", vscode.CodeActionKind.QuickFix);
      viewAction.diagnostics = [diagnostic];
      viewAction.command = {
        command: "aurix.showAttackPath",
        title: "View Attack Path",
        arguments: [findingId],
      };
      actions.push(viewAction);

      // 4. Lightbulb: Learn on OWASP
      const owaspUrl = getOwaspUrl(finding);
      const owaspAction = new vscode.CodeAction("AURIX: 📖 Learn on OWASP Documentation", vscode.CodeActionKind.QuickFix);
      owaspAction.diagnostics = [diagnostic];
      owaspAction.command = {
        command: "vscode.open",
        title: "Learn on OWASP Documentation",
        arguments: [vscode.Uri.parse(owaspUrl)],
      };
      actions.push(owaspAction);
    }

    return actions;
  }
}

export async function applyAiPatch(
  uri: vscode.Uri,
  range: vscode.Range,
  finding: { patch_code?: string; suggested_fix?: string; fix?: string }
) {
  const patch = finding.patch_code || finding.suggested_fix || finding.fix;
  if (!patch) {
    vscode.window.showWarningMessage("AURIX: no patch is available for this finding yet.");
    return;
  }

  const editor = await vscode.window.showTextDocument(uri);

  if (isGhostTextEnabled()) {
    await streamGhostTextPatch(editor, range, patch);
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, patch);
  await vscode.workspace.applyEdit(edit);
}
