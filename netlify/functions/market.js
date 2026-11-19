// Netlify Function: fetches index data from Yahoo Finance on the server side.
// Returns price, prev, high52, dma200, close1m, rsi14, and (for VIX) just the level.

const SYMBOLS = {
  // Core
  nifty:       "^NSEI",
  sensex:      "^BSESN",
  banknifty:   "^NSEBANK",
  niftynext50: "^NSMIDCP",

  // Broader
  midcap:      "NIFTYMIDCAP150.NS",
  smallcap:    "NIFTYSMLCAP250.NS",

  // Sectors
  it:          "^CNXIT",
  auto:        "^CNXAUTO",
  pharma:      "^CNXPHARMA",
  fmcg:        "^CNXFMCG",
  metal:       "^CNXMETAL",

  // Fear gauge
  indiavix:    "^INDIAVIX"
};

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=180",
  "Access-Control-Allow-Origin": "*"
};

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

async function fetchOne(key) {
  const symbol = SYMBOLS[key];
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) +
    "?interval=1d&range=1y";

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketMood/1.0)" },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error("Yahoo HTTP " + res.status);

  const json = await res.json();
  const r = json.chart.result[0];
  const q = r.indicators.quote[0];
  const closes = (q.close || []).filter(c => c != null);
  const highs  = (q.high  || []).filter(h => h != null);

  const price = r.meta.regularMarketPrice;
  const prev  = closes[closes.length - 2];
  if (price == null || prev == null) throw new Error("No data");

  // Special case for India VIX – we only need the level
  if (key === "indiavix") {
    return {
      key,
      symbol,
      price,
      prev,
      high52: Math.max(...highs, price),
      dma200: null,
      close1m: closes.length > 22 ? closes[closes.length - 22] : null,
      rsi14: null,
      time: r.meta.regularMarketTime * 1000
    };
  }

  const high52 = Math.max(price, ...(highs.length ? highs : closes));
  const last200 = closes.slice(-200);
  const dma200 = last200.length >= 100
    ? last200.reduce((a, b) => a + b, 0) / last200.length
    : null;
  const close1m = closes.length > 22 ? closes[closes.length - 22] : null;
  const rsi14 = calcRSI(closes, 14);

  return {
    key, symbol, price, prev, high52, dma200, close1m, rsi14,
    time: r.meta.regularMarketTime * 1000
  };
}

exports.handler = async (event) => {
  const m = (event.queryStringParameters || {}).m || "all";

  try {
    if (m === "all") {
      const keys = Object.keys(SYMBOLS);
      const results = await Promise.allSettled(keys.map(fetchOne));

      const indices = [];
      const failed  = [];

      results.forEach((r, i) => {
        if (r.status === "fulfilled") indices.push(r.value);
        else failed.push({
          key: keys[i],
          symbol: SYMBOLS[keys[i]],
          error: String((r.reason && r.reason.message) || r.reason)
        });
      });

      if (!indices.length) throw new Error("All indices failed");

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          indices,
          failed,
          updated: Date.now(),
          source: "yahoo"
        })
      };
    }

    const key = SYMBOLS[m] ? m : "nifty";
    const d = await fetchOne(key);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) };

  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(e) })
    };
  }
};
