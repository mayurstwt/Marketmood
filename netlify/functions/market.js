// Netlify Function: fetches index data from Yahoo Finance on the server side,
// so the browser never hits a CORS block.
//
//   /.netlify/functions/market?m=all      -> every index below, in one call
//   /.netlify/functions/market?m=nifty    -> a single index (old behaviour)
//
// To add an index: add a line here AND the same key in the INDICES list in
// index.html (that is where label / weight / clamp live).
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
    "?interval=1d&range=5d";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error("Yahoo HTTP " + res.status);
  const json = await res.json();
  const r = json.chart.result[0];
  const closes = r.indicators.quote[0].close.filter((c) => c != null);
  const price = r.meta.regularMarketPrice;
  const prev = closes[closes.length - 2];
  if (price == null || prev == null) throw new Error("No data");
  return { key, symbol, price, prev, time: r.meta.regularMarketTime * 1000 };
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
        else failed.push({ key: keys[i], symbol: SYMBOLS[keys[i]], error: String(r.reason && r.reason.message || r.reason) });
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
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ price: d.price, prev: d.prev, time: d.time }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(e) }),
    };
  }
};
