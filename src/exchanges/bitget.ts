import axios from 'axios';
import { ExchangeAdapter, Ticker, Trade } from '../types';

const BASE = 'https://api.bitget.com';
const SYMBOL = 'ZIGUSDT';

export const bitget: ExchangeAdapter = {
  name: 'Bitget',

  async fetchTicker(): Promise<Ticker> {
    const { data } = await axios.get(`${BASE}/api/v2/spot/market/tickers`, {
      params: { symbol: SYMBOL },
    });
    const d = data.data[0];
    return {
      lastPrice: Number(d.lastPr),
      priceChangePct: Number(d.change24h) * 100,
      vol24hUsdt: Number(d.usdtVolume),
    };
  },

  async fetchTrades(): Promise<Trade[]> {
    const { data } = await axios.get(`${BASE}/api/v2/spot/market/fills`, {
      params: { symbol: SYMBOL, limit: 500 },
    });
    return (data.data as any[]).map((t) => ({
      id: t.tradeId,
      quantity: Number(t.size),
      notionalUsdt: Number(t.price) * Number(t.size),
      side: t.side === 'buy' ? 'BUY' : 'SELL',
      ts: Number(t.ts),
    }));
  },
};
