// Netlify Function: fetches index data from Yahoo Finance on the server side,
// so the browser never hits a CORS block.
const SYMBOLS = { nifty: "^NSEI", sensex: "^BSESN", banknifty: "^NSEBANK" };

exports.handler = async (event) => {
  const key = (event.queryStringParameters || {}).m || "nifty";
  const symbol = SYMBOLS[key] || SYMBOLS.nifty;
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) +
    "?interval=1d&range=5d";

  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error("Yahoo HTTP " + res.status);
    const json = await res.json();
    const r = json.chart.result[0];
    const closes = r.indicators.quote[0].close.filter((c) => c != null);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify({
        price: r.meta.regularMarketPrice,
        prev: closes[closes.length - 2],
        time: r.meta.regularMarketTime * 1000,
      }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(e) }),
    };
  }
};
