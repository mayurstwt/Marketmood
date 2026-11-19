// Netlify Function: fetches index data from Yahoo Finance on the server side,
// so the browser never hits a CORS block.
//
//   /.netlify/functions/market?m=all      -> every index below, in one call
//   /.netlify/functions/market?m=nifty    -> a single index
//
// For each index it returns what the meter needs:
//   price, prev (yesterday's close), high52 (52-week high),
//   dma200 (200-day average of closes) and close1m (close ~21 trading days ago).
//
// To add an index: add a line here AND the same key in the INDICES list in
// index.html (that is where label / weight / fall live).
const SYMBOLS = {
  nifty: "^NSEI",
  sensex: "^BSESN",
  banknifty: "^NSEBANK",
  niftynext50: "^NSMIDCP",
  it: "^CNXIT",
  auto: "^CNXAUTO",
  pharma: "^CNXPHARMA",
  fmcg: "^CNXFMCG",
  metal: "^CNXMETAL",
  // Broader-market indices: check the symbol on Yahoo before enabling.
  // midcap: "^CRSMID",
  // smallcap: "^CNXSC",
};

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=300",
};

async function fetchOne(key) {
  const symbol = SYMBOLS[key];
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) +
    "?interval=1d&range=1y";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error("Yahoo HTTP " + res.status);
  const json = await res.json();
  const r = json.chart.result[0];
  const q = r.indicators.quote[0];
  const closes = q.close.filter((c) => c != null);
  const highs = (q.high || []).filter((h) => h != null);

  const price = r.meta.regularMarketPrice;
  const prev = closes[closes.length - 2];
  if (price == null || prev == null) throw new Error("No data");

  // 52-week high: highest intraday high (or close) in the last year, never below today's price.
  const high52 = Math.max(price, ...(highs.length ? highs : closes));
  // 200-day average of closes (needs at least 100 days, otherwise left out and the UI skips it).
  const last200 = closes.slice(-200);
  const dma200 = last200.length >= 100 ? last200.reduce((a, b) => a + b, 0) / last200.length : null;
  // Close about one month (21 trading days) ago.
  const close1m = closes.length > 22 ? closes[closes.length - 1 - 21] : null;

  return { key, symbol, price, prev, high52, dma200, close1m, time: r.meta.regularMarketTime * 1000 };
}

exports.handler = async (event) => {
  const m = (event.queryStringParameters || {}).m || "all";

  try {
    if (m === "all") {
      const keys = Object.keys(SYMBOLS);
      // allSettled: one bad symbol must not take the whole dashboard down.
      const results = await Promise.allSettled(keys.map(fetchOne));
      const indices = [];
      const failed = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") indices.push(r.value);
        else failed.push({ key: keys[i], symbol: SYMBOLS[keys[i]], error: String((r.reason && r.reason.message) || r.reason) });
      });
      if (!indices.length) throw new Error("All indices failed: " + JSON.stringify(failed));
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ indices, failed, updated: Date.now() }),
      };
    }

    const key = SYMBOLS[m] ? m : "nifty";
    const d = await fetchOne(key);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(e) }),
    };
  }
};
