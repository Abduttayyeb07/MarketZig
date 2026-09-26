import axios from 'axios';
import { ExchangeAdapter, Ticker, Trade } from '../types';

const BASE = 'https://api.gateio.ws';
const SYMBOL = 'ZIG_USDT';

export const gateio: ExchangeAdapter = {
  name: 'Gate.io',

  async fetchTicker(): Promise<Ticker> {
    const { data } = await axios.get(`${BASE}/api/v4/spot/tickers`, {
      params: { currency_pair: SYMBOL },
    });
    const d = data[0];
    return {
      lastPrice: Number(d.last),
      priceChangePct: Number(d.change_percentage),
      vol24hUsdt: Number(d.quote_volume),
    };
  },

  async fetchTrades(): Promise<Trade[]> {
    const { data } = await axios.get(`${BASE}/api/v4/spot/trades`, {
      params: { currency_pair: SYMBOL, limit: 1000 },
    });
    return (data as any[]).map((t) => ({
      id: t.id,
      quantity: Number(t.amount),
      notionalUsdt: Number(t.price) * Number(t.amount),
      side: t.side === 'buy' ? 'BUY' : 'SELL',
      ts: Math.floor(Number(t.create_time_ms)),
    }));
  },
};
