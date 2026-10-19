import { Router } from 'express';
import { syncSymbolHistorical, getRSI } from './indicators.service';
import { fetchPrices } from '../prices/prices.service';

const router = Router();

// SSE endpoint to incrementally sync historical data and stream progress
// GET /api/indicators/stream-sync?symbols=RELIANCE.NS,TCS.NS
router.get('/stream-sync', async (req: any, res: any) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const symbolsParam = req.query.symbols;
  if (!symbolsParam) {
    res.write(`data: ${JSON.stringify({ type: 'complete', progress: 100, results: {} })}\n\n`);
    return res.end();
  }

  const symbols: string[] = symbolsParam.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (symbols.length === 0) {
    res.write(`data: ${JSON.stringify({ type: 'complete', progress: 100, results: {} })}\n\n`);
    return res.end();
  }

  const total = symbols.length;
  const rsiPeriod = Math.max(2, Math.min(100, parseInt(req.query.rsiPeriod as string, 10) || 14));
  const results: Record<string, { rsi: number | null }> = {};

  res.write(`data: ${JSON.stringify({ type: 'start', total, message: `Starting sync for ${total} assets (RSI ${rsiPeriod})...` })}\n\n`);

  for (let i = 0; i < total; i++) {
    const symbol = symbols[i];
    try {
      const syncRes = await syncSymbolHistorical(symbol, rsiPeriod);
      results[symbol] = { rsi: syncRes.rsi };

      const percent = Math.round(((i + 1) / total) * 100);
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        symbol,
        current: i + 1,
        total,
        percent,
        cached: syncRes.cached,
        rsi: syncRes.rsi,
        message: `Processed ${symbol} (${syncRes.cached ? 'from local cache' : 'fetched & cached'}${syncRes.rsi !== null ? `, RSI(${rsiPeriod}): ${syncRes.rsi}` : ''})`
      })}\n\n`);
    } catch (err: any) {
      console.error(`Error syncing indicators for ${symbol}:`, err.message);
      results[symbol] = { rsi: null };
      const percent = Math.round(((i + 1) / total) * 100);
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        symbol,
        current: i + 1,
        total,
        percent,
        error: err.message,
        message: `Failed to sync ${symbol}`
      })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ type: 'complete', progress: 100, results })}\n\n`);
  res.end();
});

// GET /api/indicators/values?symbols=RELIANCE.NS,TCS.NS&rsiPeriod=14
router.get('/values', (req: any, res: any) => {
  const symbolsParam = req.query.symbols;
  if (!symbolsParam) {
    return res.json({});
  }

  const rsiPeriod = Math.max(2, Math.min(100, parseInt(req.query.rsiPeriod as string, 10) || 14));
  const symbols: string[] = symbolsParam.split(',').map((s: string) => s.trim()).filter(Boolean);
  const results: Record<string, { rsi: number | null }> = {};

  symbols.forEach(sym => {
    results[sym] = { rsi: getRSI(sym, rsiPeriod) };
  });

  res.json(results);
});

export default router;
