export const presets = [
  {
    id: "momentum_breakout",
    name: "强势突破",
    description: "找趋势向上、成交活跃、规模不太小的股票，适合发现资金正在集中的方向。",
    fmpParams: {
      marketCapMoreThan: 2_000_000_000,
      volumeMoreThan: 500_000,
      priceMoreThan: 10,
      isActivelyTrading: true,
      limit: 80
    },
    finvizUrl:
      "https://finviz.com/screener.ashx?v=111&f=cap_midover,sh_avgvol_o500,sh_price_o10,ta_sma20_pa,ta_sma50_pa,ta_sma200_pa&ft=4&o=-change"
  },
  {
    id: "quality_growth",
    name: "优质成长",
    description: "先过滤基本面质量，再看估值和价格行为，适合周末深挖。",
    fmpParams: {
      marketCapMoreThan: 2_000_000_000,
      volumeMoreThan: 300_000,
      priceMoreThan: 8,
      isActivelyTrading: true,
      limit: 80
    },
    finvizUrl:
      "https://finviz.com/screener.ashx?v=121&f=cap_midover,fa_sales5years_o10,fa_eps5years_o10,fa_roe_o15,sh_avgvol_o300,sh_price_o8&ft=4&o=-marketcap"
  },
  {
    id: "pullback_watch",
    name: "强股回调",
    description: "找流动性好、规模较大、价格回调后可能接近观察区的股票。",
    fmpParams: {
      marketCapMoreThan: 10_000_000_000,
      volumeMoreThan: 800_000,
      priceMoreThan: 15,
      isActivelyTrading: true,
      limit: 80
    },
    finvizUrl:
      "https://finviz.com/screener.ashx?v=111&f=cap_largeover,sh_avgvol_o750,sh_price_o15,ta_sma200_pa,ta_rsi_nob60&ft=4&o=-marketcap"
  },
  {
    id: "unusual_volume",
    name: "异常放量",
    description: "捕捉突然被市场注意到的股票，之后必须用新闻和财报解释原因。",
    fmpParams: {
      marketCapMoreThan: 500_000_000,
      volumeMoreThan: 1_000_000,
      priceMoreThan: 5,
      isActivelyTrading: true,
      limit: 100
    },
    finvizUrl:
      "https://finviz.com/screener.ashx?v=111&s=ta_unusualvolume&f=cap_smallover,sh_price_o5,sh_avgvol_o500&ft=4&o=-relativevolume"
  },
  {
    id: "earnings_watch",
    name: "财报观察",
    description: "财报前后波动通常更大，适合做风险提醒和研究排程。",
    fmpParams: {
      marketCapMoreThan: 2_000_000_000,
      volumeMoreThan: 500_000,
      priceMoreThan: 10,
      isActivelyTrading: true,
      limit: 80
    },
    finvizUrl:
      "https://finviz.com/screener.ashx?v=111&f=cap_midover,earningsdate_nextweek,sh_avgvol_o500,sh_price_o10&ft=4&o=-marketcap"
  }
];

export function getPreset(id) {
  return presets.find((preset) => preset.id === id) || presets[0];
}
