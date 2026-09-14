import * as vscode from "vscode";

export class StatusBarShield {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = "aurix.openMissionControl";
    this.setReady();
    this.item.show();
  }

  setReady() {
    this.item.text = "$(shield) AURIX: Ready";
    this.item.tooltip = "AURIX Security Scanner — Click to open Mission Control";
    this.item.backgroundColor = undefined;
    this.item.color = undefined;
  }

  setScanning(label?: string) {
    this.item.text = `$(sync~spin) AURIX: ${label ?? "Scanning..."}`;
    this.item.tooltip = "AURIX is analyzing workspace vulnerabilities...";
    this.item.backgroundColor = undefined;
    this.item.color = "#00D9F6";
  }

  setSecure() {
    this.item.text = "🛡️ AURIX: Secure";
    this.item.tooltip = "AURIX: 0 vulnerabilities found. Workspace is safe! 🎉";
    this.item.backgroundColor = undefined;
    this.item.color = "#00F5A0";
  }

  setVulnerabilities(count: number, hasCriticalOrHigh: boolean = false) {
    const textLabel = count === 1 ? "1 Vulnerability" : `${count} Vulnerabilities`;
    this.item.text = `🔴 AURIX: ${textLabel}`;
    this.item.tooltip = `AURIX detected ${textLabel}. Click to review findings in Mission Control.`;
    
    if (hasCriticalOrHigh) {
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      this.item.color = undefined;
    } else {
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.item.color = undefined;
    }
  }

  dispose() {
    this.item.dispose();
  }
}

export const statusBarShield = new StatusBarShield();
