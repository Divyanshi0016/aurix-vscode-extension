import * as vscode from "vscode";

export function getApiEndpoint(): string {
  const raw = vscode.workspace.getConfiguration("aurix").get<string>("apiEndpoint", "https://major-project-yo0n.onrender.com");
  // Strip a trailing slash so path concatenation elsewhere never produces "//api/...".
  return raw.replace(/\/+$/, "");
}

export function getScanTimeoutMs(): number {
  const seconds = vscode.workspace.getConfiguration("aurix").get<number>("scanTimeout", 600);
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
  const configured = vscode.workspace.getConfiguration("aurix").get<string>("projectId", "");
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }
  // Auto-fallback: project ID is automatically derived or defaulted so new users are never blocked
  const folderName = vscode.workspace.workspaceFolders?.[0]?.name;
  return folderName ? `project-${folderName.toLowerCase().replace(/[^a-z0-9]/g, "-")}` : "default-aurix-project";
}

export async function requireProjectId(): Promise<string | undefined> {
  return getProjectId();
}
