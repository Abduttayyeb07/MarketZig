import fs from 'fs';
import path from 'path';
import { ExchangeName } from './types';
import { ALL_EXCHANGES } from './config';

const FILE_PATH = path.join(__dirname, '..', 'data', 'subscribers.json');

type SubscribersFile = {
  subscribers: Record<string, ExchangeName[]>;
};

function ensureFile(): void {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({ subscribers: {} } as SubscribersFile, null, 2));
  }
}

export function loadSubscribers(): Map<number, Set<ExchangeName>> {
  ensureFile();
  const raw = fs.readFileSync(FILE_PATH, 'utf-8');
  const data: SubscribersFile = JSON.parse(raw);
  const map = new Map<number, Set<ExchangeName>>();
  for (const [chatId, exchanges] of Object.entries(data.subscribers)) {
    map.set(Number(chatId), new Set(exchanges.length > 0 ? exchanges : ALL_EXCHANGES));
  }
  return map;
}

export function saveSubscribers(subscribers: Map<number, Set<ExchangeName>>): void {
  ensureFile();
  const data: SubscribersFile = { subscribers: {} };
  for (const [chatId, exchanges] of subscribers) {
    data.subscribers[String(chatId)] = Array.from(exchanges);
  }
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}
