# Market Mood

A simple, transparent **Indian market valuation score** (0–100).  
Higher score = better long-term entry point.

Live at: https://msxmood.netlify.app/

## How the score works

For every index we calculate:

| Factor              | Weight | Logic                                      |
|---------------------|--------|--------------------------------------------|
| Drawdown from 52w high | 50%  | Deeper discount → higher score             |
| vs 200-day MA       | 18%    | Below average → higher score               |
| 1-month return      | 12%    | Sharp fall → higher score                  |
| RSI(14)             | 10%    | Oversold → higher score                    |
| India VIX           | 10%    | High fear → higher score                   |

Weights are automatically re-scaled if some data is missing.

**Falling-knife warning** appears when any major index is down >10% in the last month.

## Indices used

- Nifty 50, Sensex, Bank Nifty, Nifty Next 50  
- Nifty Midcap 150, Nifty Smallcap 250  
- IT, Auto, Pharma, FMCG, Metal  
- India VIX (fear gauge)

## Local development

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Run locally
netlify dev
