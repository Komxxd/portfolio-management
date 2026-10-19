import cron from 'node-cron';
import { syncCorporateActions } from '../modules/corporate-actions/sync.service';
import { syncAllActiveStockIndicators } from '../modules/indicators/indicators.service';

/**
 * Initialize all scheduled background tasks for the server.
 */
export function initCronJobs() {
  // Run every day at 8:00 AM IST (Asia/Kolkata timezone)
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Starting daily scheduled tasks at 8:00 AM IST...');
    
    // Task 1: Corporate Actions Sync
    try {
      console.log('[Cron] Starting corporate actions sync...');
      const { totalAdded } = await syncCorporateActions();
      console.log(`[Cron] Corporate actions sync completed. Added ${totalAdded} new corporate actions.`);
    } catch (error) {
      console.error('[Cron] Failed to sync corporate actions:', error);
    }

    // Task 2: Strategy C - Daily Incremental Technical Indicators (RSI & Historical Candles) Sync
    try {
      console.log('[Cron] Starting daily technical indicators sync for active stocks...');
      const { totalSynced } = await syncAllActiveStockIndicators();
      console.log(`[Cron] Technical indicators sync completed. Synced ${totalSynced} symbols.`);
    } catch (error) {
      console.error('[Cron] Failed to sync technical indicators:', error);
    }
  }, {
    timezone: "Asia/Kolkata"
  });

  console.log('[Cron] Initialized cron jobs (Daily sync at 8:00 AM IST)');
}
