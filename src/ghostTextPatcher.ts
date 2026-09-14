import * as vscode from "vscode";
import { logger } from "./outputLogger";

class GhostTextProvider implements vscode.InlineCompletionItemProvider {
  private pendingPatch: { position: vscode.Position; text: string } | null = null;

  setPendingPatch(position: vscode.Position, text: string) {
    this.pendingPatch = { position, text };
  }

  clear() {
    this.pendingPatch = null;
  }

  provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.InlineCompletionItem[] {
    if (!this.pendingPatch) return [];
    if (!position.isEqual(this.pendingPatch.position)) return [];

    const item = new vscode.InlineCompletionItem(
      this.pendingPatch.text,
      new vscode.Range(this.pendingPatch.position, this.pendingPatch.position)
    );
    return [item];
  }
}

const ghostTextProvider = new GhostTextProvider();

export function registerGhostTextProvider(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, ghostTextProvider)
  );
}

export async function streamGhostTextPatch(
  editor: vscode.TextEditor,
  range: vscode.Range,
  patchText: string
) {
  const insertPosition = range.start;
  editor.selection = new vscode.Selection(insertPosition, insertPosition);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

  ghostTextProvider.setPendingPatch(insertPosition, patchText);
  logger.info(`Ghost-text patch armed at ${insertPosition.line}:${insertPosition.character}. Press Tab to accept.`);

  await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");

  vscode.window.setStatusBarMessage("AURIX: AI patch ready — press Tab to accept.", 5000);
}
