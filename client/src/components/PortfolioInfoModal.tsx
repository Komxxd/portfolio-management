import { useState, useEffect } from 'react';
import { RefreshCw, Info, X, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { Plus, Check } from 'lucide-react';

interface PortfolioInfoModalProps {
  symbols: { symbol: string; name: string }[];
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  onSuccess: () => void;
  existingEvents?: { symbol: string; type: string; date: number; raw: any }[];
}

interface DividendEvent {
  symbol: string;
  type: 'DIVIDEND';
  date: string;
  amount: number;
}

interface SplitEvent {
  symbol: string;
  type: 'SPLIT';
  date: string;
  numerator: number;
  denominator: number;
  splitRatio: string;
}

type UnifiedEvent = DividendEvent | SplitEvent;

export function PortfolioInfoModal({ symbols, isOpen, onClose, portfolioId, onSuccess, existingEvents = [] }: PortfolioInfoModalProps) {
  const [loading, setLoading] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [addingEventId, setAddingEventId] = useState<string | null>(null);
  const [addedEvents, setAddedEvents] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'dividends' | 'splits' | 'bonuses'>('all');

  useEffect(() => {
    if (isOpen && symbols.length > 0) {
      fetchCorporateActions();
    } else if (!isOpen) {
      setEvents([]);
      setAddedEvents(new Set());
    }
  }, [isOpen, symbols]);

  const fetchCorporateActions = async (forceRefresh = false) => {
    const cacheKey = `portfolio_corp_actions_${symbols.map(s => s.symbol).sort().join(',')}`;

    if (!forceRefresh) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setEvents(parsed);
          return;
        } catch (e) {
          // ignore parse errors and fetch fresh
        }
      }
    }

    setLoading(true);
    setError('');
    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${baseUrl}/api/bulk-corporate-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ symbols: symbols.map(s => s.symbol) })
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch corporate actions');
      }
      
      const data = await response.json();
      const events = data.events || [];
      
      sessionStorage.setItem(cacheKey, JSON.stringify(events));
      setEvents(events);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const isAlreadyAdded = (event: UnifiedEvent, idx: number) => {
    if (addedEvents.has(`${event.symbol}-${event.date}-${idx}`)) return true;

    const eventDateString = new Date(event.date).toISOString().split('T')[0];
    return existingEvents.some(ex => {
      if (ex.symbol !== event.symbol) return false;
      
      if (event.type === 'DIVIDEND' && ex.type !== 'DIVIDEND') return false;
      if (event.type === 'SPLIT' && ex.type !== 'SPLIT' && ex.type !== 'BONUS') return false;

      const exDateString = new Date(ex.date).toISOString().split('T')[0];
      if (exDateString !== eventDateString) return false;

      if (event.type === 'DIVIDEND') {
        return Number(ex.raw?.quantity || 0) === event.amount;
      } else {
        const ratio = event.numerator / event.denominator;
        return Number(ex.raw?.quantity || 0) === ratio;
      }
    });
  };

  let displayEvents = events;
  if (activeTab === 'dividends') {
    displayEvents = events.filter(e => e.type === 'DIVIDEND');
  } else if (activeTab === 'splits' || activeTab === 'bonuses') {
    displayEvents = events.filter(e => e.type === 'SPLIT');
  }

  const handleAdd = async (event: UnifiedEvent, idx: number) => {
    const eventId = `${event.symbol}-${idx}`;
    setAddingEventId(eventId);
    
    try {
      let entryPrice = 0;
      let quantity = 0;
      
      if (event.type === 'DIVIDEND') {
        entryPrice = -2;
        quantity = event.amount;
      } else if (event.type === 'SPLIT') {
        entryPrice = -1;
        quantity = event.numerator / event.denominator;
      }

      // Check if we hold shares on or before this date
      const { data: buyData, error: buyError } = await supabase
        .from('stocks')
        .select('entry_date')
        .eq('portfolio_id', portfolioId)
        .eq('symbol', event.symbol)
        .gt('entry_price', 0)
        .order('entry_date', { ascending: true })
        .limit(1);

      if (buyError) throw buyError;
      if (!buyData || buyData.length === 0) {
        throw new Error(`You must have at least one buy position for ${event.symbol} before adding this ${event.type.toLowerCase()}.`);
      }

      const firstBuyDate = new Date(buyData[0].entry_date).getTime();
      const actionDate = new Date(event.date).getTime();

      if (actionDate < firstBuyDate) {
        throw new Error(`This ${event.type.toLowerCase()} date (${new Date(event.date).toLocaleDateString()}) is before your first buy date (${new Date(buyData[0].entry_date).toLocaleDateString()}). It cannot be added.`);
      }

      const { error } = await supabase.from('stocks').insert({
        portfolio_id: portfolioId,
        symbol: event.symbol,
        quantity: quantity,
        entry_price: entryPrice,
        entry_date: new Date(event.date).toISOString().split('T')[0],
        brokerage: 0,
        govt_tax: 0
      });

      if (error) throw error;
      setAddedEvents(prev => new Set(prev).add(`${event.symbol}-${event.date}-${idx}`));
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to add corporate action');
    } finally {
      setAddingEventId(null);
    }
  };

  const handleAddAllValid = async () => {
    setSyncingAll(true);
    try {
      const unaddedEvents = displayEvents.filter((ev, idx) => !isAlreadyAdded(ev, idx));

      if (unaddedEvents.length === 0) {
        alert('All visible valid actions are already added!');
        return;
      }

      const symbolsToFetch = [...new Set(unaddedEvents.map(e => e.symbol))];
      const { data: buyData, error: buyError } = await supabase
        .from('stocks')
        .select('symbol, entry_date')
        .eq('portfolio_id', portfolioId)
        .in('symbol', symbolsToFetch)
        .gt('entry_price', 0);

      if (buyError) throw buyError;

      const firstBuyDates: Record<string, number> = {};
      if (buyData) {
        buyData.forEach(row => {
          const t = new Date(row.entry_date).getTime();
          if (!firstBuyDates[row.symbol] || t < firstBuyDates[row.symbol]) {
            firstBuyDates[row.symbol] = t;
          }
        });
      }

      const inserts: any[] = [];
      const newAddedEventKeys: string[] = [];

      unaddedEvents.forEach((event) => {
        const firstBuyDate = firstBuyDates[event.symbol];
        if (!firstBuyDate) return; 

        const actionDate = new Date(event.date).getTime();
        if (actionDate < firstBuyDate) return;

        let entryPrice = 0;
        let quantity = 0;

        if (event.type === 'DIVIDEND') {
          entryPrice = -2;
          quantity = event.amount;
        } else {
          entryPrice = -1;
          quantity = event.numerator / event.denominator;
        }

        inserts.push({
          portfolio_id: portfolioId,
          symbol: event.symbol,
          quantity: quantity,
          entry_price: entryPrice,
          entry_date: new Date(event.date).toISOString().split('T')[0],
          brokerage: 0,
          govt_tax: 0
        });
        
        const trueIdx = displayEvents.indexOf(event);
        newAddedEventKeys.push(`${event.symbol}-${event.date}-${trueIdx}`);
      });

      if (inserts.length === 0) {
        alert('No valid actions found to add (they occurred before your first buy).');
        return;
      }

      const { error } = await supabase.from('stocks').insert(inserts);
      if (error) throw error;

      setAddedEvents(prev => {
        const next = new Set(prev);
        newAddedEventKeys.forEach(k => next.add(k));
        return next;
      });

      alert(`Successfully added ${inserts.length} corporate action(s)!`);
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to sync corporate actions');
    } finally {
      setSyncingAll(false);
    }
  };

  const exportCorporateActions = () => {
    if (displayEvents.length === 0) return;
    
    const data = displayEvents.map(event => {
      const stockName = symbols.find(s => s.symbol === event.symbol)?.name || '';
      const typeStr = event.type === 'DIVIDEND' ? 'Dividend' : 'Split/Bonus';
      const dateStr = formatDate(event.date);
      const valStr = event.type === 'DIVIDEND' ? event.amount : `${event.numerator}:${event.denominator}`;
      
      return {
        Symbol: event.symbol,
        'Stock Name': stockName,
        Type: typeStr,
        Date: dateStr,
        'Amount/Ratio': valStr
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Corporate Actions');
    XLSX.writeFile(wb, `portfolio_corporate_actions_${activeTab}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col h-[500px]">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-bold text-zinc-900">Portfolio Corporate Actions</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row gap-3 justify-between sm:items-center shrink-0">
          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 w-full sm:w-fit overflow-x-auto">
            {(['all', 'dividends', 'splits', 'bonuses'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 sm:px-4 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap flex-1 sm:flex-none ${
                  activeTab === tab ? 'bg-white text-zinc-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleAddAllValid}
              disabled={loading || syncingAll || displayEvents.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-md"
              title="Automatically add all valid corporate actions that aren't already added"
            >
              {syncingAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Sync All Valid
            </button>
            <div className="w-px h-3 bg-gray-300"></div>
            <button
              onClick={exportCorporateActions}
              disabled={loading || displayEvents.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-zinc-900 transition-colors disabled:opacity-50"
              title="Download Corporate Actions as Excel"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <div className="w-px h-3 bg-gray-300"></div>
            <button
              onClick={() => fetchCorporateActions(true)}
              disabled={loading || symbols.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-zinc-900 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-zinc-900 rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Fetching historical events across portfolio...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 text-sm">{error}</div>
          ) : symbols.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              <p>Your portfolio is empty. Add assets to see their corporate actions.</p>
            </div>
          ) : displayEvents.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              <p>No historical {activeTab === 'all' ? 'events' : activeTab} found for any portfolio assets.</p>
              {activeTab === 'bonuses' && (
                <p className="text-xs text-gray-400 mt-2">Note: Yahoo Finance often records bonus issues as stock splits.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {displayEvents.map((event, idx) => {
                const stockName = symbols.find(s => s.symbol === event.symbol)?.name;
                
                return (
                <div key={`${event.symbol}-${idx}`} className="flex items-center justify-between p-2.5 bg-white border border-gray-100 rounded-lg shadow-xs hover:border-gray-200 hover:bg-gray-50 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      event.type === 'DIVIDEND' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {event.type === 'DIVIDEND' ? 'D' : 'S'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <div className="text-xs font-bold text-zinc-900 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                          {event.symbol}
                        </div>
                        {stockName && (
                          <div className="text-[10px] font-medium text-gray-500 truncate max-w-[200px]" title={stockName}>
                            {stockName}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-semibold text-zinc-700">
                          {event.type === 'DIVIDEND' ? 'Dividend' : 'Stock Split / Bonus'}
                        </div>
                        <span className="text-gray-300">•</span>
                        <div className="text-[10px] text-gray-500">{formatDate(event.date)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-bold text-zinc-900">
                        {event.type === 'DIVIDEND' 
                          ? `₹${event.amount?.toFixed(2)}` 
                          : `${event.numerator}:${event.denominator}`}
                      </div>
                      <div className="text-[9px] text-gray-400 mt-0.5 uppercase tracking-wider font-medium">
                        {event.type === 'DIVIDEND' ? 'Per Share' : 'Ratio'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(event, idx)}
                      disabled={addingEventId === `${event.symbol}-${idx}` || isAlreadyAdded(event, idx)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 ml-2 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${
                        isAlreadyAdded(event, idx)
                          ? 'bg-green-50 text-green-600 cursor-not-allowed'
                          : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                      title={isAlreadyAdded(event, idx) ? "Already added" : "Add to portfolio"}
                    >
                      {addingEventId === `${event.symbol}-${idx}` ? (
                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> <span className="hidden sm:inline">Adding...</span></>
                      ) : isAlreadyAdded(event, idx) ? (
                        <><Check className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Added</span></>
                      ) : (
                        <><Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add</span></>
                      )}
                    </button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
