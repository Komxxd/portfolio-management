import React, { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
  portfolioId: string | null;
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

export function AddStockModal({ isOpen, onClose, onAdded, portfolioId }: AddStockModalProps) {
  const [ticker, setTicker] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const [quantity, setQuantity] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  // Debounced search
  useEffect(() => {
    const fetchResults = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      
      // If the query perfectly matches the selected ticker, don't search again
      if (searchQuery === ticker) return;

      setIsSearching(true);
      try {
        const response = await fetch(`http://localhost:5001/api/search?q=${encodeURIComponent(searchQuery)}`);
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();
        setSearchResults(data);
        setShowDropdown(true);
      } catch (err) {
        console.error('Error searching stocks:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(() => {
      fetchResults();
    }, 300); // 300ms delay

    return () => clearTimeout(debounce);
  }, [searchQuery, ticker]);

  if (!isOpen || !portfolioId) return null;

  const handleSelectStock = (result: SearchResult) => {
    setTicker(result.symbol);
    setSearchQuery(result.symbol);
    setShowDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim() || !quantity || !entryPrice || !entryDate) return;

    setLoading(true);
    setError('');

    const { error: dbError } = await supabase
      .from('stocks')
      .insert([
        { 
          portfolio_id: portfolioId, 
          symbol: ticker.toUpperCase().trim(),
          quantity: parseFloat(quantity),
          entry_price: parseFloat(entryPrice),
          entry_date: entryDate
        }
      ]);

    setLoading(false);

    if (dbError) {
      setError(dbError.message);
    } else {
      setTicker('');
      setSearchQuery('');
      setQuantity('');
      setEntryPrice('');
      setEntryDate(new Date().toISOString().split('T')[0]);
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
        
        <h2 className="text-xl font-semibold mb-1 text-zinc-900 tracking-tight">Add New Asset</h2>
        <p className="text-sm text-gray-500 mb-6">Search and enter the asset details.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            
            {/* Search Bar */}
            <div className="relative" ref={dropdownRef}>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                Search Asset Symbol
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow uppercase"
                  placeholder="e.g. RELIANCE.NS, AAPL"
                  autoComplete="off"
                  autoFocus
                />
                {isSearching && (
                  <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-gray-200 border-t-zinc-900 rounded-full animate-spin" />
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto divide-y divide-gray-100">
                  {searchResults.map((result) => (
                    <button
                      key={result.symbol}
                      type="button"
                      onClick={() => handleSelectStock(result)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between group transition-colors"
                    >
                      <div className="overflow-hidden">
                        <div className="font-semibold text-sm text-zinc-900 group-hover:text-orange-600 transition-colors">
                          {result.symbol}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {result.name}
                        </div>
                      </div>
                      <div className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded shrink-0 ml-2 uppercase">
                        {result.exchange}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="entryDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Entry Date
                </label>
                <input
                  type="date"
                  id="entryDate"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                />
              </div>
              
              <div>
                <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  id="quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                  placeholder="0.00"
                  step="any"
                  min="0"
                />
              </div>

              <div className="col-span-2">
                <label htmlFor="entryPrice" className="block text-sm font-medium text-gray-700 mb-1">
                  Entry Price (₹)
                </label>
                <input
                  type="number"
                  id="entryPrice"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                  placeholder="150.00"
                  step="any"
                  min="0"
                />
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
              disabled={loading || !ticker.trim() || !quantity || !entryPrice || !entryDate}
              className="bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Add Asset'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
