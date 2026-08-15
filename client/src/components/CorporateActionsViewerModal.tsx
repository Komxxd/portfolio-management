import { useState, useEffect } from 'react';
import { X, RefreshCw, Plus, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface CorporateActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  portfolioId: string;
  onSuccess: () => void;
  existingEvents?: { type: string; date: number; raw: any }[];
}

interface DividendEvent {
  date: string;
  amount: number;
}

interface SplitEvent {
  date: string;
  numerator: number;
  denominator: number;
  splitRatio: string;
}


export function CorporateActionsViewerModal({ isOpen, onClose, symbol, portfolioId, onSuccess, existingEvents = [] }: CorporateActionModalProps) {
  const [loading, setLoading] = useState(false);
  const [addingEventId, setAddingEventId] = useState<string | null>(null);
  const [addedEvents, setAddedEvents] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [dividends, setDividends] = useState<DividendEvent[]>([]);
  const [splits, setSplits] = useState<SplitEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'dividends' | 'splits' | 'bonuses'>('all');

  useEffect(() => {
    if (isOpen && symbol) {
      fetchCorporateActions();
    }
  }, [isOpen, symbol]);

  const fetchCorporateActions = async (forceRefresh = false) => {
    const cacheKey = `corp_actions_${symbol}`;
    
    if (!forceRefresh) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setDividends(parsed.dividends);
          setSplits(parsed.splits);
          return;
        } catch (e) {
          // ignore parse errors and fetch fresh
        }
      }
    }

    setLoading(true);
    setError('');
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const response = await fetch(`${baseUrl}/api/corporate-actions?symbol=${symbol}`);
      if (!response.ok) {
        throw new Error('Failed to fetch corporate actions');
      }
      const data = await response.json();
      
      sessionStorage.setItem(cacheKey, JSON.stringify({
        dividends: data.dividends || [],
        splits: data.splits || []
      }));

      setDividends(data.dividends || []);
      setSplits(data.splits || []);
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

  type UnifiedEvent = 
    | (DividendEvent & { type: 'DIVIDEND' })
    | (SplitEvent & { type: 'SPLIT' });

  const allEvents: UnifiedEvent[] = [
    ...dividends.map(d => ({ ...d, type: 'DIVIDEND' as const })),
    ...splits.map(s => ({ ...s, type: 'SPLIT' as const }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const isAlreadyAdded = (event: UnifiedEvent, idx: number) => {
    // Check if it was added in this session
    if (addedEvents.has(`${event.date}-${idx}`)) return true;

    // Check against existing database events
    const eventDateString = new Date(event.date).toISOString().split('T')[0];
    return existingEvents.some(ex => {
      if (event.type === 'DIVIDEND' && ex.type !== 'DIVIDEND') return false;
      if (event.type === 'SPLIT' && ex.type !== 'SPLIT' && ex.type !== 'BONUS') return false;

      const exDateString = new Date(ex.date).toISOString().split('T')[0];
      if (exDateString !== eventDateString) return false;

      if (event.type === 'DIVIDEND') {
        return Number(ex.raw.quantity) === event.amount;
      } else {
        const ratio = event.numerator / event.denominator;
        return Number(ex.raw.quantity) === ratio;
      }
    });
  };

  let displayEvents = allEvents;
  if (activeTab === 'dividends') {
    displayEvents = displayEvents.filter(e => e.type === 'DIVIDEND');
  } else if (activeTab === 'splits' || activeTab === 'bonuses') {
    displayEvents = displayEvents.filter(e => e.type === 'SPLIT');
  }

  const handleAdd = async (event: UnifiedEvent, idx: number) => {
    const eventId = `${event.date}-${idx}`;
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
        .eq('symbol', symbol)
        .gt('entry_price', 0)
        .order('entry_date', { ascending: true })
        .limit(1);

      if (buyError) throw buyError;
      if (!buyData || buyData.length === 0) {
        throw new Error(`You must have at least one buy position for ${symbol} before adding this ${event.type.toLowerCase()}.`);
      }

      const firstBuyDate = new Date(buyData[0].entry_date).getTime();
      const actionDate = new Date(event.date).getTime();

      if (actionDate < firstBuyDate) {
        throw new Error(`This ${event.type.toLowerCase()} date (${new Date(event.date).toLocaleDateString()}) is before your first buy date (${new Date(buyData[0].entry_date).toLocaleDateString()}). It cannot be added.`);
      }

      const { error } = await supabase.from('stocks').insert({
        portfolio_id: portfolioId,
        symbol: symbol,
        quantity: quantity,
        entry_price: entryPrice,
        entry_date: new Date(event.date).toISOString().split('T')[0],
        brokerage: 0,
        govt_tax: 0
      });

      if (error) throw error;
      setAddedEvents(prev => new Set(prev).add(`${event.date}-${idx}`));
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to add corporate action');
    } finally {
      setAddingEventId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col h-[500px]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Corporate Actions</h2>
            <p className="text-xs text-gray-500 mt-0.5">{symbol}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/50">
          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
            {(['all', 'dividends', 'splits', 'bonuses'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                  activeTab === tab ? 'bg-white text-zinc-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <button 
            onClick={() => fetchCorporateActions(true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-zinc-900 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <RefreshCw className="w-8 h-8 animate-spin mb-4 text-gray-300" />
              <p className="text-sm">Fetching historical events...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 text-sm">{error}</div>
          ) : displayEvents.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              <p>No historical {activeTab === 'all' ? 'events' : activeTab} found for {symbol}.</p>
              {activeTab === 'bonuses' && (
                <p className="text-xs text-gray-400 mt-2">Note: Yahoo Finance often records bonus issues as stock splits.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {displayEvents.map((event, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-200 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      event.type === 'DIVIDEND' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {event.type === 'DIVIDEND' ? 'D' : 'S'}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">
                        {event.type === 'DIVIDEND' ? 'Dividend' : 'Stock Split / Bonus'}
                      </div>
                      <div className="text-xs text-gray-500">{formatDate(event.date)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold text-zinc-900">
                        {event.type === 'DIVIDEND' 
                          ? `₹${event.amount?.toFixed(2)}` 
                          : `${event.numerator}:${event.denominator}`}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider">
                        {event.type === 'DIVIDEND' ? 'Per Share' : 'Ratio'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(event, idx)}
                      disabled={addingEventId === `${event.date}-${idx}` || isAlreadyAdded(event, idx)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 ml-2 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${
                        isAlreadyAdded(event, idx)
                          ? 'bg-green-50 text-green-600 cursor-not-allowed'
                          : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                      title={isAlreadyAdded(event, idx) ? "Already added" : "Add to portfolio"}
                    >
                      {addingEventId === `${event.date}-${idx}` ? (
                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> <span>Adding...</span></>
                      ) : isAlreadyAdded(event, idx) ? (
                        <><Check className="w-3.5 h-3.5" /> <span>Added</span></>
                      ) : (
                        <><Plus className="w-3.5 h-3.5" /> <span>Add</span></>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
