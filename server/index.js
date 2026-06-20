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
                prices[q.symbol] = q.regularMarketPrice;
            }
        });
        
        res.json(prices);
    } catch (error) {
        console.error("Prices Error:", error);
        res.status(500).json({ error: "Failed to fetch prices" });
    }
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});