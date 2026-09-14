import * as vscode from "vscode";

export function getApiEndpoint(): string {
  const raw = vscode.workspace.getConfiguration("aurix").get<string>("apiEndpoint", "https://major-project-yo0n.onrender.com");
  // Strip a trailing slash so path concatenation elsewhere never produces "//api/...".
  return raw.replace(/\/+$/, "");
}

export function getScanTimeoutMs(): number {
  const seconds = vscode.workspace.getConfiguration("aurix").get<number>("scanTimeout", 300);
  return seconds * 1000;
}

export function getMaxUploadBytes(): number {
  const mb = vscode.workspace.getConfiguration("aurix").get<number>("maxUploadMb", 10);
  return mb * 1024 * 1024;
}

export function getExtraIgnorePatterns(): string[] {
  return vscode.workspace.getConfiguration("aurix").get<string[]>("extraIgnorePatterns", []);
}

export function isAiSecretGuardEnabled(): boolean {
  return vscode.workspace.getConfiguration("aurix").get<boolean>("enableAiSecretGuard", true);
}

export function isGhostTextEnabled(): boolean {
  return vscode.workspace.getConfiguration("aurix").get<boolean>("enableGhostTextPatches", true);
}

export function getProjectId(): string {
  return vscode.workspace.getConfiguration("aurix").get<string>("projectId", "");
}

/**
 * Prompts the user for their AURIX project UUID and saves it to workspace
 * settings, unless one is already configured. Per the Integration Roadmap,
 * uploads require a project_id — confirm with Bhavya/Bhumika exactly how
 * a project gets created (likely via the Web Dashboard) and where its UUID
 * is displayed to the user.
 */
export async function requireProjectId(): Promise<string | undefined> {
  const existing = getProjectId();
  if (existing) return existing;

  const entered = await vscode.window.showInputBox({
    prompt: "Enter your AURIX Project ID (UUID) — find this in the Web Dashboard for this repo",
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim().length === 0 ? "Project ID is required." : undefined),
  });
  if (!entered) return undefined;

  await vscode.workspace.getConfiguration("aurix").update("projectId", entered.trim(), vscode.ConfigurationTarget.Workspace);
  return entered.trim();
}
