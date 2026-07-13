import { ExchangeAdapter, ExchangeName, Side, Trade } from './types';
import { mexc } from './exchanges/mexc';
import { bybit } from './exchanges/bybit';
import { kucoin } from './exchanges/kucoin';
import { gateio } from './exchanges/gateio';
import { bitget } from './exchanges/bitget';
import { broadcastAlert, getSubscriberCount, startTelegramCommandLoop } from './telegramBot';
import {
  TELEGRAM_BOT_TOKEN,
  POLL_INTERVAL_SEC,
  WINDOW_MIN,
  SHARE_PCT,
  ABS_FLOOR_USDT,
  COOLDOWN_MIN,
  ESCALATION_MULT,
} from './config';
import { log } from './logger';

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
  seenIds: Set<string>;
  buffer: Trade[];
  lastAlertAt: Partial<Record<Side, number>>;
  lastAlertNotional: Partial<Record<Side, number>>;
};

const state = new Map<ExchangeName, ExchangeState>();
for (const adapter of adapters) {
  state.set(adapter.name, { seenIds: new Set(), buffer: [], lastAlertAt: {}, lastAlertNotional: {} });
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

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
  side: Side;
  windowNotional: number;
  sharePct: number;
  lastPrice: number;
  priceChangePct: number;
  vol24hUsdt: number;
  lastAlertHuman: string;
}): string {
  const { exchangeName, side, windowNotional, sharePct, lastPrice, priceChangePct, vol24hUsdt, lastAlertHuman } =
    params;
  const activity = side === 'BUY' ? 'buying' : 'selling';
  return (
    `🐋 <b>Whale Sniper</b>\n` +
    `<b>${exchangeName}</b> — USDT Market\n` +
    `#ZIG — Unusual <b>${activity}</b> activity\n` +
    `${formatCompact(windowNotional)} USDT in ${WINDOW_MIN} minutes (${sharePct}%)\n` +
    `P: ${lastPrice} (${priceChangePct.toFixed(2)}%)\n` +
    `24H Vol: ${formatCompact(vol24hUsdt)} USDT\n` +
    `Last alert: ${lastAlertHuman}`
  );
}

type ExchangeSummary = {
  exchangeName: ExchangeName;
  winBuy: number;
  winSell: number;
  threshold: number;
  vol24hUsdt: number;
};

async function pollExchange(adapter: ExchangeAdapter): Promise<ExchangeSummary> {
  const es = state.get(adapter.name)!;
  const now = Date.now();
  const windowMs = WINDOW_MIN * 60 * 1000;

  const [ticker, trades] = await Promise.all([adapter.fetchTicker(), adapter.fetchTrades()]);

  for (const trade of trades) {
    if (es.seenIds.has(trade.id)) continue;
    es.seenIds.add(trade.id);
    es.buffer.push(trade);
  }

  const cutoff = now - windowMs;
  const evicted = es.buffer.filter((t) => t.ts < cutoff);
  es.buffer = es.buffer.filter((t) => t.ts >= cutoff);
  for (const t of evicted) es.seenIds.delete(t.id);

  const winBuy = es.buffer.filter((t) => t.side === 'BUY').reduce((sum, t) => sum + t.notionalUsdt, 0);
  const winSell = es.buffer.filter((t) => t.side === 'SELL').reduce((sum, t) => sum + t.notionalUsdt, 0);

  const threshold = Math.max(ABS_FLOOR_USDT, (ticker.vol24hUsdt * SHARE_PCT) / 100);
  const cooldownMs = COOLDOWN_MIN * 60 * 1000;

  const sides: { side: Side; notional: number }[] = [
    { side: 'BUY', notional: winBuy },
    { side: 'SELL', notional: winSell },
  ];

  for (const { side, notional } of sides) {
    if (notional < threshold) continue;

    const lastAlertAt = es.lastAlertAt[side];
    const lastAlertNotional = es.lastAlertNotional[side];
    const onCooldown = lastAlertAt !== undefined && now - lastAlertAt < cooldownMs;

    if (onCooldown) {
      const escalated = lastAlertNotional !== undefined && notional >= lastAlertNotional * ESCALATION_MULT;
      if (!escalated) continue;
    }

    const sharePct = Math.round((notional / ticker.vol24hUsdt) * 100 * 10) / 10;
    const lastAlertHuman = humanizeSince(lastAlertAt, now);

    const message = buildAlertMessage({
      exchangeName: adapter.name,
      side,
      windowNotional: notional,
      sharePct,
      lastPrice: ticker.lastPrice,
      priceChangePct: ticker.priceChangePct,
      vol24hUsdt: ticker.vol24hUsdt,
      lastAlertHuman,
    });

    await broadcastAlert(adapter.name, message);
    es.lastAlertAt[side] = now;
    es.lastAlertNotional[side] = notional;
  }

  return { exchangeName: adapter.name, winBuy, winSell, threshold, vol24hUsdt: ticker.vol24hUsdt };
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
        `[${s.exchangeName}] monitoring — buy=${formatCompact(s.winBuy)} sell=${formatCompact(s.winSell)} ` +
          `threshold=${formatCompact(s.threshold)} 24hVol=${formatCompact(s.vol24hUsdt)} USDT`
      );
    }
  }
}

log.info(`ZIG Whale-Alert bot starting. Monitoring: ${adapters.map((a) => a.name).join(', ')}`);
log.info(
  `Poll interval ${POLL_INTERVAL_SEC}s, window ${WINDOW_MIN}min, share ${SHARE_PCT}%, floor ${ABS_FLOOR_USDT} USDT, cooldown ${COOLDOWN_MIN}min`
);
log.info(`Loaded ${getSubscriberCount()} subscriber(s) from data/subscribers.json`);
startTelegramCommandLoop();
pollAll();
setInterval(pollAll, POLL_INTERVAL_SEC * 1000);
