/**
 * Lightweight beta usage meter.
 * Counters are process-local and reset when the API process restarts.
 * Persisted billing-grade metering should replace this before paid quotas are enforced.
 */
type ProjectUsage = {
  requests: number;
  successful: number;
  failed: number;
  egressBytes: number;
  lastRequestAt: string | null;
  statusCodes: Record<string, number>;
};

const usage = new Map<string, ProjectUsage>();

function emptyUsage(): ProjectUsage {
  return { requests: 0, successful: 0, failed: 0, egressBytes: 0, lastRequestAt: null, statusCodes: {} };
}

export async function recordProjectUsage(projectId: string, status: number, egressBytes: number) {
  const current = usage.get(projectId) || emptyUsage();
  current.requests += 1;
  if (status >= 200 && status < 400) current.successful += 1;
  else current.failed += 1;
  current.egressBytes += Math.max(0, egressBytes || 0);
  current.lastRequestAt = new Date().toISOString();
  const bucket = String(status);
  current.statusCodes[bucket] = (current.statusCodes[bucket] || 0) + 1;
  usage.set(projectId, current);
}

export function getProjectUsage(projectId: string) {
  const current = usage.get(projectId) || emptyUsage();
  return {
    ...current,
    egressMB: Number((current.egressBytes / (1024 * 1024)).toFixed(3)),
    window: "since_api_restart",
    persistent: false
  };
}
