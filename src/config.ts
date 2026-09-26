import 'dotenv/config';
import { ExchangeName } from './types';

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
export const POLL_INTERVAL_SEC = Number(process.env.POLL_INTERVAL_SEC ?? '5');
// export const BUY_TX_ALERT_THRESHOLD_USDT = Number(process.env.BUY_TX_ALERT_THRESHOLD_USDT ?? '1000000');
export const BUY_TX_ALERT_THRESHOLD_ZIG = Number(process.env.BUY_TX_ALERT_THRESHOLD_ZIG ?? '1000000');
export const NOTABLE_TRADE_RATIO = Number(process.env.NOTABLE_TRADE_RATIO ?? '0.1');

export const ALL_EXCHANGES: ExchangeName[] = ['MEXC', 'Bybit', 'KuCoin', 'Gate.io', 'Bitget'];
