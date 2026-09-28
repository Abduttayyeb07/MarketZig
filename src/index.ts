import { ExchangeAdapter, ExchangeName } from './types';
import { mexc } from './exchanges/mexc';
import { bybit } from './exchanges/bybit';
import { kucoin } from './exchanges/kucoin';
import { gateio } from './exchanges/gateio';
import { bitget } from './exchanges/bitget';
import { broadcastAlert, getSubscriberCount, startTelegramCommandLoop } from './telegramBot';
import { TELEGRAM_BOT_TOKEN, POLL_INTERVAL_SEC, BUY_TX_ALERT_THRESHOLD_ZIG, NOTABLE_TRADE_RATIO } from './config';
import { log } from './logger';
import { formatCompact } from './format';

if (!TELEGRAM_BOT_TOKEN) {
  log.error('Missing TELEGRAM_BOT_TOKEN in environment.');
  process.exit(1);
}

const ALL_ADAPTERS: { adapter: ExchangeAdapter; envFlag: string }[] = [
  { adapter: mexc, envFlag: 'ENABLE_MEXC' },
  { adapter: bybit, envFlag: 'ENABLE_BYBIT' },
  { adapter: kucoin, envFlag: 'ENABLE_KUCOIN' },
  { adapter: gateio, envFlag: 'ENABLE_GATEIO' },
  { adapter: bitget, envFlag: 'ENABLE_BITGET' },
];

const adapters = ALL_ADAPTERS.filter(
  ({ envFlag }) => (process.env[envFlag] ?? 'true').toLowerCase() !== 'false'
).map(({ adapter }) => adapter);

type ExchangeState = {
  seenIds: Map<string, number>; // id -> trade ts, for bounded dedup
  lastAlertAt?: number;
};

const state = new Map<ExchangeName, ExchangeState>();
for (const adapter of adapters) {
  state.set(adapter.name, { seenIds: new Map() });
}

const SEEN_ID_TTL_MS = 60 * 60 * 1000; // bound memory: forget trade ids after 1h

function humanizeSince(lastAlertAt: number | undefined, now: number): string {
  if (lastAlertAt === undefined) return 'never';
  const diffMs = now - lastAlertAt;
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24) {
    const hours = Math.max(1, Math.round(diffHours));
    return `${hours}h ago`;
  }
  const days = Math.round(diffHours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function buildAlertMessage(params: {
  exchangeName: ExchangeName;
  quantity: number;
  notionalUsdt: number;
  lastPrice: number;
  priceChangePct: number;
  vol24hUsdt: number;
  lastAlertHuman: string;
}): string {
  const { exchangeName, quantity, notionalUsdt, lastPrice, priceChangePct, vol24hUsdt, lastAlertHuman } = params;
  return (
    `🐋 <b>Whale Sniper</b>\n` +
    `<b>${exchangeName}</b> — USDT Market\n` +
    `#ZIG — Large <b>buy</b> transaction\n` +
    `${formatCompact(quantity)} ZIG in a single trade\\n` +
    `P: ${lastPrice} (${priceChangePct.toFixed(2)}%)\n` +
    `24H Vol: ${formatCompact(vol24hUsdt)} USDT\n` +
    `Last alert: ${lastAlertHuman}`
  );
}

type ExchangeSummary = {
  exchangeName: ExchangeName;
  biggestBuy: number;
  vol24hUsdt: number;
};

async function pollExchange(adapter: ExchangeAdapter): Promise<ExchangeSummary> {
  const es = state.get(adapter.name)!;
  const now = Date.now();

  const [ticker, trades] = await Promise.all([adapter.fetchTicker(), adapter.fetchTrades()]);

  const evictBefore = now - SEEN_ID_TTL_MS;
  for (const [id, ts] of es.seenIds) {
    if (ts < evictBefore) es.seenIds.delete(id);
  }

  let biggestBuy = 0;
  const notableFloor = BUY_TX_ALERT_THRESHOLD_ZIG * NOTABLE_TRADE_RATIO;

  for (const trade of trades) {
    if (trade.side !== 'BUY') continue;
    if (es.seenIds.has(trade.id)) continue;
    es.seenIds.set(trade.id, trade.ts);
    biggestBuy = Math.max(biggestBuy, trade.notionalUsdt);

    if (trade.quantity >= notableFloor) {
      const pctOfThreshold = Math.round((trade.quantity / BUY_TX_ALERT_THRESHOLD_ZIG) * 100);
      log.info(`[${adapter.name}] buy trade ${formatCompact(trade.quantity)} ZIG (${pctOfThreshold}% of threshold)`);
    }

    if (trade.quantity >= BUY_TX_ALERT_THRESHOLD_ZIG) {
      const lastAlertHuman = humanizeSince(es.lastAlertAt, now);

      const message = buildAlertMessage({
        exchangeName: adapter.name,
        quantity: trade.quantity,
        notionalUsdt: trade.notionalUsdt,
        lastPrice: ticker.lastPrice,
        priceChangePct: ticker.priceChangePct,
        vol24hUsdt: ticker.vol24hUsdt,
        lastAlertHuman,
      });

      await broadcastAlert(adapter.name, message);
      es.lastAlertAt = now;
    }
  }

  return { exchangeName: adapter.name, biggestBuy, vol24hUsdt: ticker.vol24hUsdt };
}

const HEARTBEAT_EVERY_CYCLES = Math.max(1, Math.round(60 / POLL_INTERVAL_SEC));
let cycleCount = 0;

async function pollAll(): Promise<void> {
  cycleCount += 1;
  const summaries: ExchangeSummary[] = [];

  for (const adapter of adapters) {
    try {
      summaries.push(await pollExchange(adapter));
    } catch (err) {
      log.error(`[${adapter.name}] poll failed:`, (err as Error).message);
    }
  }

  if (cycleCount % HEARTBEAT_EVERY_CYCLES === 0) {
    for (const s of summaries) {
      log.info(
        `[${s.exchangeName}] monitoring — largest buy this cycle=${formatCompact(s.biggestBuy)} ` +
          `threshold=${formatCompact(BUY_TX_ALERT_THRESHOLD_ZIG)} 24hVol=${formatCompact(s.vol24hUsdt)} USDT`
      );
    }
  }
}

log.info(`ZIG Whale-Alert bot starting. Monitoring: ${adapters.map((a) => a.name).join(', ')}`);
log.info(`Poll interval ${POLL_INTERVAL_SEC}s, buy transaction threshold ${BUY_TX_ALERT_THRESHOLD_ZIG} ZIG`);
log.info(`Loaded ${getSubscriberCount()} subscriber(s) from data/subscribers.json`);
startTelegramCommandLoop();
pollAll();
setInterval(pollAll, POLL_INTERVAL_SEC * 1000);

