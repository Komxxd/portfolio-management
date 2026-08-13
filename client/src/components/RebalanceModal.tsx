import { useState, useMemo } from 'react';
import { X, RefreshCw, AlertCircle, ArrowRight, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface SymbolGroup {
  symbol: string;
  netQty: number;
  currentValue: number;
  livePrice: number;
}

interface RebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  symbolGroups: SymbolGroup[];
  totalCurrentValue: number;
  onSuccess: () => void;
}

interface Trade {
  symbol: string;
  action: 'BUY' | 'SELL';
  qty: number;
  price: number;
  value: number;
  targetValue: number;
}

export function RebalanceModal({ isOpen, onClose, portfolioId, symbolGroups, totalCurrentValue, onSuccess }: RebalanceModalProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const trades = useMemo(() => {
    if (!symbolGroups || symbolGroups.length === 0) return [];
    
    const numAssets = symbolGroups.length;
    const targetValuePerAsset = totalCurrentValue / numAssets;
    
    const proposedTrades: Trade[] = [];
    
    symbolGroups.forEach(group => {
      // Find difference between target and current value
      const diff = targetValuePerAsset - group.currentValue;
      
      // Calculate how many shares to buy/sell to reach target (rounded to nearest whole share)
      // If diff is positive, we need to buy. If negative, sell.
      let actionQty = Math.round(diff / group.livePrice);
      
      if (actionQty !== 0) {
        proposedTrades.push({
          symbol: group.symbol,
          action: actionQty > 0 ? 'BUY' : 'SELL',
          qty: Math.abs(actionQty),
          price: group.livePrice,
          value: Math.abs(actionQty) * group.livePrice,
          targetValue: targetValuePerAsset
        });
      }
    });
    
    // Sort trades: Sells first (to free up capital), then Buys
    return proposedTrades.sort((a, b) => {
      if (a.action === b.action) return b.value - a.value;
      return a.action === 'SELL' ? -1 : 1;
    });
  }, [symbolGroups, totalCurrentValue]);

  const { netCash } = useMemo(() => {
    let required = 0;
    let generated = 0;
    trades.forEach(t => {
      if (t.action === 'BUY') required += t.value;
      else generated += t.value;
    });
    return {
      totalCashRequired: required,
      totalCashGenerated: generated,
      netCash: generated - required
    };
  }, [trades]);

  const executeTrades = async () => {
    if (trades.length === 0) return;
    
    setIsExecuting(true);
    setError(null);
    
    try {
      // Get the currently logged-in user
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error("Not authenticated");
      
      const today = new Date().toISOString().split('T')[0];
      
      const buysToInsert = trades.filter(t => t.action === 'BUY').map(trade => ({
        portfolio_id: portfolioId,
        user_id: session.user.id,
        symbol: trade.symbol,
        quantity: trade.qty,
        entry_price: trade.price,
        entry_date: today
      }));
      
      const sellsToInsert = trades.filter(t => t.action === 'SELL').map(trade => ({
        portfolio_id: portfolioId,
        user_id: session.user.id,
        symbol: trade.symbol,
        quantity: trade.qty,
        exit_price: trade.price,
        exit_date: today
      }));
      
      if (buysToInsert.length > 0) {
        const { error: buysError } = await supabase.from('stocks').insert(buysToInsert);
        if (buysError) throw buysError;
      }
      
      if (sellsToInsert.length > 0) {
        const { error: sellsError } = await supabase.from('sold_stocks').insert(sellsToInsert);
        if (sellsError) throw sellsError;
      }
      
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Failed to execute rebalance:", err);
      setError(err.message || "Failed to execute trades.");
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Equal Weight Rebalancing</h2>
            <p className="text-sm text-gray-500 mt-1">
              Target Allocation: <strong>{(100 / symbolGroups.length).toFixed(2)}%</strong> per asset
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50/50 p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-800">Rebalance Failed</h4>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {trades.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-2">Portfolio is Balanced!</h3>
              <p className="text-gray-500">Your portfolio is already equally weighted across all assets.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Target Value / Asset</div>
                  <div className="text-xl font-bold text-zinc-900">
                    ₹{(totalCurrentValue / symbolGroups.length).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Trades Required</div>
                  <div className="text-xl font-bold text-zinc-900">
                    {trades.length}
                  </div>
                </div>
                <div className={`border rounded-lg p-4 shadow-sm ${netCash >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                  <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${netCash >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    Net Cash {netCash >= 0 ? 'Generated' : 'Required'}
                  </div>
                  <div className={`text-xl font-bold ${netCash >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {netCash >= 0 ? '+' : ''}₹{Math.abs(netCash).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Trades Table */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Asset</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Action</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Qty</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Price</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {trades.map((trade, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-bold text-sm text-zinc-900">{trade.symbol}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                            trade.action === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {trade.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-zinc-900 text-right">
                          {trade.qty.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">
                          ₹{trade.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-zinc-900 text-right">
                          ₹{trade.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="text-xs text-gray-500 flex items-start gap-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p>
                  Trades are rounded to the nearest whole share as fractional shares are generally not supported on this exchange. 
                  This is why there may be a small Net Cash difference after rebalancing.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          
          {trades.length > 0 && (
            <button
              onClick={executeTrades}
              disabled={isExecuting}
              className="px-6 py-2 text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  Execute Rebalance
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
