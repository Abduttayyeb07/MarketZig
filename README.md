# ZIG Whale-Alert Telegram Bot

Standalone Telegram bot (Node.js + TypeScript, single process, no framework, no database) that monitors ZIG/USDT on 5 exchanges (MEXC, Bybit, KuCoin, Gate.io, Bitget) and sends a "Whale Sniper" style alert the instant any single buy transaction crosses a fixed USDT threshold.

## How it works

Every `POLL_INTERVAL_SEC` seconds, for each enabled exchange:

1. Fetch recent trades and the 24h ticker.
2. For each new BUY trade (deduped by id), check its notional value.
3. If a single trade's notional is >= `BUY_TX_ALERT_THRESHOLD_USDT`, broadcast a Telegram alert immediately for that transaction.

There's no window aggregation, threshold-as-%-of-volume, or cooldown — every qualifying transaction gets its own alert, on every exchange, independently.

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
| `BUY_TX_ALERT_THRESHOLD_USDT` | Alert instantly when a single buy transaction's notional value is >= this (default 1000000) |
| `ENABLE_MEXC` / `ENABLE_BYBIT` / `ENABLE_KUCOIN` / `ENABLE_GATEIO` / `ENABLE_BITGET` | Toggle each exchange adapter |

Lower `BUY_TX_ALERT_THRESHOLD_USDT` for more alerts (e.g. `250000`), raise it to only catch the biggest single trades.

## Project layout

```
src/
  index.ts              # poll loop, per-transaction detector
  types.ts              # normalized Trade/Ticker/ExchangeAdapter types
  config.ts              # env-derived config
  format.ts               # shared number formatting (38400 -> "38.4K")
  logger.ts               # timestamped console logger
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
