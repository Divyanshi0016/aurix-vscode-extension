import * as vscode from "vscode";

export function showUserGuidePanel(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    "aurixUserGuide",
    "AURIX — Getting Started & User Tour",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = getHtml();

  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.type) {
      case "login":
        await vscode.commands.executeCommand("aurix.login");
        break;
      case "scanWorkspace":
        await vscode.commands.executeCommand("aurix.scanWorkspace");
        break;
      case "openMissionControl":
        await vscode.commands.executeCommand("aurix.openMissionControl");
        break;
    }
  });
}

function getHtml(): string {
  return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AURIX User Tour & Getting Started</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f2937;
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.25);
      --text: #f3f4f6;
      --muted: #9ca3af;
      --success: #10b981;
      --warning: #f59e0b;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 32px;
      max-width: 860px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .hero {
      text-align: center;
      padding: 32px 20px;
      background: radial-gradient(circle at center, rgba(59, 130, 246, 0.12) 0%, transparent 70%);
      border-radius: 16px;
      border: 1px solid rgba(59, 130, 246, 0.2);
      margin-bottom: 36px;
    }
    .hero h1 {
      font-size: 32px;
      font-weight: 800;
      margin: 0 0 10px 0;
      background: linear-gradient(135deg, #60a5fa, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p {
      font-size: 16px;
      color: var(--muted);
      margin: 0 auto;
      max-width: 600px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 20px;
    }
    .step-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 24px;
      position: relative;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .step-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .step-num {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--accent);
      color: white;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      margin-bottom: 14px;
    }
    .step-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .step-desc {
      font-size: 14px;
      color: var(--muted);
      margin-bottom: 16px;
    }
    .code-box {
      background: #030712;
      border: 1px solid #1f2937;
      border-radius: 6px;
      padding: 10px 14px;
      font-family: monospace;
      font-size: 13px;
      color: #60a5fa;
      margin-bottom: 12px;
    }
    .btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    .btn:hover {
      opacity: 0.9;
    }
    .btn.secondary {
      background: #374151;
      color: var(--text);
    }
    .tip-box {
      background: rgba(16, 185, 129, 0.1);
      border-left: 4px solid var(--success);
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
      margin-top: 24px;
    }
  </style>
</head>
<body>

  <div class="hero">
    <h1>🛡️ Welcome to AURIX Security</h1>
    <p>AI-powered real-time security scanning, automated vulnerability detection, and split-diff AI auto-fixing inside VS Code.</p>
  </div>

  <div class="grid">

    <div class="step-card">
      <div class="step-num">1</div>
      <div class="step-title">📍 Where is the UI?</div>
      <div class="step-desc">
        Click the <b>AURIX Shield Icon (🛡️)</b> in the left Activity Bar of VS Code, or press <code>Ctrl + Shift + P</code> and search for <code>AURIX</code>.
      </div>
      <div class="code-box">Activity Bar ➔ 🛡️ AURIX Shield Icon</div>
    </div>

    <div class="step-card">
      <div class="step-num">2</div>
      <div class="step-title">🔑 Step 1: Sign In</div>
      <div class="step-desc">
        Sign in with your Supabase account credentials inside the AURIX sidebar or Command Palette.
      </div>
      <button class="btn" onclick="post('login')">Sign In Now</button>
    </div>

    <div class="step-card">
      <div class="step-num">3</div>
      <div class="step-title">🔍 Step 2: Run a Security Scan</div>
      <div class="step-desc">
        Click <b>Scan Active File</b> for fast single-file checks or <b>Scan Full Workspace</b> to audit your full project repository.
      </div>
      <button class="btn secondary" onclick="post('scanWorkspace')">Run Full Scan</button>
    </div>

    <div class="step-card">
      <div class="step-num">4</div>
      <div class="step-title">⚡ Step 3: Review & Auto-Fix</div>
      <div class="step-desc">
        Hover over highlighted vulnerabilities to see AI explanations, view <b>Attack Path graphs</b>, or click <b>⚡ Auto-Fix All</b> to patch files.
      </div>
      <button class="btn" onclick="post('openMissionControl')">Open Mission Control</button>
    </div>

  </div>

  <div class="tip-box">
    <b>💡 Pro Tip:</b> Open the <b>Mission Control Dashboard</b> anytime from the top-right of the AURIX sidebar to see real-time backend stream logs, security grades, and attack vector visualizers.
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function post(type) {
      vscode.postMessage({ type });
    }
  </script>
</body>
</html>`;
}
