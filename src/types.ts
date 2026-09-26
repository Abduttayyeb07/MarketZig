export type Side = 'BUY' | 'SELL';

export type Trade = {
  id: string;
  quantity: number; // ZIG amount
  notionalUsdt: number;
  side: Side;
  ts: number; // ms
};

export type Ticker = {
  lastPrice: number;
  priceChangePct: number; // percent, e.g. 3.2 means +3.2%
  vol24hUsdt: number;
};

export type ExchangeName = 'MEXC' | 'Bybit' | 'KuCoin' | 'Gate.io' | 'Bitget';

export interface ExchangeAdapter {
  name: ExchangeName;
  fetchTicker(): Promise<Ticker>;
  fetchTrades(): Promise<Trade[]>;
}
