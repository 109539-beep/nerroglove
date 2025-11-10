import { GoogleGenAI } from '@google/genai';
import { UI_STRINGS, UIStrings } from './translations';

export { UI_STRINGS };
export type { UIStrings };

// --- Configuration ---
export interface DoctorInfo {
  name: string;
  phone: string;
  types: string;
  lat: number;
  lon: number;
  distKm: number;
}
export interface LogEntry {
  timestamp: Date;
  text: string;
  direction: 'in' | 'out';
}
export enum ConnectionType {
  Disconnected,
  Bluetooth,
  Serial,
}

// --- AI Service Logic ---
export async function analyzeLogsWithGemini(logs: LogEntry[]): Promise<string> {
  if (!process.env.API_KEY) throw new Error('API_KEY not set for AI features.');
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const formattedLogs = logs
    .map(
      (log) =>
        `${log.timestamp.toLocaleTimeString()} ${
          log.direction === 'in' ? '<--' : '-->'
        } ${log.text}`,
    )
    .join('\n');
  const prompt = `You are an expert assistant for a 'Neuro Glove' device.
Analyze the following session log. Provide a concise summary, identify patterns or issues, and offer suggestions. Format your response clearly using markdown.
Session Log:\n---\n${formattedLogs}\n---\nYour Analysis:`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 32768 } },
    });
    return response.text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return `Error during analysis: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`;
  }
}

// --- Translation Service ---
const translationCache = new Map<string, string>();
let translationAi: GoogleGenAI | null = null;
function getTranslationAi() {
  if (!translationAi) {
    if (!process.env.API_KEY) {
      console.warn('API_KEY not set, translation will not work.');
      return null;
    }
    translationAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return translationAi;
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (targetLang === 'en') return text;
  const cacheKey = `en:${targetLang}:${text}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)!;
  const genAI = getTranslationAi();
  if (!genAI) throw new Error('Gemini AI not initialized.');
  const langName =
    new Intl.DisplayNames([targetLang], { type: 'language' }).of(targetLang) ||
    targetLang;
  const prompt = `Translate this English text to ${langName} and return only the translation: "${text}"`;
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const translation = response.text.trim();
    translationCache.set(cacheKey, translation);
    return translation;
  } catch (error) {
    console.error('Translation error:', error);
    throw new Error('Failed to translate text.');
  }
}

export function getUIStrings(langCode: string): UIStrings {
  return UI_STRINGS[langCode] || UI_STRINGS.en;
}

// ======================================================
// ---------------------- LOG SERVICE -------------------
// ======================================================

// Key format: "ng_logs_YYYY-MM-DD"
function getLogKey(date: Date): string {
  return `ng_logs_${date.toISOString().slice(0, 10)}`;
}

// Save a log entry for the current day
export function saveLog(log: LogEntry): void {
  try {
    const key = getLogKey(log.timestamp);
    const existing: LogEntry[] = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push(log);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (error) {
    console.error('Failed to save log:', error);
  }
}

// Load logs for a specific date
export async function loadLogsForDate(date: Date): Promise<LogEntry[]> {
  try {
    const key = getLogKey(date);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((l: any) => ({
      timestamp: new Date(l.timestamp),
      text: l.text,
      direction: l.direction,
    })) as LogEntry[];
  } catch (error) {
    console.error('Failed to load logs:', error);
    return [];
  }
}

// Load today's logs
export async function loadLogsForToday(): Promise<LogEntry[]> {
  return loadLogsForDate(new Date());
}

// ======================================================
// ---------------- DEVICE CONNECTION SERVICE -----------
// ======================================================

declare global {
  interface Navigator {
    serial: any;
    bluetooth: any;
  }
}

interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

let logFn: (t: string, d: 'in' | 'out') => void = () => {};
let connChange: (conn: ConnectionType, d: Record<string, any> | null) => void = () => {};
let port: SerialPort | null = null;
let reader: ReadableStreamDefaultReader<string> | null = null;
let keepReading = false;

// Init callbacks
export function init(
  onLog: (t: string, d: 'in' | 'out') => void,
  onConn: (c: ConnectionType, d: Record<string, any> | null) => void,
) {
  logFn = onLog;
  connChange = onConn;
}

// --- SERIAL CONNECTION ---
export async function connectSerial() {
  if (!('serial' in navigator)) throw new Error('Web Serial not supported.');
  try {
    const selectedPort = await navigator.serial.requestPort();
    await selectedPort.open({ baudRate: 9600 });
    port = selectedPort;

    logFn('Serial port opened', 'in');
    connChange(ConnectionType.Serial, { baudRate: 9600, ...port.getInfo() });

    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    reader = decoder.readable.getReader();
    keepReading = true;

    let buffer = '';
    while (keepReading) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        buffer += value;
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() || '';
        for (const line of parts) {
          const clean = line.trim();
          if (clean) logFn(clean, 'in');
        }
      }
    }
  } catch (error) {
    logFn(`Serial connection error: ${error}`, 'in');
    disconnect();
    throw error;
  }
}

// --- SERIAL WRITE ---
export async function sendMessage(text: string) {
  const msg = text + '\n';
  if (port?.writable) {
    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(msg));
      logFn(`Sent: ${text}`, 'out');
    } catch (e) {
      logFn(`Serial write error: ${e}`, 'in');
    } finally {
      writer.releaseLock();
    }
  } else {
    logFn('No serial device connected', 'out');
  }
}

// --- DISCONNECT ---
export function disconnect() {
  keepReading = false;
  if (reader) reader.cancel().catch(() => {});
  if (port) port.close().catch(() => {});
  port = null;
  reader = null;
  connChange(ConnectionType.Disconnected, null);
  logFn('Disconnected', 'in');
}
