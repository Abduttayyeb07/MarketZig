import axios from 'axios';
import { loadSubscribers, saveSubscribers } from './subscribers';
import { ExchangeName } from './types';
import { TELEGRAM_BOT_TOKEN, ALL_EXCHANGES, BUY_TX_ALERT_THRESHOLD_USDT } from './config';
import { log } from './logger';
import { formatCompact } from './format';

const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const subscribers = loadSubscribers();
let updateOffset = 0;
let running = false;

type InlineKeyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

function describeThresholds(): string {
  return (
    `You'll get an alert the instant any single ZIG buy transaction on an exchange is worth at least ` +
    `${formatCompact(BUY_TX_ALERT_THRESHOLD_USDT)} USDT. Every qualifying transaction gets its own alert.`
  );
}

function welcomeText(): string {
  return (
    `🐋 <b>ZIG Whale Sniper</b>\n\n` +
    `I watch ZIG/USDT on ${ALL_EXCHANGES.join(', ')} for large individual buy transactions.\n\n` +
    `${describeThresholds()}\n\n` +
    `Tap Subscribe to start. You can pick which exchanges to follow afterwards.`
  );
}

function menuText(chatId: number): string {
  const enabled = subscribers.get(chatId);
  if (!enabled) return welcomeText();
  const list = ALL_EXCHANGES.filter((e) => enabled.has(e)).join(', ') || 'none';
  return (
    `🐋 <b>ZIG Whale Sniper — Settings</b>\n\n` +
    `Status: <b>Subscribed ✅</b>\n` +
    `Following: ${list}\n\n` +
    `Tap an exchange to toggle it on/off.\n\n` +
    `${describeThresholds()}`
  );
}

function buildKeyboard(chatId: number): InlineKeyboard {
  const enabled = subscribers.get(chatId);

  if (!enabled) {
    return { inline_keyboard: [[{ text: '🔔 Subscribe', callback_data: 'subscribe' }]] };
  }

  const exchangeButtons = ALL_EXCHANGES.map((ex) => ({
    text: `${enabled.has(ex) ? '✅' : '⬜'} ${ex}`,
    callback_data: `toggle:${ex}`,
  }));

  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < exchangeButtons.length; i += 2) {
    rows.push(exchangeButtons.slice(i, i + 2));
  }
  rows.push([{ text: '🔕 Unsubscribe', callback_data: 'unsubscribe' }]);
  return { inline_keyboard: rows };
}

function describeUser(from: any): string {
  if (!from) return 'unknown';
  return from.username ? `@${from.username}` : from.first_name ?? String(from.id);
}

export async function sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
  try {
    await axios.post(`${API}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (err) {
    log.error(`[telegram] failed to send message to ${chatId}:`, (err as Error).message);
  }
}

async function editMenu(chatId: number, messageId: number): Promise<void> {
  try {
    await axios.post(`${API}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text: menuText(chatId),
      parse_mode: 'HTML',
      reply_markup: buildKeyboard(chatId),
    });
  } catch (err) {
    log.error(`[telegram] failed to edit menu for ${chatId}:`, (err as Error).message);
  }
}

async function answerCallback(callbackQueryId: string, text?: string, showAlert = false): Promise<void> {
  try {
    await axios.post(`${API}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  } catch (err) {
    log.error('[telegram] failed to answer callback query:', (err as Error).message);
  }
}

export async function broadcastAlert(exchangeName: ExchangeName, text: string): Promise<void> {
  const recipients = Array.from(subscribers.entries()).filter(([, exchanges]) => exchanges.has(exchangeName));
  for (const [chatId] of recipients) {
    await sendMessage(chatId, text);
  }
  log.info(`[${exchangeName}] alert sent to ${recipients.length} subscriber(s)`);
}

export function getSubscriberCount(): number {
  return subscribers.size;
}

async function handleMessage(msg: any): Promise<void> {
  if (typeof msg.text !== 'string') return;
  const chatId: number = msg.chat.id;
  const command = msg.text.trim().split(/\s+/)[0].toLowerCase();
  const who = describeUser(msg.from);

  if (command === '/start' || command === '/menu' || command === '/settings') {
    await sendMessage(chatId, menuText(chatId), buildKeyboard(chatId));
  } else if (command === '/subscribe') {
    if (!subscribers.has(chatId)) {
      subscribers.set(chatId, new Set(ALL_EXCHANGES));
      saveSubscribers(subscribers);
      log.info(`Chat ${chatId} (${who}) subscribed to all exchanges`);
    }
    await sendMessage(chatId, menuText(chatId), buildKeyboard(chatId));
  } else if (command === '/unsubscribe') {
    if (subscribers.has(chatId)) {
      subscribers.delete(chatId);
      saveSubscribers(subscribers);
      log.info(`Chat ${chatId} (${who}) unsubscribed`);
    }
    await sendMessage(chatId, welcomeText(), buildKeyboard(chatId));
  }
}

async function handleCallbackQuery(cq: any): Promise<void> {
  const chatId: number = cq.message.chat.id;
  const messageId: number = cq.message.message_id;
  const data: string = cq.data ?? '';
  const who = describeUser(cq.from);

  if (data === 'subscribe') {
    if (!subscribers.has(chatId)) {
      subscribers.set(chatId, new Set(ALL_EXCHANGES));
      saveSubscribers(subscribers);
      log.info(`Chat ${chatId} (${who}) subscribed to all exchanges`);
    }
    await answerCallback(cq.id, 'Subscribed');
    await editMenu(chatId, messageId);
  } else if (data === 'unsubscribe') {
    if (subscribers.has(chatId)) {
      subscribers.delete(chatId);
      saveSubscribers(subscribers);
      log.info(`Chat ${chatId} (${who}) unsubscribed`);
    }
    await answerCallback(cq.id, 'Unsubscribed');
    await editMenu(chatId, messageId);
  } else if (data.startsWith('toggle:')) {
    const exchange = data.slice('toggle:'.length) as ExchangeName;
    const enabled = subscribers.get(chatId);
    if (!enabled) {
      await answerCallback(cq.id, 'Subscribe first', true);
      return;
    }
    if (enabled.has(exchange)) {
      if (enabled.size === 1) {
        await answerCallback(cq.id, 'At least one exchange must stay enabled', true);
        return;
      }
      enabled.delete(exchange);
      log.info(`Chat ${chatId} (${who}) disabled ${exchange}`);
    } else {
      enabled.add(exchange);
      log.info(`Chat ${chatId} (${who}) enabled ${exchange}`);
    }
    saveSubscribers(subscribers);
    await answerCallback(cq.id);
    await editMenu(chatId, messageId);
  } else {
    await answerCallback(cq.id);
  }
}

async function handleUpdate(update: any): Promise<void> {
  if (update.message) {
    await handleMessage(update.message);
  } else if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollOnce(): Promise<boolean> {
  try {
    const { data } = await axios.get(`${API}/getUpdates`, {
      params: { offset: updateOffset, timeout: 25, allowed_updates: ['message', 'callback_query'] },
      timeout: 30000,
    });
    for (const update of data.result as any[]) {
      updateOffset = update.update_id + 1;
      await handleUpdate(update);
    }
    return true;
  } catch (err) {
    log.error('[telegram] failed to poll updates:', (err as Error).message);
    return false;
  }
}

export function startTelegramCommandLoop(): void {
  if (running) return;
  running = true;
  (async function loop() {
    while (running) {
      const ok = await pollOnce();
      if (!ok) await sleep(3000);
    }
  })();
}
