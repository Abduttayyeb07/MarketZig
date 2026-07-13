import axios from 'axios';
import { ExchangeAdapter, Ticker, Trade } from '../types';

const BASE = 'https://api.mexc.com';
const SYMBOL = 'ZIGUSDT';

export const mexc: ExchangeAdapter = {
  name: 'MEXC',

  async fetchTicker(): Promise<Ticker> {
    const { data } = await axios.get(`${BASE}/api/v3/ticker/24hr`, {
      params: { symbol: SYMBOL },
    });
    return {
      lastPrice: Number(data.lastPrice),
      priceChangePct: Number(data.priceChangePercent) * 100,
      vol24hUsdt: Number(data.quoteVolume),
    };
  },

  async fetchTrades(): Promise<Trade[]> {
    const { data } = await axios.get(`${BASE}/api/v3/trades`, {
      params: { symbol: SYMBOL, limit: 1000 },
    });
    return (data as any[]).map((t) => ({
      id: `${t.time}-${t.price}-${t.qty}`,
      notionalUsdt: Number(t.quoteQty),
      side: t.isBuyerMaker ? 'SELL' : 'BUY',
      ts: Number(t.time),
    }));
  },
};
