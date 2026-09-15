import * as vscode from "vscode";
import { AuthManager } from "./auth";
import { packageWorkspace, ScanMode } from "./packager";
import { runPreFlightSecretGuard } from "./secretGuard";
import { uploadScan, pollScanStatus, verifiedFindings, Finding } from "./apiConnector";
import { publishDiagnostics, findingStore } from "./diagnostics";
import { AurixCodeActionProvider, applyAiPatch } from "./quickFix";
import { registerGhostTextProvider } from "./ghostTextPatcher";
import { showAttackPathPanel } from "./attackPathWebview";
import { requireProjectId, getProjectId } from "./config";
import { logger } from "./outputLogger";
import { AurixSidebarProvider } from "./sidebarProvider";
import { statusBarShield } from "./statusBarShield";
import { MissionControlManager } from "./missionControl";
import { registerHoverProvider } from "./hoverTooltip";
import { registerPatchContentProvider, reviewPatch } from "./diffPatcher";
import { autoFixAll } from "./autoFixer";
import { exportHtmlReport } from "./reportExporter";
import { ScanHistoryManager, showHistoryPanel } from "./scanHistory";
import { showUserGuidePanel } from "./userGuideWebview";

let currentFindings: Finding[] = [];

export function activate(context: vscode.ExtensionContext) {
  logger.info("AURIX Security Extension activated.");

  const auth = new AuthManager(context.secrets);
  const scanHistory = new ScanHistoryManager(context);
  const missionControl = new MissionControlManager(context);
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("aurix");
  context.subscriptions.push(diagnosticCollection);
  context.subscriptions.push(statusBarShield);

  registerGhostTextProvider(context);
  registerHoverProvider(context);
  registerPatchContentProvider(context);

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ pattern: "**" }, new AurixCodeActionProvider(), {
      providedCodeActionKinds: AurixCodeActionProvider.providedCodeActionKinds,
    })
  );

  // Restore session from SecretStorage on startup
  auth.initSession().then(() => sidebarProvider.refresh());

  const sidebarProvider = new AurixSidebarProvider(auth, (mode) =>
    runScan(mode, auth, diagnosticCollection, sidebarProvider, missionControl, scanHistory)
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AurixSidebarProvider.viewType, sidebarProvider)
  );

  // Automatically open Getting Started Tour for brand new users on first install
  const hasShownWelcome = context.globalState.get<boolean>("aurixHasShownWelcome");
  if (!hasShownWelcome) {
    context.globalState.update("aurixHasShownWelcome", true);
    setTimeout(() => {
      vscode.commands.executeCommand("aurix.openUserGuide");
    }, 1200);
  }

  // Command handlers
  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.login", async () => {
      await auth.login();
      await sidebarProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.logout", async () => {
      await auth.logout();
      await sidebarProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.setProjectId", async () => {
      const current = getProjectId();
      const entered = await vscode.window.showInputBox({
        prompt: "AURIX Project ID (UUID)",
        value: current,
        ignoreFocusOut: true,
      });
      if (!entered) return;

      const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
      const target = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;

      try {
        await vscode.workspace.getConfiguration("aurix").update("projectId", entered.trim(), target);
        vscode.window.showInformationMessage("AURIX project ID saved.");
        await sidebarProvider.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(`AURIX: failed to save project ID: ${err.message ?? err}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.scanWorkspace", () =>
      runScan("workspace", auth, diagnosticCollection, sidebarProvider, missionControl, scanHistory)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.scanActiveFile", () =>
      runScan("activeFile", auth, diagnosticCollection, sidebarProvider, missionControl, scanHistory)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.scanStagedChanges", () =>
      runScan("stagedChanges", auth, diagnosticCollection, sidebarProvider, missionControl, scanHistory)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.showAttackPath", (findingId: string) => {
      const finding = findingStore.get(findingId);
      if (finding) showAttackPathPanel(finding);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "aurix.applyPatch",
      (uri: vscode.Uri, range: vscode.Range, finding: { patch_code?: string }) => applyAiPatch(uri, range, finding)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.reviewPatch", async (finding: Finding) => {
      await reviewPatch(finding);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.reviewPatchById", async (findingId: string) => {
      const finding = findingStore.get(findingId);
      if (finding) await reviewPatch(finding);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.autoFixAll", async () => {
      const result = await autoFixAll(currentFindings);
      if (result.appliedCount > 0) {
        currentFindings = currentFindings.filter((f) => !f.patch_code);
        sidebarProvider.setFindings(currentFindings);
        missionControl.setFindings(currentFindings);

        const count = currentFindings.length;
        const hasCritOrHigh = currentFindings.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH");
        if (count === 0) {
          statusBarShield.setSecure();
        } else {
          statusBarShield.setVulnerabilities(count, hasCritOrHigh);
        }

        missionControl.addLog(
          "INFO",
          `⚡ Auto-Fix All: Applied ${result.appliedCount} patch(es) across ${result.fileCount} file(s).`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.exportHtmlReport", async () => {
      const folderName = vscode.workspace.workspaceFolders?.[0]?.name;
      await exportHtmlReport(currentFindings, folderName);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.viewHistory", () => {
      showHistoryPanel(scanHistory);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.openUserGuide", () => {
      showUserGuidePanel(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aurix.openMissionControl", () => {
      missionControl.showPanel(async (msg: any) => {
        switch (msg.type) {
          case "scanWorkspace":
            await vscode.commands.executeCommand("aurix.scanWorkspace");
            break;
          case "reviewPatch":
            if (msg.id) {
              const finding = findingStore.get(msg.id);
              if (finding) await reviewPatch(finding);
            }
            break;
          case "applyPatch":
            if (msg.id) {
              const finding = findingStore.get(msg.id);
              if (finding) {
                const folders = vscode.workspace.workspaceFolders;
                if (folders && folders.length > 0) {
                  const relFile = (finding.file ?? finding.file_path ?? "").replace(/^\/+/, "");
                  const absPath = `${folders[0].uri.fsPath}/${relFile}`;
                  const lineIdx = Math.max((finding.line ?? finding.line_number ?? 1) - 1, 0);
                  const range = new vscode.Range(
                    new vscode.Position(lineIdx, 0),
                    new vscode.Position(lineIdx, 200)
                  );
                  await applyAiPatch(vscode.Uri.file(absPath), range, finding);
                }
              }
            }
            break;
          case "viewAttackPath":
            if (msg.id) await vscode.commands.executeCommand("aurix.showAttackPath", msg.id);
            break;
          case "autoFixAll":
            await vscode.commands.executeCommand("aurix.autoFixAll");
            break;
          case "exportReport":
            await vscode.commands.executeCommand("aurix.exportHtmlReport");
            break;
          case "viewHistory":
            await vscode.commands.executeCommand("aurix.viewHistory");
            break;
        }
      });
    })
  );
}

async function runScan(
  mode: ScanMode,
  auth: AuthManager,
  diagnosticCollection: vscode.DiagnosticCollection,
  sidebarProvider: AurixSidebarProvider,
  missionControl: MissionControlManager,
  scanHistory: ScanHistoryManager
) {
  const token = await auth.requireToken();
  if (!token) return;

  const projectId = await requireProjectId();
  if (!projectId) {
    vscode.window.showWarningMessage("AURIX: a Project ID is required to scan. Run 'AURIX: Set Project ID'.");
    return;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage("AURIX: open a folder (File \u2192 Open Folder) before scanning.");
    return;
  }
  const workspaceRoot = folders[0].uri.fsPath;

  statusBarShield.setScanning("Packaging...");
  sidebarProvider.setScanning(true, "Packaging workspace…");
  missionControl.setScanning(true, "Packaging workspace...");
  missionControl.addLog("INFO", `Starting AURIX scan (mode=${mode}, project=${projectId})`);

  try {
    const packaged = await packageWorkspace(mode);
    if (!packaged) {
      statusBarShield.setReady();
      sidebarProvider.setScanning(false);
      missionControl.setScanning(false);
      return;
    }

    missionControl.addLog("INFO", `Packaged ${packaged.fileCount} file(s) (${(packaged.sizeBytes / 1024).toFixed(1)} KB).`);

    statusBarShield.setScanning("Secret Check...");
    sidebarProvider.setScanning(true, "Checking for secrets…");
    missionControl.setScanning(true, "Checking for pre-flight secrets...");
    
    const safe = await runPreFlightSecretGuard(packaged.relativePaths, workspaceRoot, token);
    if (!safe) {
      vscode.window.showWarningMessage("AURIX: upload cancelled by Secret Guard.");
      missionControl.addLog("WARN", "Scan cancelled by Secret Guard.");
      statusBarShield.setReady();
      sidebarProvider.setScanning(false);
      missionControl.setScanning(false);
      return;
    }

    statusBarShield.setScanning("Uploading...");
    sidebarProvider.setScanning(true, "Uploading…");
    missionControl.setScanning(true, "Uploading workspace payload...");
    missionControl.addLog("INFO", "Uploading archive payload to AURIX AI engine...");

    const scanId = await uploadScan(packaged.zipPath, token, projectId);
    missionControl.addLog("INFO", `Scan accepted. Scan ID: ${scanId}`);

    statusBarShield.setScanning("Analyzing...");
    sidebarProvider.setScanning(true, "Scanning (typically 2-3 min)…");
    missionControl.setScanning(true, "AI Engine analyzing security vulnerabilities...");

    const result = await pollScanStatus(scanId, token, (update) => {
      const stepStr = update.current_step ? ` (${update.current_step})` : "";
      const progStr = update.progress !== undefined ? ` [${update.progress}%]` : "";
      statusBarShield.setScanning(`${update.status}${stepStr}`);
      sidebarProvider.setScanning(true, `Status: ${update.status}${stepStr}`);
      missionControl.setScanning(true, `AI Engine: ${update.status}${stepStr}`);
      missionControl.addLog("INFO", `Queue/Worker Status -> ${update.status}${stepStr}${progStr}`);
    });

    publishDiagnostics(diagnosticCollection, workspaceRoot, result);
    const verified = verifiedFindings(result);
    currentFindings = verified;

    sidebarProvider.setFindings(verified);
    missionControl.setFindings(verified);

    await scanHistory.recordScan(verified, mode);

    const count = verified.length;
    const hasCritOrHigh = verified.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH");

    if (count === 0) {
      statusBarShield.setSecure();
      missionControl.addLog("INFO", "Scan Completed: 0 vulnerabilities found. Workspace is SECURE! 🎉");
      vscode.window.showInformationMessage("AURIX: 0 vulnerabilities found. Workspace is safe! 🎉");
    } else {
      statusBarShield.setVulnerabilities(count, hasCritOrHigh);
      missionControl.addLog("WARN", `Scan Completed: Found ${count} verified vulnerability/vulnerabilities.`);
      vscode.window.showWarningMessage(`AURIX: Found ${count} verified vulnerability/vulnerabilities.`);
    }

  } catch (err: any) {
    const errorMsg = err.message ?? String(err);
    logger.error(errorMsg);
    missionControl.addLog("ERROR", `Scan failed: ${errorMsg}`);
    statusBarShield.setReady();
    vscode.window.showErrorMessage(`AURIX scan failed: ${errorMsg}`);
  } finally {
    sidebarProvider.setScanning(false);
    missionControl.setScanning(false);
  }
}

export function deactivate() {
  logger.info("AURIX extension deactivated.");
}
