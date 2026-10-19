import fs from 'fs';
import path from 'path';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

const HISTORICAL_DIR = path.resolve(__dirname, '../../../../data/historical');

// In-memory cache for fast lookups during normal queries (6-hour TTL)
const rsiCache = new Map<string, { rsi: number; timestamp: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface StoredCandle {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

interface HistoricalDataFile {
  symbol: string;
  lastFetchedAt: string;
  candles: StoredCandle[];
}

function ensureDirectoryExists() {
  if (!fs.existsSync(HISTORICAL_DIR)) {
    fs.mkdirSync(HISTORICAL_DIR, { recursive: true });
  }
}

function getFilePath(symbol: string): string {
  const safeName = symbol.replace(/[^a-zA-Z0-9.-]/g, '_');
  return path.join(HISTORICAL_DIR, `${safeName}.json`);
}

/**
 * Standard Wilder's 14-period Relative Strength Index (RSI) calculation
 */
export function calculateRSI(closes: number[], period = 14): number | null {
  if (!closes || closes.length < period + 1) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  // First period average gain & loss
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Wilder's exponential smoothing across remaining bars
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return Math.round(rsi * 10) / 10;
}

/**
 * Get RSI from in-memory cache or calculate from existing local file without hitting network
 */
export function getRSI(symbol: string, period = 14): number | null {
  const cacheKey = `${symbol}_${period}`;
  const cached = rsiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.rsi;
  }

  try {
    const filePath = getFilePath(symbol);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data: HistoricalDataFile = JSON.parse(content);
      if (data.candles && data.candles.length >= period + 1) {
        const closes = data.candles.map(c => c.close).filter(c => typeof c === 'number' && !isNaN(c));
        const val = calculateRSI(closes, period);
        if (val !== null) {
          rsiCache.set(cacheKey, { rsi: val, timestamp: Date.now() });
          return val;
        }
      }
    }
  } catch (err) {
    console.error(`Error reading cached RSI for ${symbol}:`, err);
  }

  return null;
}

/**
 * Incrementally sync historical candles for a symbol:
 * 1. Check if local file exists
 * 2. If recent data exists (< 24h), use it directly
 * 3. If stale or missing, fetch delta from Yahoo Finance, merge, save, and calculate RSI
 */
export async function syncSymbolHistorical(symbol: string, period = 14): Promise<{ rsi: number | null; cached: boolean; count: number }> {
  ensureDirectoryExists();
  const filePath = getFilePath(symbol);
  const now = new Date();
  let existingData: HistoricalDataFile | null = null;

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      existingData = JSON.parse(raw);
    } catch {
      existingData = null;
    }
  }

  const existingCandles = existingData?.candles || [];
  let isUpToDate = false;

  if (existingCandles.length >= period + 5 && existingData?.lastFetchedAt) {
    const lastFetch = new Date(existingData.lastFetchedAt).getTime();
    const hoursSinceLastFetch = (now.getTime() - lastFetch) / (1000 * 60 * 60);

    // If fetched within the last 18 hours, consider up-to-date
    if (hoursSinceLastFetch < 18) {
      isUpToDate = true;
    }
  }

  const cacheKey = `${symbol}_${period}`;

  if (isUpToDate && existingCandles.length >= period + 1) {
    const closes = existingCandles.map(c => c.close).filter(c => typeof c === 'number' && !isNaN(c));
    const rsi = calculateRSI(closes, period);
    if (rsi !== null) {
      rsiCache.set(cacheKey, { rsi, timestamp: Date.now() });
    }
    return { rsi, cached: true, count: existingCandles.length };
  }

  // Determine period1 for Yahoo Finance
  let period1: Date;
  if (existingCandles.length > 0) {
    // Delta fetch: from last known candle date minus 3 days for safety overlap
    const lastCandle = existingCandles[existingCandles.length - 1];
    period1 = new Date(lastCandle.date);
    period1.setDate(period1.getDate() - 3);
  } else {
    // Initial fetch: 90 days back to get ~60 trading days
    period1 = new Date();
    period1.setDate(period1.getDate() - 90);
  }

  try {
    const rawQuotes = await yahooFinance.historical(symbol, {
      period1: period1.toISOString().split('T')[0],
      period2: now.toISOString().split('T')[0],
      interval: '1d'
    });

    const newCandles: StoredCandle[] = (rawQuotes || []).map(q => ({
      date: new Date(q.date).toISOString().split('T')[0],
      close: q.close,
      open: q.open,
      high: q.high,
      low: q.low,
      volume: q.volume
    })).filter(c => typeof c.close === 'number' && !isNaN(c.close));

    // Merge existing candles with new candles, deduplicating by date
    const candleMap = new Map<string, StoredCandle>();
    existingCandles.forEach(c => candleMap.set(c.date, c));
    newCandles.forEach(c => candleMap.set(c.date, c));

    // Sort chronologically ascending
    const mergedCandles = Array.from(candleMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Save to disk
    const filePayload: HistoricalDataFile = {
      symbol,
      lastFetchedAt: now.toISOString(),
      candles: mergedCandles
    };
    fs.writeFileSync(filePath, JSON.stringify(filePayload, null, 2), 'utf8');

    // Calculate RSI
    const closes = mergedCandles.map(c => c.close);
    const rsi = calculateRSI(closes, period);
    if (rsi !== null) {
      rsiCache.set(cacheKey, { rsi, timestamp: Date.now() });
    }

    return { rsi, cached: false, count: mergedCandles.length };
  } catch (error: any) {
    console.error(`Error fetching historical candles for ${symbol}:`, error.message);
    // If network error, fallback to existing local data if available
    if (existingCandles.length >= period + 1) {
      const closes = existingCandles.map(c => c.close);
      const rsi = calculateRSI(closes, period);
      if (rsi !== null) {
        rsiCache.set(cacheKey, { rsi, timestamp: Date.now() });
      }
      return { rsi, cached: true, count: existingCandles.length };
    }
    return { rsi: null, cached: false, count: 0 };
  }
}
