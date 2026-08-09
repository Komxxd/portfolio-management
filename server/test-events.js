const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function test() {
  try {
    const results = await yahooFinance.quote('AAPL');
    console.log(results.regularMarketPrice);
  } catch (err) {
    console.error(err);
  }
}
test();
