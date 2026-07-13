# ZIG Whale-Alert Telegram Bot

Standalone Telegram bot (Node.js + TypeScript, single process, no framework, no database) that monitors ZIG/USDT on 5 exchanges (MEXC, Bybit, KuCoin, Gate.io, Bitget) and sends "Whale Sniper" style alerts for unusual buying/selling activity — one alert per exchange.

## How it works

Every `POLL_INTERVAL_SEC` seconds, for each enabled exchange:

1. Fetch recent trades and the 24h ticker.
2. Dedup new trades by id and append to a rolling in-memory buffer; evict trades older than `WINDOW_MIN` minutes.
3. Sum BUY and SELL notional (USDT) within the window.
4. If either side's notional exceeds `max(ABS_FLOOR_USDT, 24h_volume * SHARE_PCT / 100)`, broadcast a Telegram alert — unless that (exchange, side) is on cooldown. While on cooldown, an alert still fires if the new notional has grown to at least `ESCALATION_MULT` × the notional that triggered the last alert (so a whale that keeps buying bigger and bigger doesn't go silent for the full cooldown window).

Each exchange is wrapped in try/catch — a failure or delisting on one exchange is logged and skipped, never crashing the loop.

## Subscribing to alerts

There's no `TELEGRAM_CHAT_ID` to configure anymore. Instead, the bot long-polls Telegram for commands and persists subscriber chat ids to `data/subscribers.json` (created automatically, gitignored):

- `/start` — shows a short help message
- `/subscribe` — start receiving alerts in that chat
- `/unsubscribe` — stop receiving alerts in that chat

Message your bot on Telegram with `/subscribe` (works in DMs, groups, or channels the bot is added to) and it'll start receiving whale alerts. Subscriptions persist across restarts since they live in `data/subscribers.json`.

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your TELEGRAM_BOT_TOKEN
npm run dev
# then message your bot /subscribe on Telegram
```

## Build & run compiled

```bash
npm run build
npm start
```

## Run with Docker (recommended for a server)

```bash
cp .env.example .env
# edit .env with your TELEGRAM_BOT_TOKEN
docker compose up -d --build
```

That's it — one process, restarts automatically (`restart: unless-stopped`), and `data/subscribers.json` is bind-mounted to the host (`./data`) so subscriptions survive container rebuilds/restarts.

Useful commands:

```bash
docker compose logs -f       # tail logs
docker compose restart       # restart the bot
docker compose down          # stop and remove the container
docker compose up -d --build # rebuild after pulling code changes
```

## Configuration (.env)

| Var | Meaning |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `POLL_INTERVAL_SEC` | Seconds between poll cycles (default 5) |
| `WINDOW_MIN` | Rolling trade window in minutes (default 5) |
| `SHARE_PCT` | Alert when window notional >= this % of 24h volume (default 6) |
| `ABS_FLOOR_USDT` | Absolute floor so thin markets don't spam (default 1500) |
| `COOLDOWN_MIN` | Minimum minutes between repeat alerts per (exchange, side) (default 45) |
| `ESCALATION_MULT` | During cooldown, re-alert anyway if new notional >= this × the notional that triggered the last alert (default 1.5) |
| `ENABLE_MEXC` / `ENABLE_BYBIT` / `ENABLE_KUCOIN` / `ENABLE_GATEIO` / `ENABLE_BITGET` | Toggle each exchange adapter |

Lower `SHARE_PCT` to 4-5 for more alerts; raise to 8-10 to only catch large whales.

## Project layout

```
src/
  index.ts              # poll loop, detector
  types.ts              # normalized Trade/Ticker/ExchangeAdapter types
  telegramBot.ts         # /subscribe, /unsubscribe command handling + alert broadcast
  subscribers.ts         # reads/writes data/subscribers.json
  exchanges/
    mexc.ts
    bybit.ts
    kucoin.ts
    gateio.ts
    bitget.ts
data/
  subscribers.json       # created at runtime, gitignored
Dockerfile
docker-compose.yml
```

Each adapter exports `fetchTicker()` and `fetchTrades()` returning the normalized `Ticker`/`Trade` shapes defined in `src/types.ts`, regardless of the venue's native symbol format or field names.
