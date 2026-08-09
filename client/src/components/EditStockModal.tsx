import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface Stock {
  id: string;
  portfolio_id: string;
  symbol: string;
  quantity: number;
  entry_price: number;
  brokerage?: number;
  govt_tax?: number;
  entry_date: string;
}

interface EditStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdited: () => void;
  stock: Stock | null;
}

export function EditStockModal({ isOpen, onClose, onEdited, stock }: EditStockModalProps) {
  const [quantity, setQuantity] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [brokerage, setBrokerage] = useState('0');
  const [govtTax, setGovtTax] = useState('0');
  const [entryDate, setEntryDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (stock) {
      setQuantity(stock.quantity.toString());
      setEntryPrice(stock.entry_price.toString());
      setBrokerage((stock.brokerage || 0).toString());
      setGovtTax((stock.govt_tax || 0).toString());
      setEntryDate(stock.entry_date);
    }
  }, [stock]);

  if (!isOpen || !stock) return null;

  const isBonus = stock.entry_price === 0;
  const isSplit = stock.entry_price === -1;
  const isDividend = stock.entry_price === -2;
  const isCorporateAction = isBonus || isSplit || isDividend;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || !entryPrice || !entryDate) return;

    setLoading(true);
    setError('');

    const { error: dbError } = await supabase
      .from('stocks')
      .update({ 
        quantity: parseFloat(quantity),
        entry_price: parseFloat(entryPrice),
        brokerage: parseFloat(brokerage || '0'),
        govt_tax: parseFloat(govtTax || '0'),
        entry_date: entryDate
      })
      .eq('id', stock.id);

    setLoading(false);

    if (dbError) {
      setError(dbError.message);
    } else {
      onEdited();
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
        
        <h2 className="text-xl font-semibold mb-1 text-zinc-900 tracking-tight">{isBonus ? 'Edit Bonus' : isSplit ? 'Edit Split' : isDividend ? 'Edit Dividend' : 'Edit Asset'}: {stock.symbol}</h2>
        <p className="text-sm text-gray-500 mb-6">Update the details for this {isBonus ? 'bonus issue' : isSplit ? 'stock split' : isDividend ? 'dividend' : 'asset'}.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Asset Symbol
              </label>
              <input
                type="text"
                value={stock.symbol}
                disabled
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label htmlFor="editEntryDate" className="block text-sm font-medium text-gray-700 mb-1">
                Entry Date
              </label>
              <input
                type="date"
                id="editEntryDate"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
              />
            </div>
            
            {!isCorporateAction && (
              <div>
                <label htmlFor="editEntryPrice" className="block text-sm font-medium text-gray-700 mb-1">
                  Entry Price (₹)
                </label>
                <input
                  type="number"
                  id="editEntryPrice"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                  step="any"
                  min="0"
                />
              </div>
            )}
            
            <div className={`col-span-2 ${!isCorporateAction ? 'grid grid-cols-3 gap-4' : ''}`}>
              <div>
                <label htmlFor="editQuantity" className="block text-sm font-medium text-gray-700 mb-1">
                  {isSplit ? 'Split Multiplier' : isDividend ? 'Dividend Per Share (₹)' : 'Quantity'}
                </label>
                <input
                  type="number"
                  id="editQuantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                  step="any"
                  min={isSplit || isDividend ? "0.0001" : "0"}
                />
              </div>

              {!isCorporateAction && (
                <>
                  <div>
                    <label htmlFor="editBrokerage" className="block text-sm font-medium text-gray-700 mb-1">
                      Brokerage (₹)
                    </label>
                    <input
                      type="number"
                      id="editBrokerage"
                      value={brokerage}
                      onChange={(e) => setBrokerage(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                      step="any"
                      min="0"
                    />
                  </div>

                  <div>
                    <label htmlFor="editGovtTax" className="block text-sm font-medium text-gray-700 mb-1">
                      Govt Tax (₹)
                    </label>
                    <input
                      type="number"
                      id="editGovtTax"
                      value={govtTax}
                      onChange={(e) => setGovtTax(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
                      step="any"
                      min="0"
                    />
                  </div>
                </>
              )}
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
              disabled={loading || !quantity || !entryPrice || !entryDate}
              className="bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
