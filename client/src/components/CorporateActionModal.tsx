import React, { useState, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface CorporateActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'bonus' | 'split' | 'dividend' | null;
  portfolioId: string | null;
  ownedSymbols: string[];
  symbolGroups: any[];
  onSuccess?: () => void;
}

export function CorporateActionModal({ isOpen, onClose, type, portfolioId, ownedSymbols, symbolGroups, onSuccess }: CorporateActionModalProps) {
  const [symbol, setSymbol] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [qty, setQty] = useState('');
  const [splitFactor, setSplitFactor] = useState('');
  const [dividend, setDividend] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredSymbols = ownedSymbols.filter(sym => sym.toLowerCase().includes(searchQuery.toLowerCase()));

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

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSymbol('');
      setSearchQuery('');
      setDate(new Date().toISOString().split('T')[0]);
      setQty('');
      setSplitFactor('');
      setDividend('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, ownedSymbols]);

  if (!isOpen || !type || !portfolioId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (type !== 'bonus' && type !== 'split' && type !== 'dividend') {
      return;
    }

    if (!symbol) {
      setError('Please select an asset symbol');
      return;
    }

    if (type === 'bonus' && (!qty || Number(qty) <= 0)) {
      setError('Please enter a valid bonus quantity');
      return;
    }

    if (type === 'split' && (!splitFactor || Number(splitFactor) <= 0)) {
      setError('Please enter a valid split factor');
      return;
    }

    if (type === 'dividend' && (!dividend || Number(dividend) <= 0)) {
      setError('Please enter a valid dividend amount');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      if (type === 'bonus' || type === 'split' || type === 'dividend') {
        const { data: buyData, error: buyError } = await supabase
          .from('stocks')
          .select('entry_date')
          .eq('portfolio_id', portfolioId)
          .eq('symbol', symbol.toUpperCase())
          .gt('entry_price', 0)
          .order('entry_date', { ascending: true })
          .limit(1);

        if (buyError) throw buyError;
        if (!buyData || buyData.length === 0) {
          setError(`You must have at least one buy position for this symbol before adding a ${type}.`);
          setSubmitting(false);
          return;
        }

        const firstBuyDate = new Date(buyData[0].entry_date).getTime();
        const actionDate = new Date(date).getTime();

        if (actionDate < firstBuyDate) {
          setError(`${type.charAt(0).toUpperCase() + type.slice(1)} date cannot be before the first buy date (${new Date(buyData[0].entry_date).toLocaleDateString()})`);
          setSubmitting(false);
          return;
        }
        
        // Validate that we hold shares on exactly this date
        const group = symbolGroups.find(g => g.symbol === symbol.toUpperCase());
        if (group && group.events) {
          let openQty = 0;
          for (const ev of group.events) {
             if (ev.date > actionDate) break; // Only consider events up to the action date
             
             if (ev.type === 'BUY') {
                openQty += Number(ev.raw.quantity);
             } else if (ev.type === 'SELL') {
                openQty -= Number(ev.raw.quantity);
             } else if (ev.type === 'BONUS') {
                if (openQty > 0) openQty += Number(ev.raw.quantity);
             } else if (ev.type === 'SPLIT') {
                if (openQty > 0) openQty *= Number(ev.raw.quantity);
             }
          }
          
          if (openQty <= 0) {
             setError(`You do not hold any shares of ${symbol.toUpperCase()} on this date. You cannot add a ${type}.`);
             setSubmitting(false);
             return;
          }
        }
      }

      // Bonus = 0 cost, Split = -1 cost marker, Dividend = -2 cost marker
      const { error: insertError } = await supabase
        .from('stocks')
        .insert({
          portfolio_id: portfolioId,
          symbol: symbol.toUpperCase(),
          quantity: type === 'bonus' ? Number(qty) : type === 'split' ? Number(splitFactor) : Number(dividend),
          entry_price: type === 'bonus' ? 0 : type === 'split' ? -1 : -2,
          entry_date: date,
          brokerage: 0,
          govt_tax: 0
        });

      if (insertError) throw insertError;

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || `Failed to process ${type} action`);
    } finally {
      setSubmitting(false);
    }
  };

  const titles = {
    bonus: 'Add Bonus Issue',
    split: 'Add Stock Split',
    dividend: 'Add Dividend'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-zinc-900">{titles[type]}</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Content */}
          <div className="p-6 flex-1 overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                {error}
              </div>
            )}

            {type === 'bonus' || type === 'split' || type === 'dividend' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Asset Symbol
                  </label>
                  <div className="relative" ref={dropdownRef}>
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSymbol('');
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder="Search asset you own..."
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                      required
                    />
                    
                    {showDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredSymbols.length > 0 ? (
                          filteredSymbols.map(sym => (
                            <div
                              key={sym}
                              onClick={() => {
                                setSymbol(sym);
                                setSearchQuery(sym);
                                setShowDropdown(false);
                              }}
                              className="px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm font-medium text-zinc-900 transition-colors"
                            >
                              {sym}
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-gray-500 text-center">
                            No matching assets found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {type === 'bonus' ? 'Entry Date' : type === 'split' ? 'Split Date' : 'Dividend Date'}
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                    required
                  />
                </div>

                {type === 'bonus' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bonus Qty <span className="text-xs text-gray-400 font-normal ml-1">(Shares added)</span>
                    </label>
                    <input
                      type="number"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                      placeholder="e.g. 100"
                      min="0"
                      step="0.0001"
                      required
                    />
                  </div>
                ) : type === 'split' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Split Factor <span className="text-xs text-gray-400 font-normal ml-1">(Multiplier, e.g. 2 for 1:2 split)</span>
                    </label>
                    <input
                      type="number"
                      value={splitFactor}
                      onChange={(e) => setSplitFactor(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                      placeholder="e.g. 2"
                      min="0.0001"
                      step="any"
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dividend Per Share (₹)
                    </label>
                    <input
                      type="number"
                      value={dividend}
                      onChange={(e) => setDividend(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all"
                      placeholder="e.g. 5.50"
                      min="0.01"
                      step="any"
                      required
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-gray-500 mb-2">Form fields will be added here.</p>
                <p className="text-xs text-gray-400">This is a placeholder for {titles[type]}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-gray-50/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (type !== 'bonus' && type !== 'split' && type !== 'dividend')}
              className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Processing...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
