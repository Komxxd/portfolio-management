import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, AlertCircle, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface SellStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
  portfolioId: string | null;
  initialSymbol?: string;
  initialPrice?: number;
}

interface OwnedStock {
  symbol: string;
  totalBought: number;   // total qty bought
  totalSold: number;     // qty already sold
  available: number;     // totalBought - totalSold
  entryPrice: number;    // for reference display
}

export function SellStockModal({ isOpen, onClose, onAdded, portfolioId, initialSymbol, initialPrice }: SellStockModalProps) {
  const [ownedStocks, setOwnedStocks] = useState<OwnedStock[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(false);

  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol || '');
  const [searchQuery, setSearchQuery] = useState(initialSymbol || '');
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [brokerage, setBrokerage] = useState('0');
  const [govtTax, setGovtTax] = useState('0');
  const [exitDate, setExitDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Derive the selected stock info for inline hints
  const selectedStock = ownedStocks.find(s => s.symbol === selectedSymbol) ?? null;
  const filteredStocks = ownedStocks.filter(s =>
    s.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Quantity validation
  const parsedQty = parseFloat(quantity);
  const qtyExceedsHolding =
    selectedStock !== null &&
    !isNaN(parsedQty) &&
    parsedQty > selectedStock.available;

  // Fetch owned stocks whenever the modal opens
  useEffect(() => {
    if (!isOpen || !portfolioId) return;

    const fetchOwnedStocks = async () => {
      setLoadingStocks(true);
      setOwnedStocks([]);
      setSelectedSymbol(initialSymbol || '');
      setSearchQuery(initialSymbol || '');
      setShowDropdown(false);
      setQuantity('');
      setExitPrice(initialPrice ? initialPrice.toString() : '');
      setBrokerage('0');
      setGovtTax('0');
      setExitDate(new Date().toISOString().split('T')[0]);
      setError('');

      try {
        // 1. Fetch all buy records for this portfolio
        const { data: bought, error: buyErr } = await supabase
          .from('stocks')
          .select('symbol, quantity, entry_price')
          .eq('portfolio_id', portfolioId);

        if (buyErr) throw buyErr;
        if (!bought || bought.length === 0) {
          setOwnedStocks([]);
          setLoadingStocks(false);
          return;
        }

        // 2. Fetch all sell records for this portfolio
        const { data: sold, error: sellErr } = await supabase
          .from('sold_stocks')
          .select('symbol, quantity')
          .eq('portfolio_id', portfolioId);

        if (sellErr) throw sellErr;

        // 3. Aggregate by symbol
        const buyMap: Record<string, { totalBought: number; entryPrice: number }> = {};
        for (const row of bought) {
          const sym = row.symbol;
          if (!buyMap[sym]) buyMap[sym] = { totalBought: 0, entryPrice: row.entry_price };
          buyMap[sym].totalBought += Number(row.quantity);
        }

        const sellMap: Record<string, number> = {};
        for (const row of sold ?? []) {
          const sym = row.symbol;
          sellMap[sym] = (sellMap[sym] ?? 0) + Number(row.quantity);
        }

        // 4. Build final list – only symbols with available qty > 0
        const list: OwnedStock[] = Object.entries(buyMap)
          .map(([symbol, { totalBought, entryPrice }]) => ({
            symbol,
            totalBought,
            entryPrice,
            totalSold: sellMap[symbol] ?? 0,
            available: totalBought - (sellMap[symbol] ?? 0),
          }))
          .filter(s => s.available > 0)
          .sort((a, b) => a.symbol.localeCompare(b.symbol));

        setOwnedStocks(list);
      } catch (err: any) {
        setError('Failed to load portfolio holdings: ' + err.message);
      } finally {
        setLoadingStocks(false);
      }
    };

    fetchOwnedStocks();
  }, [isOpen, portfolioId]);

  if (!isOpen || !portfolioId) return null;

  const handleSelectStock = async (stockSymbol: string) => {
    setSelectedSymbol(stockSymbol);
    setSearchQuery(stockSymbol);
    setQuantity('');
    setShowDropdown(false);

    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/prices?symbols=${encodeURIComponent(stockSymbol)}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data[stockSymbol]) {
          setExitPrice(data[stockSymbol].price.toString());
        }
      }
    } catch (err) {
      console.error('Error fetching live price:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSymbol || !quantity || !exitPrice || !exitDate) return;
    if (qtyExceedsHolding) return;

    setLoading(true);
    setError('');

    const { error: dbError } = await supabase
      .from('sold_stocks')
      .insert([
        {
          portfolio_id: portfolioId,
          symbol: selectedSymbol,
          quantity: parseFloat(quantity),
          exit_price: parseFloat(exitPrice),
          brokerage: parseFloat(brokerage || '0'),
          govt_tax: parseFloat(govtTax || '0'),
          exit_date: exitDate,
        },
      ]);

    setLoading(false);
    if (dbError) {
      setError(dbError.message);
    } else {
      onAdded();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white w-full max-w-md rounded-xl p-6 relative shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-xl font-semibold mb-1 text-zinc-900 tracking-tight">Sell Asset</h2>
        <p className="text-sm text-gray-500 mb-6">Select from your holdings and enter exit details.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">

            {/* Owned Stocks Dropdown */}
            <div>
              <label htmlFor="sell-symbol" className="block text-sm font-medium text-gray-700 mb-1">
                Select Asset to Sell
              </label>

              {loadingStocks ? (
                <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-zinc-900 rounded-full animate-spin" />
                  Loading your holdings…
                </div>
              ) : ownedStocks.length === 0 ? (
                <div className="flex items-center gap-2 py-3 px-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  No assets available to sell in this portfolio.
                </div>
              ) : (
                <div className="relative" ref={dropdownRef}>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      id="sell-symbol"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSelectedSymbol('');
                        setQuantity('');
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow placeholder-gray-400"
                      placeholder="Search or select asset to sell"
                      autoComplete="off"
                    />
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 w-4 h-4 text-gray-400" />
                  </div>
                  
                  {showDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto divide-y divide-gray-100">
                      {filteredStocks.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">No matching assets found</div>
                      ) : (
                        filteredStocks.map((s) => (
                          <button
                            key={s.symbol}
                            type="button"
                            onClick={() => handleSelectStock(s.symbol)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between group transition-colors"
                          >
                            <div className="font-semibold text-sm text-zinc-900 group-hover:text-orange-600 transition-colors">
                              {s.symbol}
                            </div>
                            <div className="text-[10px] text-gray-500 bg-gray-100 px-2 py-1 rounded uppercase tracking-wider">
                              Available: {s.available.toLocaleString()}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Holding hint */}
              {selectedStock && (
                <p className="mt-1.5 text-[11px] text-gray-400">
                  Bought: <span className="font-medium text-zinc-600">{selectedStock.totalBought.toLocaleString()}</span>
                  &nbsp;·&nbsp; Sold: <span className="font-medium text-zinc-600">{selectedStock.totalSold.toLocaleString()}</span>
                  &nbsp;·&nbsp; Available: <span className="font-medium text-green-600">{selectedStock.available.toLocaleString()}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="exitDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Exit Date
                </label>
                <input
                  type="date"
                  id="exitDate"
                  value={exitDate}
                  onChange={(e) => setExitDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                />
              </div>

              <div>
                <label htmlFor="exitPrice" className="block text-sm font-medium text-gray-700 mb-1">
                  Exit Price (₹)
                </label>
                <input
                  type="number"
                  id="exitPrice"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                  placeholder="150.00"
                  step="any"
                  min="0"
                  disabled={!selectedSymbol}
                />
              </div>

              <div className="col-span-2 grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="sell-quantity" className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity
                    {selectedStock && (
                      <span className="ml-1 text-[10px] font-normal text-gray-400">
                        (max {selectedStock.available.toLocaleString()})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    id="sell-quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    max={selectedStock?.available}
                    className={`w-full bg-white border rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 transition-shadow ${
                      qtyExceedsHolding
                        ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                        : 'border-gray-200 focus:ring-zinc-900 focus:border-zinc-900'
                    }`}
                    placeholder="0.00"
                    step="any"
                    min="0"
                    disabled={!selectedSymbol}
                  />
                  {qtyExceedsHolding && (
                    <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Exceeds available holding of {selectedStock!.available.toLocaleString()}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="brokerage" className="block text-sm font-medium text-gray-700 mb-1">
                    Brokerage (₹)
                  </label>
                  <input
                    type="number"
                    id="brokerage"
                    value={brokerage}
                    onChange={(e) => setBrokerage(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                    placeholder="0.00"
                    step="any"
                    min="0"
                    disabled={!selectedSymbol}
                  />
                </div>

                <div>
                  <label htmlFor="govtTax" className="block text-sm font-medium text-gray-700 mb-1">
                    Govt Tax (₹)
                  </label>
                  <input
                    type="number"
                    id="govtTax"
                    value={govtTax}
                    onChange={(e) => setGovtTax(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                    placeholder="0.00"
                    step="any"
                    min="0"
                    disabled={!selectedSymbol}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="pt-4 flex justify-end gap-2 border-t border-gray-100 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 border border-transparent rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !selectedSymbol ||
                !quantity ||
                !exitPrice ||
                !exitDate ||
                qtyExceedsHolding ||
                ownedStocks.length === 0
              }
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Sell Asset'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
