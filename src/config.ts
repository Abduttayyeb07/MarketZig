import 'dotenv/config';
import { ExchangeName } from './types';

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
export const POLL_INTERVAL_SEC = Number(process.env.POLL_INTERVAL_SEC ?? '5');
export const WINDOW_MIN = Number(process.env.WINDOW_MIN ?? '5');
export const SHARE_PCT = Number(process.env.SHARE_PCT ?? '6');
export const ABS_FLOOR_USDT = Number(process.env.ABS_FLOOR_USDT ?? '1500');
export const COOLDOWN_MIN = Number(process.env.COOLDOWN_MIN ?? '45');
export const ESCALATION_MULT = Number(process.env.ESCALATION_MULT ?? '1.5');

export const ALL_EXCHANGES: ExchangeName[] = ['MEXC', 'Bybit', 'KuCoin', 'Gate.io', 'Bitget'];
