import { query } from "./db/client";

type UsageRow = {
  requests: number;
  successful: number;
  failed: number;
  egress_bytes: string | number;
  last_request_at: string | null;
};

export async function ensureUsageTables() {
  await query(`CREATE TABLE IF NOT EXISTS project_usage (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    requests BIGINT NOT NULL DEFAULT 0,
    successful BIGINT NOT NULL DEFAULT 0,
    failed BIGINT NOT NULL DEFAULT 0,
    egress_bytes BIGINT NOT NULL DEFAULT 0,
    last_request_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS project_request_logs (
    id BIGSERIAL PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_bytes BIGINT NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS project_request_logs_project_created_idx ON project_request_logs(project_id, created_at DESC)`);
}

export async function recordProjectUsage(
  projectId: string,
  status: number,
  egressBytes: number,
  method = "GET",
  path = "/",
  durationMs = 0
) {
  const safeBytes = Math.max(0, Math.floor(egressBytes || 0));
  const successful = status >= 200 && status < 400;
  try {
    await query(
      `INSERT INTO project_usage (project_id, requests, successful, failed, egress_bytes, last_request_at, updated_at)
       VALUES ($1, 1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (project_id) DO UPDATE SET
         requests = project_usage.requests + 1,
         successful = project_usage.successful + EXCLUDED.successful,
         failed = project_usage.failed + EXCLUDED.failed,
         egress_bytes = project_usage.egress_bytes + EXCLUDED.egress_bytes,
         last_request_at = NOW(), updated_at = NOW()`,
      [projectId, successful ? 1 : 0, successful ? 0 : 1, safeBytes]
    );
    await query(
      `INSERT INTO project_request_logs (project_id, method, path, status_code, response_bytes, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, String(method).slice(0, 12), String(path).slice(0, 500), status, safeBytes, Math.max(0, Math.floor(durationMs || 0))]
    );
  } catch (error: any) {
    // Metering must not break a customer's API response; report the failure to server logs.
    console.error("[Usage] Failed to persist project telemetry:", error?.message || "unknown error");
  }
}

export async function getProjectUsage(projectId: string) {
  const res = await query(
    `SELECT requests, successful, failed, egress_bytes, last_request_at
     FROM project_usage WHERE project_id = $1`,
    [projectId]
  );
  const row = (res.rows[0] || {
    requests: 0, successful: 0, failed: 0, egress_bytes: 0, last_request_at: null
  }) as UsageRow;
  const egressBytes = Number(row.egress_bytes || 0);
  return {
    requests: Number(row.requests || 0),
    successful: Number(row.successful || 0),
    failed: Number(row.failed || 0),
    egressBytes,
    egressMB: Number((egressBytes / (1024 * 1024)).toFixed(3)),
    lastRequestAt: row.last_request_at,
    persistent: true,
    window: "all_time_since_metering_enabled"
  };
}

export async function getProjectLogs(projectId: string, limit = 100) {
  const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit || 100)));
  const res = await query(
    `SELECT id, method, path, status_code, response_bytes, duration_ms, created_at
     FROM project_request_logs WHERE project_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [projectId, boundedLimit]
  );
  return res.rows;
}
