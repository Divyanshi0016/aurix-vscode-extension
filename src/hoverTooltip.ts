import * as vscode from "vscode";
import { AURIX_DIAGNOSTIC_SOURCE, findingStore } from "./diagnostics";
import { getOwaspUrl } from "./scorecard";

export class AurixHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const aurixDiags = diagnostics.filter(
      (d) => d.source === AURIX_DIAGNOSTIC_SOURCE && d.range.contains(position)
    );

    if (aurixDiags.length === 0) return null;

    const contents: vscode.MarkdownString[] = [];

    for (const diag of aurixDiags) {
      const findingId = diag.code as string;
      const finding = findingStore.get(findingId);

      const md = new vscode.MarkdownString();
      md.isTrusted = true;
      md.supportHtml = true;

      const title = finding?.title ?? diag.message.split("\n")[0];
      const severity = finding?.severity ?? "HIGH";
      const owaspUrl = finding ? getOwaspUrl(finding) : "https://owasp.org/www-project-top-ten/";
      const reasoning = finding?.ai_reasoning ?? finding?.description ?? diag.message;
      const statusBadge = finding?.wargame_status ? ` \`[${finding.wargame_status}]\`` : "";

      let sevIcon = "⚠️";
      if (severity === "CRITICAL") sevIcon = "🚨";
      if (severity === "HIGH") sevIcon = "⚠️";
      if (severity === "MEDIUM") sevIcon = "⚡";
      if (severity === "LOW") sevIcon = "ℹ️";

      md.appendMarkdown(`### 🛡️ **AURIX Security Alert**\n\n`);
      md.appendMarkdown(
        `**${sevIcon} [${severity}] ${title}**${statusBadge}\n\n`
      );
      
      md.appendMarkdown(`---\n\n`);
      md.appendMarkdown(`**AI Reasoning**: ${reasoning}\n\n`);

      if (finding?.evidence) {
        // Render in diff format with - prefix to highlight in RED in VS Code Markdown
        const diffSnippet = finding.evidence
          .split("\n")
          .map((line) => (line.startsWith("-") ? line : `- ${line}`))
          .join("\n");
        md.appendMarkdown(`**Vulnerable Code**:\n\`\`\`diff\n${diffSnippet}\n\`\`\`\n\n`);
      }

      md.appendMarkdown(`---\n\n`);
      md.appendMarkdown(`🔗 **[Official OWASP Documentation](${owaspUrl})**\n\n`);

      if (finding?.patch_code) {
        const applyArgs = encodeURIComponent(
          JSON.stringify([document.uri.toString(), diag.range, finding])
        );
        const reviewArgs = encodeURIComponent(JSON.stringify([finding.id]));

        md.appendMarkdown(
          `[⚡ **Apply AI Patch**](command:aurix.applyPatch?${applyArgs}) &nbsp;&nbsp;|&nbsp;&nbsp; [👀 **Review Patch (Split Diff)**](command:aurix.reviewPatchById?${reviewArgs})\n`
        );
      } else {
        const attackPathArgs = encodeURIComponent(JSON.stringify([findingId]));
        md.appendMarkdown(`[🔍 **View Attack Path**](command:aurix.showAttackPath?${attackPathArgs})\n`);
      }

      contents.push(md);
    }

    return new vscode.Hover(contents);
  }
}

export function registerHoverProvider(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ pattern: "**" }, new AurixHoverProvider())
  );
}
