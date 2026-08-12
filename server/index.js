const express = require("express");
const cors = require("cors");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "API Running" });
});

// Search endpoint
app.get("/api/search", async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.json([]);
        }
        
        const results = await yahooFinance.search(query, { quotesCount: 20, newsCount: 0 });
        
        const formattedResults = (results.quotes || [])
            .filter(q => q.isYahooFinance) // ensure valid symbols
            .map(q => ({
                symbol: q.symbol,
                name: q.shortname || q.longname || q.symbol,
                exchange: q.exchDisp || q.exchange || ''
            }));
            
        res.json(formattedResults);
    } catch (error) {
        console.error("Search Error:", error);
        res.status(500).json({ error: "Failed to search stocks" });
    }
});

// Prices endpoint
app.get("/api/prices", async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
        const symbolsParam = req.query.symbols;
        if (!symbolsParam) {
            return res.json({});
        }
        
        const symbols = symbolsParam.split(",").map(s => s.trim()).filter(Boolean);
        if (symbols.length === 0) {
            return res.json({});
        }
        
        const prices = {};
        const quotes = await yahooFinance.quote(symbols);
        
        const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
        
        quotesArray.forEach(q => {
            if (q && q.symbol && q.regularMarketPrice) {
                prices[q.symbol] = {
                    price: q.regularMarketPrice,
                    name: q.shortName || q.longName || q.shortname || q.longname || q.symbol
                };
            }
        });
        
        res.json(prices);
    } catch (error) {
        console.error("Prices Error:", error);
        res.status(500).json({ error: "Failed to fetch prices" });
    }
});

// Corporate Actions endpoint
app.get("/api/corporate-actions", async (req, res) => {
    try {
        const symbol = req.query.symbol;
        if (!symbol) {
            return res.status(400).json({ error: "Symbol is required" });
        }
        
        // Fetch chart data from a long time ago to get all events
        const result = await yahooFinance.chart(symbol, {
            period1: '1990-01-01'
        });
        
        let dividends = [];
        let splits = [];

        if (result && result.events) {
            if (result.events.dividends) {
                dividends = Object.values(result.events.dividends).map(d => ({
                    date: d.date,
                    amount: d.amount
                }));
            }
            if (result.events.splits) {
                splits = Object.values(result.events.splits).map(s => ({
                    date: s.date,
                    numerator: s.numerator,
                    denominator: s.denominator,
                    splitRatio: s.splitRatio
                }));
            }
        }
        
        // Sort by date descending
        dividends.sort((a, b) => new Date(b.date) - new Date(a.date));
        splits.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({
            symbol,
            dividends,
            splits
        });
    } catch (error) {
        console.error("Corporate Actions Error:", error);
        res.status(500).json({ error: "Failed to fetch corporate actions" });
    }
});

app.post('/api/bulk-corporate-actions', async (req, res) => {
    try {
        const { symbols } = req.body;
        if (!symbols || !Array.isArray(symbols)) {
            return res.status(400).json({ error: "Missing or invalid 'symbols' array in request body" });
        }

        const fetchSymbolActions = async (symbol) => {
            try {
                const result = await yahooFinance.chart(symbol, {
                    period1: '1990-01-01'
                });

                let events = [];
                if (result && result.events) {
                    if (result.events.dividends) {
                        events.push(...Object.values(result.events.dividends).map(d => ({
                            symbol,
                            type: 'DIVIDEND',
                            date: d.date,
                            amount: d.amount
                        })));
                    }
                    if (result.events.splits) {
                        events.push(...Object.values(result.events.splits).map(s => ({
                            symbol,
                            type: 'SPLIT',
                            date: s.date,
                            numerator: s.numerator,
                            denominator: s.denominator,
                            splitRatio: s.splitRatio
                        })));
                    }
                }
                return events;
            } catch (err) {
                console.error(`Failed to fetch corporate actions for ${symbol}:`, err);
                return []; // Return empty for failed symbols so others still succeed
            }
        };

        const allResults = await Promise.all(symbols.map(fetchSymbolActions));
        // Flatten and sort by date descending
        const allEvents = allResults.flat().sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ events: allEvents });
    } catch (error) {
        console.error("Bulk Corporate Actions Error:", error);
        res.status(500).json({ error: "Failed to fetch bulk corporate actions" });
    }
});

const PORT = process.env.PORT || 5001;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on ${PORT}`);
    });
}

module.exports = app;