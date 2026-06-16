export function scoreStock(input) {
  const reasons = [];
  const risks = [];
  let score = 50;

  if ((input.marketCap ?? 0) > 10_000_000_000) {
    score += 8;
    reasons.push("市值和流动性更适合持续跟踪");
  }
  if ((input.volume ?? 0) > 1_000_000) score += 6;
  if ((input.changesPercentage ?? 0) > 2) {
    score += 5;
    reasons.push("短期价格有资金关注迹象");
  }
  if ((input.revenueGrowth ?? 0) > 0.1) {
    score += 10;
    reasons.push("收入仍在增长");
  }
  if ((input.netIncomeGrowth ?? 0) > 0.1) score += 8;
  if ((input.grossMargin ?? 0) > 0.35) score += 5;
  if ((input.operatingMargin ?? 0) > 0.15) score += 5;
  if ((input.sma50Distance ?? 0) > 0 && (input.sma200Distance ?? 0) > 0) {
    score += 10;
    reasons.push("中长期趋势仍偏强");
  }
  if ((input.rsi ?? 50) > 75) {
    score -= 8;
    risks.push("RSI 偏高，短期可能过热");
  }
  if ((input.pe ?? 0) > 70) {
    score -= 8;
    risks.push("估值容错率较低");
  }
  if ((input.debtToEquity ?? 0) > 2) {
    score -= 6;
    risks.push("杠杆偏高，需要看现金流和债务期限");
  }
  if ((input.marketCap ?? 0) < 1_000_000_000) {
    score -= 8;
    risks.push("市值较小，波动和流动性风险更高");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.length ? reasons : ["进入筛选池，但需要更多证据确认质量"],
    risks: risks.length ? risks : ["主要风险需要从财报、估值和新闻中继续验证"]
  };
}
