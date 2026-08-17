#!/usr/bin/env bun
/**
 * Show Gmail API quota usage for the current GCP project.
 *
 *   gcloud auth application-default login
 *   bun scripts/gcp-api-usage.ts
 */

import { spawnSync } from "node:child_process";

const SERVICE = "gmail.googleapis.com";
const PROJECT = process.argv[2] ?? getDefaultProject();
if (!PROJECT) {
  console.error("No project. Pass as arg: bun scripts/gcp-api-usage.ts <projectId>");
  process.exit(1);
}

const token = getAccessToken();

const metricsUrl = `https://serviceusage.googleapis.com/v1beta1/projects/${PROJECT}/services/${SERVICE}/consumerQuotaMetrics?pageSize=200`;
const res = await fetch(metricsUrl, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const body = (await res.json()) as { metrics?: QuotaMetric[] };

console.log(`Gmail API quotas for ${PROJECT}\n`);

for (const m of body.metrics ?? []) {
  const name = m.displayName ?? m.metric ?? "(unnamed)";
  for (const lim of m.consumerQuotaLimits ?? []) {
    const bucket = lim.quotaBuckets?.[0];
    const limit = Number(bucket?.effectiveLimit ?? bucket?.defaultLimit ?? 0);
    if (!limit) continue;

    const usage = await usageStats(m.metric ?? "", lim.unit ?? "");

    console.log(`${name} (${humanUnit(lim.unit)})`);
    console.log(`  limit:    ${limit.toLocaleString()}`);
    console.log(`  current:  ${formatLine(usage?.latest, limit)}`);
    console.log(`  peak 24h: ${formatLine(usage?.peak, limit)}`);
    if (usage?.latest != null) console.log(`  ${renderBar((usage.latest / limit) * 100)}\n`);
    else console.log("");
  }
}

async function usageStats(
  metric: string,
  unit: string,
): Promise<{ latest: number; peak: number } | null> {
  if (!metric) return null;
  const perMin = unit.includes("/min");
  const perDay = unit.includes("/d");
  if (!perMin && !perDay) return null;

  const align = perMin ? "60s" : "86400s";
  const lookback = 24 * 3600_000;
  const now = new Date();
  const start = new Date(now.getTime() - lookback);

  const params = new URLSearchParams({
    filter: [
      `metric.type="serviceruntime.googleapis.com/quota/rate/net_usage"`,
      `resource.label."service"="${SERVICE}"`,
      `metric.label."quota_metric"="${metric}"`,
    ].join(" AND "),
    "interval.startTime": start.toISOString(),
    "interval.endTime": now.toISOString(),
    "aggregation.alignmentPeriod": align,
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });

  const url = `https://monitoring.googleapis.com/v3/projects/${PROJECT}/timeSeries?${params}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const data = (await r.json()) as TimeSeriesResponse;
  const points = data.timeSeries?.[0]?.points ?? [];
  if (points.length === 0) return { latest: 0, peak: 0 };

  // Monitoring returns points newest-first.
  const values = points.map((p) => Number(p.value.int64Value ?? p.value.doubleValue ?? 0));
  return { latest: values[0] ?? 0, peak: Math.max(...values) };
}

function formatLine(value: number | undefined, limit: number): string {
  if (value == null) return "—";
  const pct = ((value / limit) * 100).toFixed(1) + "%";
  return `${value.toLocaleString()} / ${limit.toLocaleString()}  (${pct})`;
}

function renderBar(pct: number): string {
  const width = 30;
  const filled = Math.min(width, Math.round((pct / 100) * width));
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

function humanUnit(unit: string | undefined): string {
  if (!unit) return "";
  if (unit.includes("/min/{project}/{user}")) return "per user per minute";
  if (unit.includes("/min/{project}")) return "per minute";
  if (unit.includes("/d/{project}")) return "per day";
  return unit;
}

function getAccessToken(): string {
  const r = spawnSync("gcloud", ["auth", "application-default", "print-access-token"], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error("Run: gcloud auth application-default login");
    process.exit(1);
  }
  return r.stdout.trim();
}

function getDefaultProject(): string | undefined {
  const r = spawnSync("gcloud", ["config", "get-value", "project"], { encoding: "utf8" });
  const p = r.stdout.trim();
  return p && p !== "(unset)" ? p : undefined;
}

type TimeSeriesResponse = {
  timeSeries?: Array<{ points?: Array<{ value: { int64Value?: string; doubleValue?: number } }> }>;
};

type QuotaMetric = {
  metric?: string;
  displayName?: string;
  consumerQuotaLimits?: Array<{
    unit?: string;
    quotaBuckets?: Array<{ effectiveLimit?: string; defaultLimit?: string }>;
  }>;
};
