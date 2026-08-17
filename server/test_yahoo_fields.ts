
import YahooFinance from 'yahoo-finance2';
async function test() {
  const quote = await YahooFinance.quote('RELIANCE.NS');
  console.log('--- QUOTE ---');
  console.log(Object.keys(quote));
  console.log('fiftyTwoWeekHigh:', quote.fiftyTwoWeekHigh);
  console.log('fiftyTwoWeekLow:', quote.fiftyTwoWeekLow);
  console.log('regularMarketVolume:', quote.regularMarketVolume);
  console.log('regularMarketDayHigh:', quote.regularMarketDayHigh);
  console.log('regularMarketDayLow:', quote.regularMarketDayLow);
  
  // To get All Time High/Low, we might need chart data max/min
  const chart = await YahooFinance.chart('RELIANCE.NS', { period1: '1990-01-01' });
  console.log('--- CHART ---');
  console.log('Chart quotes count:', chart.quotes.length);
  
  // Compute RSI and DMA example
}
test();
