/**
 * AURIX Mock Backend — for Divyanshi's local testing only.
 * Zero npm dependencies. Matches the VS Code Extension Integration Roadmap:
 *   - POST /api/auth/login          -> { access_token }
 *   - POST /api/scans/upload        -> multipart fields: source_code, project_id
 *                                      -> 202 { scan_id }
 *   - GET  /api/scans/<scan_id>     -> flat { scan_id, status, findings?, summary? }
 *                                      status: PENDING | SCANNING | COMPLETED | FAILED
 *   - POST /api/secret-guard/classify (AURIX-specific AI upgrade, not in the
 *                                      core roadmap but used by secretGuard.ts)
 *
 * Run:  node mock-server/server.js
 * Then set aurix.apiEndpoint to http://localhost:8000 for local testing
 * (the real default is https://major-project-yo0n.onrender.com).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8000;
const REPORT = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "sample-report.json"), "utf-8"));

const scans = new Map(); // scan_id -> { startedAt }
const FAKE_TOKEN = "mock-jwt-token";
const SCAN_DURATION_MS = 8000; // pretend the scan takes 8s instead of 2-3 min

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  if (req.method === "POST" && req.url === "/api/auth/login") {
    await readBody(req);
    return sendJson(res, 200, { access_token: FAKE_TOKEN });
  }

  if (req.method === "POST" && req.url === "/api/scans/upload") {
    // NOTE: this mock doesn't actually parse the multipart body to check
    // for `source_code`/`project_id` fields — it just drains the stream.
    // If the real backend is strict about required fields, that check only
    // happens there, not here.
    await readBody(req);
    const scanId = `mock-${Date.now()}`;
    scans.set(scanId, { startedAt: Date.now() });
    console.log(`  -> created scan_id=${scanId}`);
    return sendJson(res, 202, { scan_id: scanId });
  }

  const pollMatch = req.method === "GET" && req.url.match(/^\/api\/scans\/([^/]+)$/);
  if (pollMatch) {
    const scanId = pollMatch[1];
    const scan = scans.get(scanId);
    if (!scan) return sendJson(res, 404, { scan_id: scanId, status: "FAILED", error: "unknown scan_id" });

    const elapsed = Date.now() - scan.startedAt;
    if (elapsed < SCAN_DURATION_MS) {
      const status = elapsed < SCAN_DURATION_MS / 2 ? "PENDING" : "SCANNING";
      return sendJson(res, 200, { scan_id: scanId, status });
    }

    // Flat shape: status alongside the report fields directly, per the roadmap.
    return sendJson(res, 200, {
      scan_id: scanId,
      status: "COMPLETED",
      url: REPORT.url,
      timestamp: REPORT.timestamp,
      summary: REPORT.summary,
      findings: REPORT.findings,
    });
  }

  if (req.method === "POST" && req.url === "/api/secret-guard/classify") {
    const body = await readBody(req);
    let candidates = [];
    try {
      candidates = JSON.parse(body.toString("utf-8")).candidates ?? [];
    } catch {
      candidates = [];
    }
    const results = candidates.map((c) => ({
      file: c.file,
      line: c.line,
      verdict: /test|example|dummy|fake/i.test(c.snippet) ? "likely_placeholder" : "likely_real_secret",
      reason: "mock classifier: keyword heuristic only",
    }));
    return sendJson(res, 200, { results });
  }

  sendJson(res, 404, { error: "not found (mock server)" });
});

server.listen(PORT, () => {
  console.log(`AURIX mock backend listening on http://localhost:${PORT}`);
  console.log(`Scans complete ${SCAN_DURATION_MS / 1000}s after upload, using the real sample report as fixture data.`);
});
