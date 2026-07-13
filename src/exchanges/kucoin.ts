import axios from 'axios';
import { ExchangeAdapter, Ticker, Trade } from '../types';

const BASE = 'https://api.kucoin.com';
const SYMBOL = 'ZIG-USDT';

export const kucoin: ExchangeAdapter = {
  name: 'KuCoin',

  async fetchTicker(): Promise<Ticker> {
    const { data } = await axios.get(`${BASE}/api/v1/market/stats`, {
      params: { symbol: SYMBOL },
    });
    const d = data.data;
    return {
      lastPrice: Number(d.last),
      priceChangePct: Number(d.changeRate) * 100,
      vol24hUsdt: Number(d.volValue),
    };
  },

  async fetchTrades(): Promise<Trade[]> {
    const { data } = await axios.get(`${BASE}/api/v1/market/histories`, {
      params: { symbol: SYMBOL },
    });
    return (data.data as any[]).map((t) => ({
      id: t.tradeId,
      notionalUsdt: Number(t.price) * Number(t.size),
      side: t.side === 'buy' ? 'BUY' : 'SELL',
      ts: Number(t.time) / 1e6,
    }));
  },
};
