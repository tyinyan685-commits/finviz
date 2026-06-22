function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function difference(current, previous) {
  const currentNumber = finite(current);
  const previousNumber = finite(previous);
  return currentNumber === null || previousNumber === null ? null : currentNumber - previousNumber;
}

function signed(value) {
  return `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10}`;
}

function eventKey(event) {
  return event?.url || `${event?.date || ""}|${event?.title || ""}`;
}

export function summarizeRatingChange(current, previous) {
  if (!current || !previous) return null;
  if (current.model_version && previous.model_version && current.model_version !== previous.model_version) {
    return {
      previousRunDate: previous.run_date,
      score: null,
      fundamental: null,
      technical: null,
      expectation: null,
      reasons: [`模型升级：${previous.model_version} → ${current.model_version}，分数暂不直接比较`]
    };
  }
  const changes = {
    previousRunDate: previous.run_date,
    score: difference(current.score, previous.score),
    fundamental: difference(current.fundamental_score, previous.fundamental_score),
    technical: difference(current.technical_score, previous.technical_score),
    expectation: difference(current.sentiment_score, previous.sentiment_score),
    reasons: []
  };

  const currentState = current.metrics?.snapshot?.researchState || current.rating;
  const previousState = previous.metrics?.snapshot?.researchState || previous.rating;
  if (currentState && previousState && currentState !== previousState) {
    changes.reasons.push(`研究状态：${previousState} → ${currentState}`);
  }

  const componentChanges = [
    ["基本面", changes.fundamental],
    ["技术面", changes.technical],
    ["市场预期", changes.expectation]
  ]
    .filter(([, value]) => value !== null && value !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  componentChanges.slice(0, 2).forEach(([label, value]) => changes.reasons.push(`${label} ${signed(value)}`));

  const currentFundamentals = current.metrics?.fundamentals || {};
  const previousFundamentals = previous.metrics?.fundamentals || {};
  const currentEps = finite(currentFundamentals.epsEstimate);
  const previousEps = finite(previousFundamentals.epsEstimate);
  if (
    currentEps !== null && previousEps !== null && previousEps !== 0 &&
    currentFundamentals.estimateDate && currentFundamentals.estimateDate === previousFundamentals.estimateDate
  ) {
    const epsChange = ((currentEps - previousEps) / Math.abs(previousEps)) * 100;
    if (Math.abs(epsChange) >= 0.1) changes.reasons.push(`EPS预测${epsChange > 0 ? "上调" : "下调"} ${Math.abs(epsChange).toFixed(1)}%`);
  }

  const currentRisk = current.metrics?.risk;
  const previousRisk = previous.metrics?.risk;
  if (currentRisk?.level && previousRisk?.level && currentRisk.level !== previousRisk.level) {
    changes.reasons.push(`风险：${previousRisk.level} → ${currentRisk.level}`);
  }

  const previousEvents = new Set((previous.metrics?.expectation?.news?.matchedEvents || []).map(eventKey));
  const newEvent = (current.metrics?.expectation?.news?.matchedEvents || []).find((event) => !previousEvents.has(eventKey(event)));
  if (newEvent?.title) {
    const title = String(newEvent.title).slice(0, 54);
    changes.reasons.push(`新增${newEvent.direction === "negative" ? "负向" : "正向"}事件：${title}`);
  }

  changes.reasons = changes.reasons.slice(0, 4);
  return changes;
}
