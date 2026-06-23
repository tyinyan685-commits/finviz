import { CURRENT_RATING_MODEL_VERSION } from "./rating-contract.js";

function uniqueSymbols(rows) {
  return new Set(rows.map((row) => row.symbol).filter(Boolean)).size;
}

export function summarizeAutomationStatus({ runSummary, ratings, candidateCount, expectedPresetCount, now = Date.now() }) {
  const latestRunDate = runSummary?.latestRunDate || null;
  const snapshotCoverage = Number(runSummary?.latestPresetCount || 0);
  const snapshotComplete = expectedPresetCount > 0 && snapshotCoverage >= expectedPresetCount;
  const latestRatings = (ratings || []).filter((rating) => !latestRunDate || rating.run_date === latestRunDate);
  const currentRatings = latestRatings.filter((rating) => rating.model_version === CURRENT_RATING_MODEL_VERSION);
  const expectedRatings = Math.min(40, Math.max(0, Number(candidateCount) || 0));
  const currentRatingCount = uniqueSymbols(currentRatings);
  const latestRatingCount = uniqueSymbols(latestRatings);
  const latestGeneratedAt = currentRatings
    .map((rating) => rating.generated_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const ageHours = latestGeneratedAt ? Math.max(0, (now - Date.parse(latestGeneratedAt)) / 3600000) : null;

  let status = "healthy";
  let label = "正常";
  let message = `当前模型评级已覆盖 ${currentRatingCount}/${expectedRatings} 只候选。`;
  if (!snapshotComplete) {
    status = "waiting_snapshot";
    label = "等待快照";
    message = `最新快照覆盖 ${snapshotCoverage}/${expectedPresetCount} 个雷达。`;
  } else if (currentRatingCount === 0) {
    status = "waiting_rating";
    label = "等待评级";
    message = latestRatingCount
      ? `当前 ${latestRatingCount} 条评级仍为旧模型，等待下一次云端评级任务刷新。`
      : "最新快照尚未生成统一评级。";
  } else if (currentRatingCount < expectedRatings) {
    status = "partial_rating";
    label = "部分完成";
    message = `当前模型评级已完成 ${currentRatingCount}/${expectedRatings} 只，其余等待重试。`;
  } else if (ageHours !== null && ageHours > 120) {
    status = "stale";
    label = "数据陈旧";
    message = `最近一次完整评级距今约 ${Math.round(ageHours)} 小时，请检查 Vercel Cron 日志。`;
  }

  return {
    status,
    label,
    message,
    latestRunDate,
    snapshotCoverage,
    expectedPresetCount,
    snapshotComplete,
    currentModelVersion: CURRENT_RATING_MODEL_VERSION,
    currentRatingCount,
    expectedRatings,
    latestRatingCount,
    latestGeneratedAt,
    ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10
  };
}
