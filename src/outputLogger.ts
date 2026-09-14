import * as vscode from "vscode";

class OutputLogger {
  private channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel("AURIX");
  }

  info(message: string) {
    this.write("INFO", message);
  }

  warn(message: string) {
    this.write("WARN", message);
  }

  error(message: string) {
    this.write("ERROR", message);
  }

  show() {
    this.channel.show(true);
  }

  private write(level: string, message: string) {
    const ts = new Date().toISOString();
    this.channel.appendLine(`[${ts}] [${level}] ${message}`);
  }
}

export const logger = new OutputLogger();
