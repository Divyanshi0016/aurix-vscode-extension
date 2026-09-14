import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import archiver from "archiver";
import ignoreLib from "ignore";
import { exec } from "child_process";
import { promisify } from "util";
import { getExtraIgnorePatterns, getMaxUploadBytes } from "./config";
import { logger } from "./outputLogger";

const execAsync = promisify(exec);

// Folders that must NEVER be zipped, regardless of .gitignore contents.
const HARD_BLOCKLIST = ["node_modules", ".git", "venv", ".venv", "build", "dist", "out"];

export type ScanMode = "workspace" | "activeFile" | "stagedChanges";

export interface PackageResult {
  zipPath: string;
  fileCount: number;
  relativePaths: string[];
  sizeBytes: number;
}

function buildIgnoreMatcher(workspaceRoot: string) {
  const ig = ignoreLib();
  const gitignorePath = path.join(workspaceRoot, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, "utf-8"));
  }

  ig.add(HARD_BLOCKLIST);
  ig.add(getExtraIgnorePatterns());
  return ig;
}

function walkDir(dir: string, root: string, ig: ReturnType<typeof ignoreLib>, out: string[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).split(path.sep).join("/");

    if (entry.isDirectory() && HARD_BLOCKLIST.includes(entry.name)) {
      continue;
    }

    if (ig.ignores(rel)) continue;

    if (entry.isDirectory()) {
      walkDir(abs, root, ig, out);
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
}

async function getStagedFiles(workspaceRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync("git diff --cached --name-only --diff-filter=ACM", {
      cwd: workspaceRoot,
    });
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (err: any) {
    logger.warn(`git diff failed, falling back to empty staged list: ${err.message}`);
    return [];
  }
}

export async function packageWorkspace(mode: ScanMode): Promise<PackageResult | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("AURIX: open a folder/workspace before scanning.");
    return undefined;
  }
  const workspaceRoot = folders[0].uri.fsPath;
  const ig = buildIgnoreMatcher(workspaceRoot);

  let relativePaths: string[] = [];

  if (mode === "workspace") {
    walkDir(workspaceRoot, workspaceRoot, ig, relativePaths);
  } else if (mode === "activeFile") {
    const active = vscode.window.activeTextEditor;
    if (!active) {
      vscode.window.showErrorMessage("AURIX: no active file to scan.");
      return undefined;
    }
    relativePaths = [path.relative(workspaceRoot, active.document.uri.fsPath).split(path.sep).join("/")];
  } else if (mode === "stagedChanges") {
    const staged = await getStagedFiles(workspaceRoot);
    relativePaths = staged.filter((rel) => !ig.ignores(rel));
    if (relativePaths.length === 0) {
      vscode.window.showInformationMessage("AURIX: no staged changes found to scan.");
      return undefined;
    }
  }

  if (relativePaths.length === 0) {
    vscode.window.showWarningMessage("AURIX: nothing to package after applying ignore rules.");
    return undefined;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aurix-scan-"));
  const zipPath = path.join(tmpDir, `scan-${Date.now()}.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err: Error) => reject(err));
    archive.pipe(output);

    for (const rel of relativePaths) {
      const abs = path.join(workspaceRoot, rel);
      archive.file(abs, { name: rel });
    }

    archive.finalize();
  });

  const sizeBytes = fs.statSync(zipPath).size;
  logger.info(`Packaged ${relativePaths.length} file(s) into ${zipPath} (${(sizeBytes / 1024).toFixed(1)} KB, mode=${mode}).`);

  // Backend rejects uploads over its limit (10MB by default) — fail fast
  // locally instead of making the user wait for a server-side rejection.
  const maxBytes = getMaxUploadBytes();
  if (sizeBytes > maxBytes) {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
    const limitMb = (maxBytes / (1024 * 1024)).toFixed(0);
    vscode.window.showErrorMessage(
      `AURIX: zip is ${mb}MB, over the ${limitMb}MB backend limit. Try "Scan Active File" or "Scan Staged Changes" instead, or check for large files not covered by .gitignore.`
    );
    logger.error(`Upload blocked: ${mb}MB exceeds ${limitMb}MB limit.`);
    return undefined;
  }

  return { zipPath, fileCount: relativePaths.length, relativePaths, sizeBytes };
}
