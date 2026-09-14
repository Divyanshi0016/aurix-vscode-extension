import * as vscode from "vscode";
import * as fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import { getApiEndpoint, getScanTimeoutMs } from "./config";
import { logger } from "./outputLogger";

/**
 * Finding shape per API_CONTRACT.md / the real sample report. Note the
 * Integration Roadmap PDF describes fields loosely as "file_path" and
 * "line_number" in prose, but the actual sample JSON from Divyansh's
 * engine uses "file" and "line" — this client trusts the real sample data
 * and falls back defensively if the live backend ever sends the other names.
 */
export interface Finding {
  id: string;
  rule_id: string;
  tool?: string;
  category?: string;
  title: string;
  description?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  cvss?: number;
  file?: string;
  file_path?: string; // fallback name per Integration Roadmap wording
  line?: number;
  line_number?: number; // fallback name per Integration Roadmap wording
  evidence?: string;
  fix?: string;
  suggested_fix?: string;
  references?: string[];

  verified?: boolean;
  wargame_status?: "PoC Failed" | "Exploit Confirmed" | "Neutralized";
  ai_reasoning?: string;
  poc_script?: string;
  patch_code?: string;
}

export function findingFile(f: Finding): string {
  return f.file ?? f.file_path ?? "";
}

export function findingLine(f: Finding): number {
  return f.line ?? f.line_number ?? 1;
}

export function findingPatchCode(f: Finding): string | undefined {
  return f.patch_code || f.suggested_fix || f.fix;
}

export interface ScanSummary {
  total_findings: number;
  neutralized_count: number;
  scan_engine: string;
}

export type ScanStatus = "PENDING" | "SCANNING" | "ANALYZING" | "COMPLETED" | "FAILED";

/**
 * Per the Integration Roadmap: GET /api/scans/<scan_id> returns a FLAT
 * object — status alongside scan_id, and findings/summary populate once
 * status is COMPLETED. (This differs from an earlier draft of this file
 * that assumed a nested `{status, report}` envelope — if the real backend
 * turns out to nest it after all, this is the one place to change.)
 */
export interface ScanStatusResponse {
  scan_id: string;
  status: ScanStatus;
  progress?: number;
  current_step?: string;
  url?: string;
  timestamp?: string;
  summary?: ScanSummary;
  findings?: Finding[];
  error?: string;
}

export function verifiedFindings(response: ScanStatusResponse): Finding[] {
  const rawList: Finding[] =
    response.findings ??
    (response as any).results ??
    (response as any).vulnerabilities ??
    (response as any).report?.findings ??
    (response as any).report?.results ??
    (response as any).data?.findings ??
    [];

  return rawList.filter((f) => f.verified !== false);
}

/**
 * POST /api/scans/upload — multipart/form-data with fields
 * `source_code` (the zip) and `project_id`, per the Integration Roadmap.
 */
export async function uploadScan(zipPath: string, token: string, projectId: string): Promise<string> {
  const form = new FormData();
  form.append("source_code", fs.createReadStream(zipPath));
  form.append("project_id", projectId);

  const res = await fetch(`${getApiEndpoint()}/api/scans/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    body: form as any,
  });

  // Roadmap specifies 202 Accepted on success — accept any 2xx defensively.
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 413) {
      throw new Error(`Upload rejected as too large by the backend (413). ${text}`);
    }
    if (res.status === 429) {
      throw new Error(`AURIX: scan rate limit hit. Wait a while before trying again. ${text}`);
    }
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { scan_id: string };
  logger.info(`Upload accepted (HTTP ${res.status}), scan_id=${data.scan_id}`);
  return data.scan_id;
}

/**
 * GET /api/scans/<scan_id> polled every 5s per the Integration Roadmap.
 * Terminates on COMPLETED or FAILED; PENDING/SCANNING keep polling.
 */
export async function pollScanStatus(
  scanId: string,
  token: string,
  onStatusUpdate?: (response: ScanStatusResponse) => void
): Promise<ScanStatusResponse> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AURIX: scanning your code (typically 2-3 min)…",
      cancellable: false,
    },
    async (progress) => {
      const deadline = Date.now() + getScanTimeoutMs();
      let lastStateKey = "";

      while (Date.now() < deadline) {
        const res = await fetch(`${getApiEndpoint()}/api/scans/${scanId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error(`Polling failed (${res.status})`);
        }

        const data = (await res.json()) as ScanStatusResponse;
        const currentStateKey = `${data.status}:${data.current_step ?? ""}:${data.progress ?? ""}`;

        if (currentStateKey !== lastStateKey) {
          const stepMsg = data.current_step ? ` (${data.current_step})` : "";
          progress.report({ message: `${data.status}${stepMsg}` });
          logger.info(`Scan ${scanId} status -> ${data.status}${stepMsg}`);
          lastStateKey = currentStateKey;
          if (onStatusUpdate) {
            onStatusUpdate(data);
          }
        }

        if (data.status === "COMPLETED") {
          return data;
        }
        if (data.status === "FAILED") {
          throw new Error(`Scan ${scanId} failed: ${data.error ?? "unknown error"}`);
        }
        // PENDING or SCANNING -> keep polling.

        await new Promise((r) => setTimeout(r, 5000));
      }

      throw new Error(`Scan ${scanId} timed out after ${getScanTimeoutMs() / 1000}s.`);
    }
  );
}
