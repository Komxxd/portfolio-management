import YahooFinance from 'yahoo-finance2';
import { EventEmitter } from 'events';
import type { LivePrice } from '../../shared/types';
import { getRSI, syncSymbolHistorical } from '../indicators/indicators.service';

const yahooFinance = new YahooFinance();

// In-memory price cache with 30-second TTL
const priceCache: Map<string, { data: LivePrice; timestamp: number }> = new Map();
const CACHE_TTL_MS = 30_000;

export const priceEvents = new EventEmitter();

// Track which symbols are actively being watched by clients
const activeSymbols = new Map<string, number>();

// In-flight background indicator sync tracker to avoid duplicate calls
const pendingIndicatorSyncs = new Set<string>();

/**
 * Strategy B: Passive streamer self-healing fallback.
 * Checks if a symbol lacks local RSI data; if so, triggers a background fetch
 * and broadcasts the updated RSI to all active SSE subscribers as soon as ready.
 */
export function triggerIndicatorSyncIfNeeded(symbol: string) {
  if (!symbol || pendingIndicatorSyncs.has(symbol)) return;

  // If RSI already exists in memory or local disk cache, no network fetch needed
  if (getRSI(symbol) !== null) return;

  pendingIndicatorSyncs.add(symbol);

  syncSymbolHistorical(symbol)
    .then(({ rsi }) => {
      if (rsi !== null) {
        const cached = priceCache.get(symbol);
        if (cached) {
          cached.data.rsi = rsi;
          priceEvents.emit('prices_updated', { [symbol]: cached.data });
        }
      }
    })
    .catch((err) => {
      console.error(`[Strategy B] Background indicator sync failed for ${symbol}:`, err.message);
    })
    .finally(() => {
      pendingIndicatorSyncs.delete(symbol);
    });
}

// Register interest in a symbol (increases reference count)
export function watchSymbols(symbols: string[]) {
  symbols.forEach(sym => {
    activeSymbols.set(sym, (activeSymbols.get(sym) || 0) + 1);
    // Strategy B: Proactively trigger background indicator sync for watched symbols missing RSI
    triggerIndicatorSyncIfNeeded(sym);
  });
}

// Unregister interest in a symbol
export function unwatchSymbols(symbols: string[]) {
  symbols.forEach(sym => {
    const count = activeSymbols.get(sym) || 0;
    if (count <= 1) {
      activeSymbols.delete(sym);
    } else {
      activeSymbols.set(sym, count - 1);
    }
  });
}

/**
 * Fetch live prices for an array of symbols.
 * Uses an in-memory cache to avoid hammering Yahoo for every user.
 */
export async function fetchPrices(symbols: string[]): Promise<Record<string, LivePrice>> {
  const now = Date.now();
  const result: Record<string, LivePrice> = {};
  const uncached: string[] = [];

  // Check cache first
  for (const symbol of symbols) {
    const cached = priceCache.get(symbol);
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      // If cached price exists but RSI was missing when cached, check if available or trigger background sync
      if (cached.data.rsi === undefined) {
        const rsiVal = getRSI(symbol);
        if (rsiVal !== null) {
          cached.data.rsi = rsiVal;
        } else {
          triggerIndicatorSyncIfNeeded(symbol);
        }
      }
      result[symbol] = cached.data;
    } else {
      uncached.push(symbol);
    }
  }

  // Fetch uncached symbols from Yahoo
  if (uncached.length > 0) {
    try {
      const quotes = await yahooFinance.quote(uncached);
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

      for (const q of quotesArray) {
        if (q && q.symbol && q.regularMarketPrice) {
          const rsiVal = getRSI(q.symbol);
          if (rsiVal === null) {
            triggerIndicatorSyncIfNeeded(q.symbol);
          }

          const priceData: LivePrice = {
            price: q.regularMarketPrice,
            name: q.shortName || q.longName || (q as any).shortname || (q as any).longname || q.symbol,
            currency: (q as any).currency || undefined,
            change: q.regularMarketChange,
            changePercent: q.regularMarketChangePercent,
            dayHigh: q.regularMarketDayHigh,
            dayLow: q.regularMarketDayLow,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow,
            marketCap: q.marketCap,
            volume: q.regularMarketVolume,
            avgVolume: q.averageDailyVolume3Month,
            previousClose: q.regularMarketPreviousClose,
            dma50: q.fiftyDayAverage,
            dma200: q.twoHundredDayAverage,
            rsi: rsiVal ?? undefined,
          };

          result[q.symbol] = priceData;
          priceCache.set(q.symbol, { data: priceData, timestamp: now });
        }
      }
    } catch (err) {
      console.error('Yahoo Finance quote error:', err);
    }
  }

  return result;
}

// Global polling loop for active SSE connections
setInterval(async () => {
  const symbolsToFetch = Array.from(activeSymbols.keys());
  if (symbolsToFetch.length > 0) {
    const prices = await fetchPrices(symbolsToFetch);
    priceEvents.emit('prices_updated', prices);
  }
}, 30_000); // Poll every 30s

export async function searchStocks(query: string) {
  const results = await yahooFinance.search(query);
  return results.quotes.map((q: any) => ({
    symbol: q.symbol,
    name: q.shortname || q.longname || q.symbol,
    exchange: q.exchange,
    assetType: q.quoteType
  }));
}
