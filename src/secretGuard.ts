import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";
import { getApiEndpoint, isAiSecretGuardEnabled } from "./config";
import { logger } from "./outputLogger";

const CANDIDATE_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/g,
  /(api|secret|token|password)[_-]?key\s*[:=]\s*["'][^"'\s]{8,}["']/gi,
];

export interface SecretFinding {
  file: string;
  line: number;
  snippet: string;
  aiVerdict?: "likely_real_secret" | "likely_placeholder" | "unknown";
  aiReason?: string;
}

function findCandidates(relativePaths: string[], workspaceRoot: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const rel of relativePaths) {
    const abs = path.join(workspaceRoot, rel);
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    lines.forEach((lineText, idx) => {
      for (const pattern of CANDIDATE_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(lineText)) {
          findings.push({ file: rel, line: idx + 1, snippet: lineText.trim().slice(0, 200) });
        }
      }
    });
  }

  return findings;
}

async function classifyWithAi(findings: SecretFinding[], token: string): Promise<SecretFinding[]> {
  if (findings.length === 0) return findings;

  try {
    const res = await fetch(`${getApiEndpoint()}/api/secret-guard/classify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        candidates: findings.map((f) => ({ file: f.file, line: f.line, snippet: f.snippet })),
      }),
    });

    if (!res.ok) {
      logger.warn(`Secret guard AI classification failed (${res.status}); treating all as suspicious.`);
      return findings.map((f) => ({ ...f, aiVerdict: "unknown" as const }));
    }

    const data = (await res.json()) as {
      results: { file: string; line: number; verdict: "likely_real_secret" | "likely_placeholder"; reason: string }[];
    };

    return findings.map((f) => {
      const match = data.results.find((r) => r.file === f.file && r.line === f.line);
      return {
        ...f,
        aiVerdict: match?.verdict ?? "unknown",
        aiReason: match?.reason,
      };
    });
  } catch (err: any) {
    logger.error(`Secret guard AI call errored: ${err.message}`);
    return findings.map((f) => ({ ...f, aiVerdict: "unknown" as const }));
  }
}

export async function runPreFlightSecretGuard(
  relativePaths: string[],
  workspaceRoot: string,
  token: string | undefined
): Promise<boolean> {
  const candidates = findCandidates(relativePaths, workspaceRoot);
  if (candidates.length === 0) {
    logger.info("Secret guard: no candidate secrets found.");
    return true;
  }

  let findings = candidates;
  if (isAiSecretGuardEnabled() && token) {
    findings = await classifyWithAi(candidates, token);
  }

  const realSecrets = findings.filter((f) => f.aiVerdict !== "likely_placeholder");
  if (realSecrets.length === 0) {
    logger.info("Secret guard: all candidates classified as placeholders.");
    return true;
  }

  const list = realSecrets.map((f) => `${f.file}:${f.line}`).join(", ");
  logger.warn(`Secret guard flagged possible live credentials: ${list}`);

  const choice = await vscode.window.showWarningMessage(
    `AURIX found ${realSecrets.length} possible hardcoded secret(s) (e.g. ${realSecrets[0].file}:${realSecrets[0].line}). Upload anyway?`,
    { modal: true },
    "Upload Anyway",
    "Cancel"
  );

  return choice === "Upload Anyway";
}
