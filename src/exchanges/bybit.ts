import axios from 'axios';
import { ExchangeAdapter, Ticker, Trade } from '../types';

const BASE = 'https://api.bybit.com';
const SYMBOL = 'ZIGUSDT';

export const bybit: ExchangeAdapter = {
  name: 'Bybit',

  async fetchTicker(): Promise<Ticker> {
    const { data } = await axios.get(`${BASE}/v5/market/tickers`, {
      params: { category: 'spot', symbol: SYMBOL },
    });
    const t = data.result.list[0];
    return {
      lastPrice: Number(t.lastPrice),
      priceChangePct: Number(t.price24hPcnt) * 100,
      vol24hUsdt: Number(t.turnover24h),
    };
  },

  async fetchTrades(): Promise<Trade[]> {
    const { data } = await axios.get(`${BASE}/v5/market/recent-trade`, {
      params: { category: 'spot', symbol: SYMBOL, limit: 1000 },
    });
    return (data.result.list as any[]).map((t) => ({
      id: t.execId,
      notionalUsdt: Number(t.price) * Number(t.size),
      side: t.side === 'Buy' ? 'BUY' : 'SELL',
      ts: Number(t.time),
    }));
  },
};
