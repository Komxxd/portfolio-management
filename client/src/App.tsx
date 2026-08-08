import React, { useState, useEffect } from 'react'
import { Plus, Briefcase, Search, Trash2, Pencil, ChevronDown, ChevronRight, ChevronUp, ArrowUpCircle, ArrowDownCircle, PanelLeftClose, PanelLeftOpen, Copy, FilterX, ArrowUpDown } from 'lucide-react'
import { supabase } from './supabaseClient'
import { CreatePortfolioModal } from './components/CreatePortfolioModal'
import { AddStockModal } from './components/AddStockModal'
import { SellStockModal } from './components/SellStockModal'
import { EditStockModal } from './components/EditStockModal'
import { EditSoldStockModal } from './components/EditSoldStockModal'
import { RenamePortfolioModal } from './components/RenamePortfolioModal'

interface Portfolio {
  id: string;
  name: string;
  created_at: string;
}

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

interface SoldStock {
  id: string;
  portfolio_id: string;
  symbol: string;
  quantity: number;
  exit_price: number;
  brokerage?: number;
  govt_tax?: number;
  exit_date: string;
}

function calculateXIRR(cashFlows: { amount: number, date: number }[], guess = 0.1): number {
  if (cashFlows.length < 2) return 0;
  
  const minDate = Math.min(...cashFlows.map(cf => cf.date));
  
  const maxIterations = 100;
  const tolerance = 1e-5;
  let rate = guess;
  
  for (let i = 0; i < maxIterations; i++) {
    let fValue = 0;
    let fDerivative = 0;
    
    for (const cf of cashFlows) {
      const days = (cf.date - minDate) / (1000 * 60 * 60 * 24);
      const years = days / 365;
      
      fValue += cf.amount / Math.pow(1 + rate, years);
      if (years > 0) {
        fDerivative -= (years * cf.amount) / Math.pow(1 + rate, years + 1);
      }
    }
    
    if (Math.abs(fValue) < tolerance) {
      return rate;
    }
    
    if (fDerivative === 0) break;
    
    const nextRate = rate - fValue / fDerivative;
    if (Math.abs(nextRate - rate) < tolerance) {
      return nextRate;
    }
    
    if (nextRate <= -1) {
      rate = -0.999999;
    } else {
      rate = nextRate;
    }
  }
  
  return rate;
}

function App() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [soldStocks, setSoldStocks] = useState<SoldStock[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [addStockPortfolioId, setAddStockPortfolioId] = useState<string | null>(null);
  const [sellStockPortfolioId, setSellStockPortfolioId] = useState<string | null>(null);
  const [editStockId, setEditStockId] = useState<string | null>(null);
  const [editSoldStockId, setEditSoldStockId] = useState<string | null>(null);
  const [renamePortfolioId, setRenamePortfolioId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'open' | 'closed'>('all');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('isSidebarOpen');
    return saved !== null ? saved === 'true' : true;
  });
  const [draggedPortfolioId, setDraggedPortfolioId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('isSidebarOpen', isSidebarOpen.toString());
  }, [isSidebarOpen]);


  // Real-time prices state
  const [livePrices, setLivePrices] = useState<Record<string, { price: number; name: string }>>({});
  const [pricesLoading, setPricesLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: portfoliosData, error: pError } = await supabase
        .from('portfolios')
        .select('*')
        .order('created_at', { ascending: true });

      if (pError) throw pError;
      
      const portfoliosDataArray = portfoliosData || [];
      const savedOrder = JSON.parse(localStorage.getItem('portfolioOrder') || '[]');
      
      if (savedOrder.length > 0) {
        portfoliosDataArray.sort((a, b) => {
          const idxA = savedOrder.indexOf(a.id);
          const idxB = savedOrder.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
      }
      
      setPortfolios(portfoliosDataArray);

      if (portfoliosDataArray.length > 0) {
        if (!activePortfolioId && !portfoliosDataArray.find(p => p.id === activePortfolioId)) {
          setActivePortfolioId(portfoliosDataArray[0].id);
        }

        const { data: stocksData, error: sError } = await supabase
          .from('stocks')
          .select('*');
        if (sError) throw sError;
        setStocks(stocksData || []);

        const { data: soldStocksData, error: ssError } = await supabase
          .from('sold_stocks')
          .select('*');
        if (ssError) throw ssError;
        setSoldStocks(soldStocksData || []);
      } else {
        setActivePortfolioId(null);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteStock = async (stockId: string) => {
    try {
      const { error } = await supabase
        .from('stocks')
        .delete()
        .eq('id', stockId);

      if (error) throw error;

      setStocks(prev => prev.filter(s => s.id !== stockId));
    } catch (err: any) {
      console.error('Error deleting stock:', err.message);
      alert('Failed to delete asset. Please try again.');
    }
  };

  const handleDeleteSoldStock = async (soldStockId: string) => {
    try {
      const { error } = await supabase
        .from('sold_stocks')
        .delete()
        .eq('id', soldStockId);

      if (error) throw error;

      setSoldStocks(prev => prev.filter(s => s.id !== soldStockId));
    } catch (err: any) {
      console.error('Error deleting sold stock:', err.message);
      alert('Failed to delete sold asset. Please try again.');
    }
  };

  const handleDeletePortfolio = async (id: string) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this portfolio? This action cannot be undone.');
    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from('portfolios')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (activePortfolioId === id) {
        setActivePortfolioId(portfolios.length > 1 ? portfolios.find(p => p.id !== id)?.id || null : null);
      }

      await fetchData();
    } catch (err: any) {
      console.error('Error deleting portfolio:', err.message);
      alert('Failed to delete portfolio. Please try again.');
    }
  };

  const handleCopyPortfolio = async (id: string, originalName: string) => {
    try {
      setLoading(true);
      const newName = `${originalName} (Copy)`;
      const { data: newPortfolio, error: pError } = await supabase
        .from('portfolios')
        .insert([{ name: newName }])
        .select()
        .single();
      
      if (pError) throw pError;

      const { data: originalStocks, error: sError } = await supabase
        .from('stocks')
        .select('symbol, quantity, entry_price, entry_date')
        .eq('portfolio_id', id);

      if (sError) throw sError;

      const { data: originalSoldStocks, error: ssError } = await supabase
        .from('sold_stocks')
        .select('symbol, quantity, exit_price, exit_date')
        .eq('portfolio_id', id);
        
      if (ssError) throw ssError;

      if (originalStocks && originalStocks.length > 0) {
        const stocksToInsert = originalStocks.map(s => ({ ...s, portfolio_id: newPortfolio.id }));
        const { error: insertStocksError } = await supabase.from('stocks').insert(stocksToInsert);
        if (insertStocksError) throw insertStocksError;
      }

      if (originalSoldStocks && originalSoldStocks.length > 0) {
        const soldStocksToInsert = originalSoldStocks.map(s => ({ ...s, portfolio_id: newPortfolio.id }));
        const { error: insertSoldStocksError } = await supabase.from('sold_stocks').insert(soldStocksToInsert);
        if (insertSoldStocksError) throw insertSoldStocksError;
      }

      await fetchData();
    } catch (err: any) {
      console.error('Error copying portfolio:', err.message);
      alert('Failed to copy portfolio. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId);
  const activeStocks = stocks.filter(s => s.portfolio_id === activePortfolioId);
  const activeSoldStocks = soldStocks.filter(s => s.portfolio_id === activePortfolioId);

  // Fetch live prices whenever active stocks change
  const activeStockSymbols = [...new Set(activeStocks.map(s => s.symbol))].sort().join(',');

  useEffect(() => {
    const fetchLivePrices = async (showLoading = false) => {
      if (!activeStockSymbols) {
        if (showLoading) setPricesLoading(false);
        return;
      }
      if (showLoading) setPricesLoading(true);
      try {
        const apiBase = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${apiBase}/api/prices?symbols=${activeStockSymbols}`);
        if (response.ok) {
          const prices = await response.json();
          setLivePrices(prev => ({ ...prev, ...prices }));
        }
      } catch (err) {
        console.error('Failed to fetch live prices', err);
      } finally {
        if (showLoading) setPricesLoading(false);
      }
    };

    // Initial fetch
    fetchLivePrices(true);

    // Poll every minute
    const intervalId = setInterval(() => {
      fetchLivePrices(false);
    }, 60000);

    return () => clearInterval(intervalId);
  }, [activeStockSymbols]);

  const toggleSymbol = (symbol: string) => {
    setExpandedSymbols(prev => {
      const next = new Set(prev);
      next.has(symbol) ? next.delete(symbol) : next.add(symbol);
      return next;
    });
  };

  // ── Group buys + sells by symbol ──────────────────────────────────────────
  const allSymbols = [...new Set([
    ...activeStocks.map(s => s.symbol),
    ...activeSoldStocks.map(s => s.symbol),
  ])].sort();

  const symbolGroups = allSymbols.map(symbol => {
    const buys = activeStocks.filter(s => s.symbol === symbol);
    const sells = activeSoldStocks.filter(s => s.symbol === symbol);

    const totalBoughtQty = buys.reduce((sum, b) => sum + Number(b.quantity), 0);
    const totalSoldQty = sells.reduce((sum, s) => sum + Number(s.quantity), 0);
    const netQty = totalBoughtQty - totalSoldQty;

    // ── FIFO matching logic ──────────────────────────────────────────────
    const sortedBuys = [...buys].sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());
    const sortedSells = [...sells].sort((a, b) => new Date(a.exit_date).getTime() - new Date(b.exit_date).getTime());

    const sellPool = sortedSells.map(s => ({
      sell: s,
      remainingSellQty: Number(s.quantity)
    }));

    const fifoBuyLots = sortedBuys.map(buy => {
      const buyQty = Number(buy.quantity);
      const entryPrice = Number(buy.entry_price);
      const cost = buyQty * entryPrice;

      let needed = buyQty;
      let soldQty = 0;
      let lotRealizedPnL = 0;
      const matchedSells: {
        sellId: string;
        exit_date: string;
        quantity: number;
        exit_price: number;
        proceeds: number;
        realizedPnL: number;
      }[] = [];

      for (const item of sellPool) {
        if (needed <= 0) break;
        if (item.remainingSellQty <= 0) continue;

        const takeQty = Math.min(needed, item.remainingSellQty);
        const exitPrice = Number(item.sell.exit_price);
        const proceeds = takeQty * exitPrice;
        const realPnL = takeQty * (exitPrice - entryPrice);

        matchedSells.push({
          sellId: item.sell.id,
          exit_date: item.sell.exit_date,
          quantity: takeQty,
          exit_price: exitPrice,
          proceeds,
          realizedPnL: realPnL
        });

        soldQty += takeQty;
        needed -= takeQty;
        lotRealizedPnL += realPnL;
        item.remainingSellQty -= takeQty;
      }

      const remainingQty = buyQty - soldQty;
      const status: 'OPEN' | 'PARTIALLY_SOLD' | 'CLOSED' =
        remainingQty === 0 ? 'CLOSED' : soldQty > 0 ? 'PARTIALLY_SOLD' : 'OPEN';

      const fallbackPrice = buys.length > 0 ? Number(buys[buys.length - 1].entry_price) : 0;
      const livePrice = livePrices[symbol]?.price !== undefined ? livePrices[symbol].price : fallbackPrice;
      const unrealizedPnL = remainingQty * (livePrice - entryPrice);
      const unrealizedPct = (remainingQty * entryPrice) > 0 ? (unrealizedPnL / (remainingQty * entryPrice)) * 100 : 0;

      return {
        buy,
        buyQty,
        entryPrice,
        cost,
        soldQty,
        remainingQty,
        status,
        matchedSells,
        realizedPnL: lotRealizedPnL,
        unrealizedPnL,
        unrealizedPct
      };
    });

    // Held cost basis = sum of cost of remaining open shares
    const netCostBasis = fifoBuyLots.reduce((sum, lot) => sum + (lot.remainingQty * lot.entryPrice), 0);
    // Avg buy price for currently held shares
    const avgBuyPrice = netQty > 0 ? netCostBasis / netQty : 0;

    const fallbackPrice = buys.length > 0 ? Number(buys[buys.length - 1].entry_price) : 0;
    const livePrice = livePrices[symbol]?.price !== undefined ? livePrices[symbol].price : (avgBuyPrice || fallbackPrice);
    const companyName = livePrices[symbol]?.name || '';

    const currentValue = netQty * livePrice;
    const unrealizedPnL = currentValue - netCostBasis;
    const unrealizedPct = netCostBasis > 0 ? (unrealizedPnL / netCostBasis) * 100 : 0;
    const fifoRealizedPnL = fifoBuyLots.reduce((sum, lot) => sum + lot.realizedPnL, 0);

    const totalBuyCost = buys.reduce((sum, b) => sum + Number(b.quantity) * Number(b.entry_price), 0);
    const totalBrokerage = buys.reduce((sum, b) => sum + Number(b.brokerage || 0), 0) + sells.reduce((sum, s) => sum + Number(s.brokerage || 0), 0);
    const totalGovtTax = buys.reduce((sum, b) => sum + Number(b.govt_tax || 0), 0) + sells.reduce((sum, s) => sum + Number(s.govt_tax || 0), 0);

    return {
      symbol,
      companyName,
      buys,
      sells,
      totalBoughtQty,
      totalSoldQty,
      netQty,
      avgBuyPrice,
      livePrice,
      netCostBasis,
      totalBuyCost,
      currentValue,
      unrealizedPnL,
      unrealizedPct,
      realizedPnL: fifoRealizedPnL,
      totalBrokerage,
      totalGovtTax,
      fifoBuyLots,
    };
  });

  let filteredSymbolGroups = symbolGroups;
  if (filterType === 'open') {
    filteredSymbolGroups = symbolGroups.filter(g => g.netQty > 0);
  } else if (filterType === 'closed') {
    filteredSymbolGroups = symbolGroups.filter(g => g.netQty === 0 && g.totalBoughtQty > 0);
  }

  let totalInvestment = 0;
  let totalCurrentValue = 0;
  let totalUnrealizedPnL = 0;
  let totalRealizedPnL = 0;

  const allTransactions: { date: number; amount: number }[] = [];

  filteredSymbolGroups.forEach(g => {
    totalInvestment += g.netCostBasis;
    totalCurrentValue += g.currentValue;
    totalUnrealizedPnL += g.unrealizedPnL;
    totalRealizedPnL += g.realizedPnL;
    
    g.buys.forEach(buy => {
      allTransactions.push({
        date: new Date(buy.entry_date).getTime(),
        amount: (Number(buy.quantity) * Number(buy.entry_price)) + Number(buy.brokerage || 0) + Number(buy.govt_tax || 0)
      });
    });
    g.sells.forEach(sell => {
      allTransactions.push({
        date: new Date(sell.exit_date).getTime(),
        amount: -((Number(sell.quantity) * Number(sell.exit_price)) - Number(sell.brokerage || 0) - Number(sell.govt_tax || 0))
      });
    });
  });

  allTransactions.sort((a, b) => a.date - b.date);
  let maxNetInvested = 0;
  let currentInvested = 0;
  allTransactions.forEach(tx => {
    currentInvested += tx.amount;
    if (currentInvested > maxNetInvested) {
      maxNetInvested = currentInvested;
    }
  });

  const xirrCashFlows = allTransactions.map(t => ({
    date: t.date,
    amount: -t.amount
  }));
  if (totalCurrentValue > 0 || xirrCashFlows.length > 0) {
    xirrCashFlows.push({
      date: Date.now(),
      amount: totalCurrentValue
    });
  }
  const portfolioXIRR = calculateXIRR(xirrCashFlows);

  if (sortField) {
    filteredSymbolGroups.sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a];
      let valB: any = b[sortField as keyof typeof b];

      if (sortField === 'totalPnL') {
        valA = a.unrealizedPnL + a.realizedPnL;
        valB = b.unrealizedPnL + b.realizedPnL;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortHeader = ({ field, label }: { field: string, label: string }) => (
    <th 
      className="px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500 cursor-pointer hover:bg-gray-100 transition-colors select-none group"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field ? (
          sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-zinc-900" /> : <ChevronDown className="w-3 h-3 text-zinc-900" />
        ) : (
          <ArrowUpDown className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
        )}
      </div>
    </th>
  );

  useEffect(() => {
    if (portfolios.length > 0) {
      localStorage.setItem('portfolioOrder', JSON.stringify(portfolios.map(p => p.id)));
    }
  }, [portfolios]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedPortfolioId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedPortfolioId || draggedPortfolioId === targetId) return;

    const sourceIdx = portfolios.findIndex(p => p.id === draggedPortfolioId);
    const targetIdx = portfolios.findIndex(p => p.id === targetId);

    if (sourceIdx === -1 || targetIdx === -1) return;

    const newPortfolios = [...portfolios];
    const [removed] = newPortfolios.splice(sourceIdx, 1);
    newPortfolios.splice(targetIdx, 0, removed);

    setPortfolios(newPortfolios);
    setDraggedPortfolioId(null);
  };

  const totalPnL = totalUnrealizedPnL + totalRealizedPnL;
  const totalPnLPercent = maxNetInvested > 0 ? (totalPnL / maxNetInvested) * 100 : 0;
  const unrealizedPnLPercent = totalInvestment > 0 ? (totalUnrealizedPnL / totalInvestment) * 100 : 0;

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${isSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 border-none'}`}>
        <div className="w-64 flex flex-col h-full">
          <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zinc-900 text-white rounded-md flex items-center justify-center font-bold">
                P
              </div>
              <h1 className="font-semibold text-sm">Portfolio</h1>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 -mr-1.5 text-gray-500 hover:text-zinc-900 rounded-md hover:bg-gray-100 transition-colors"
              title="Close Sidebar"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>

        <div className="px-4 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-shadow"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-4">
          <div>
            <div className="flex items-center justify-between px-3 mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Portfolios</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="text-gray-400 hover:text-zinc-900 transition-colors"
                title="Create Portfolio"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <nav className="space-y-0.5">
              {portfolios.map(portfolio => (
                <button
                  key={portfolio.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, portfolio.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, portfolio.id)}
                  onDragEnd={() => setDraggedPortfolioId(null)}
                  onClick={() => setActivePortfolioId(portfolio.id)}
                  className={`group w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors cursor-grab active:cursor-grabbing ${
                    draggedPortfolioId === portfolio.id ? 'opacity-50 border border-dashed border-gray-400' : ''
                  } ${
                    activePortfolioId === portfolio.id
                      ? 'bg-gray-100 text-zinc-900 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${activePortfolioId === portfolio.id ? 'bg-orange-500' : 'bg-gray-300'}`} />
                    <span className="truncate">{portfolio.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamePortfolioId(portfolio.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-100 hover:text-zinc-600 rounded text-gray-400 transition-all"
                      title="Rename Portfolio"
                    >
                      <Pencil className="w-3 h-3" />
                    </div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPortfolio(portfolio.id, portfolio.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 hover:text-blue-600 rounded text-gray-400 transition-all"
                      title="Copy Portfolio"
                    >
                      <Copy className="w-3 h-3" />
                    </div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePortfolio(portfolio.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 hover:text-red-600 rounded text-gray-400 transition-all"
                      title="Delete Portfolio"
                    >
                      <Trash2 className="w-3 h-3" />
                    </div>
                  </div>
                </button>
              ))}

              {portfolios.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">
                  No portfolios yet.
                </div>
              )}
            </nav>
          </div>
        </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 px-4 md:px-8 flex items-center justify-between shrink-0 transition-all">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 text-gray-500 hover:text-zinc-900 rounded-md hover:bg-gray-100 transition-colors"
                title="Open Sidebar"
              >
                <PanelLeftOpen className="w-5 h-5" />
              </button>
            )}
            <div className="flex flex-col justify-center">
              <h2 className="text-xl font-bold text-zinc-900 leading-tight">
                {activePortfolio ? activePortfolio.name : 'Portfolios'}
              </h2>
              {activePortfolio && (
                <span className="text-[10px] text-gray-400 font-medium tracking-wide leading-tight">
                  Prices auto-update every minute
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-2 md:p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-zinc-900 rounded-full animate-spin" />
            </div>
          ) : !activePortfolio ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-6">
                <Briefcase className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">No Portfolio Selected</h3>
              <p className="text-sm text-gray-500 mb-8">
                Select a portfolio from the sidebar or create a new one to start tracking your assets.
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-6 py-2.5 rounded-lg transition-colors shadow-sm"
              >
                Create New Portfolio
              </button>
            </div>
          ) : (
            <div className="w-full">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Total Stocks</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900">{filteredSymbolGroups.length}</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Max Investment</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 truncate" title={`₹${maxNetInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    ₹{maxNetInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Current Value</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 truncate" title={`₹${totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    ₹{totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Unrealized PnL</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`₹${totalUnrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    {totalUnrealizedPnL >= 0 ? '+' : ''}₹{totalUnrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-[9px] font-medium ml-1 text-gray-500">
                      ({unrealizedPnLPercent >= 0 ? '+' : ''}{unrealizedPnLPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Realized PnL</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${totalRealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`₹${totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    {totalRealizedPnL >= 0 ? '+' : ''}₹{totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Total PnL</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`₹${totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-[9px] font-medium ml-1 text-gray-500">
                      ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>XIRR</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${portfolioXIRR >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`${(portfolioXIRR * 100).toFixed(2)}%`}>
                    {portfolioXIRR >= 0 ? '+' : ''}{(portfolioXIRR * 100).toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
                <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center bg-white">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base text-zinc-900">Assets</h3>
                      {pricesLoading && (
                        <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-zinc-900 rounded-full animate-spin" title="Updating live prices..." />
                      )}
                    </div>
                    <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                      {(['open', 'closed', 'all'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setFilterType(type)}
                          className={`px-3 py-1 text-[11px] font-medium rounded-md capitalize transition-colors ${
                            filterType === type ? 'bg-white text-zinc-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    {(filterType !== 'all' || sortField !== null) && (
                      <button
                        onClick={() => {
                          setFilterType('all');
                          setSortField(null);
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-md shadow-sm text-[11px] font-medium text-gray-600 hover:text-zinc-900 transition-colors"
                      >
                        <FilterX className="w-3 h-3" />
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setAddStockPortfolioId(activePortfolio.id)}
                      className="text-xs font-medium text-gray-600 hover:text-zinc-900 transition-colors"
                    >
                      + Buy New Asset
                    </button>
                    <button
                      onClick={() => setSellStockPortfolioId(activePortfolio.id)}
                      className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                    >
                      − Sell New Asset
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-gray-500 w-6"></th>
                        <SortHeader field="symbol" label="Symbol" />
                        <SortHeader field="netQty" label="Net Qty" />
                        <SortHeader field="avgBuyPrice" label="Avg Buy" />
                        <SortHeader field="netCostBasis" label="Invested" />
                        <SortHeader field="livePrice" label="Live Price" />
                        <SortHeader field="currentValue" label="Current Value" />
                        <SortHeader field="totalBrokerage" label="Brokerage" />
                        <SortHeader field="totalGovtTax" label="Govt Tax" />
                        <SortHeader field="unrealizedPnL" label="Unrealized PnL" />
                        <SortHeader field="realizedPnL" label="Realized PnL" />
                        <SortHeader field="totalPnL" label="Total PnL" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSymbolGroups.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="px-3 py-6 text-center text-gray-500 text-[11px]">
                            No assets found matching the filter.
                          </td>
                        </tr>
                      ) : (
                        filteredSymbolGroups.map(group => {
                          const isExpanded = expandedSymbols.has(group.symbol);
                          const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                          return (
                            <React.Fragment key={group.symbol}>
                              {/* ── Summary row ── */}
                              <tr
                                onClick={() => toggleSymbol(group.symbol)}
                                className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors group"
                              >
                                <td className="pl-2 pr-1 py-1.5">
                                  <span className="text-gray-400 group-hover:text-zinc-700 transition-colors">
                                    {isExpanded
                                      ? <ChevronDown className="w-3 h-3" />
                                      : <ChevronRight className="w-3 h-3" />}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-5 h-5 rounded border border-gray-200 bg-white flex items-center justify-center font-bold text-[9px] text-gray-600">
                                      {group.symbol.charAt(0)}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-[11px] text-zinc-900 flex items-center gap-1.5">
                                        <span>{group.symbol}</span>
                                        {group.companyName && (
                                          <span className="font-normal text-[10px] text-gray-500 truncate max-w-[120px]" title={group.companyName}>
                                            {group.companyName}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[9px] text-gray-400 mt-0.5">
                                        {group.totalBoughtQty.toLocaleString()} bought
                                        {group.totalSoldQty > 0 && <> · <span className="text-red-400">{group.totalSoldQty.toLocaleString()} sold</span></>}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 text-[11px] font-semibold text-zinc-900">{group.netQty.toLocaleString()}</td>
                                <td className="px-2 py-1.5 text-[11px] text-gray-600">₹{fmt(group.avgBuyPrice)}</td>
                                <td className="px-2 py-1.5 text-[11px] text-gray-600" title="Avg buy price × remaining shares — money still at work">₹{fmt(group.netCostBasis)}</td>
                                <td className="px-2 py-1.5 text-[11px] font-medium text-zinc-900">₹{fmt(group.livePrice)}</td>
                                <td className="px-2 py-1.5 text-[11px] font-medium text-zinc-900">₹{fmt(group.currentValue)}</td>
                                <td className="px-2 py-1.5 text-[11px] text-gray-600">₹{fmt(group.totalBrokerage)}</td>
                                <td className="px-2 py-1.5 text-[11px] text-gray-600">₹{fmt(group.totalGovtTax)}</td>
                                <td className="px-2 py-1.5 text-[11px]">
                                  <span className={`font-medium ${group.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {group.unrealizedPnL >= 0 ? '+' : ''}₹{fmt(group.unrealizedPnL)}
                                  </span>
                                  <span className="text-[9px] ml-1 text-gray-400">({group.unrealizedPct >= 0 ? '+' : ''}{group.unrealizedPct.toFixed(2)}%)</span>
                                </td>
                                <td className="px-2 py-1.5 text-[11px]">
                                  {group.sells.length > 0 ? (
                                    <span className={`font-medium ${group.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {group.realizedPnL >= 0 ? '+' : ''}₹{fmt(group.realizedPnL)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-[11px]">
                                  {(() => {
                                    const total = group.unrealizedPnL + group.realizedPnL;
                                    const totalPct = group.totalBuyCost > 0 ? (total / group.totalBuyCost) * 100 : 0;
                                    return (
                                      <>
                                        <span className={`font-medium ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {total >= 0 ? '+' : ''}₹{fmt(total)}
                                        </span>
                                        <span className="text-[9px] ml-1 text-gray-400">({totalPct >= 0 ? '+' : ''}{totalPct.toFixed(2)}%)</span>
                                      </>
                                    );
                                  })()}
                                </td>
                              </tr>

                              {/* ── Expanded detail side-by-side FIFO section ── */}
                              {isExpanded && (
                                <tr className="border-t border-b border-gray-200 bg-gray-50/70">
                                  <td colSpan={12} className="p-2">
                                    <div className="space-y-2">
                                      {group.fifoBuyLots.length === 0 ? (
                                        <p className="text-[11px] text-gray-400 py-2 text-center">No buy entries found.</p>
                                      ) : (
                                        group.fifoBuyLots.map((lot, lotIdx) => (
                                          <div key={`lot-${lot.buy.id}`} className="bg-white border border-gray-200 rounded-lg p-2 shadow-xs">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                              {/* Left Column: BUY Lot Details */}
                                              <div className="pr-0 md:pr-2 border-b md:border-b-0 md:border-r border-gray-100 pb-2 md:pb-0">
                                                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-100">
                                                  <div className="flex items-center gap-1.5 font-semibold text-xs text-green-800">
                                                    <ArrowUpCircle className="w-4 h-4 text-green-600" />
                                                    <span>Buy Position{group.fifoBuyLots.length > 1 ? ` #${lotIdx + 1}` : ''}</span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${lot.status === 'CLOSED'
                                                        ? 'bg-gray-100 text-gray-600'
                                                        : lot.status === 'PARTIALLY_SOLD'
                                                          ? 'bg-amber-100 text-amber-700'
                                                          : 'bg-green-100 text-green-700'
                                                      }`}>
                                                      {lot.status === 'CLOSED'
                                                        ? `CLOSED (${lot.buyQty}/${lot.buyQty} sold)`
                                                        : lot.status === 'PARTIALLY_SOLD'
                                                          ? `PARTIAL (${lot.soldQty}/${lot.buyQty} sold)`
                                                          : `OPEN (${lot.remainingQty} held)`}
                                                    </span>
                                                  </div>
                                                </div>

                                                <table className="w-full text-left text-[11px] whitespace-nowrap">
                                                  <thead>
                                                    <tr className="text-[9px] text-gray-400 uppercase border-b border-gray-100">
                                                      <th className="pb-1 font-medium">Type</th>
                                                      <th className="pb-1 font-medium">Date</th>
                                                      <th className="pb-1 font-medium">Qty</th>
                                                      <th className="pb-1 font-medium">Price</th>
                                                      <th className="pb-1 font-medium">Value</th>
                                                      <th className="pb-1 font-medium">Unrealized PnL</th>
                                                      <th className="pb-1 text-right font-medium">Actions</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    <tr>
                                                      <td className="py-1">
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-100 text-green-700">BUY</span>
                                                      </td>
                                                      <td className="py-1 text-gray-500">{new Date(lot.buy.entry_date).toLocaleDateString()}</td>
                                                      <td className="py-1 font-medium text-gray-800">{lot.buyQty.toLocaleString()}</td>
                                                      <td className="py-1 text-gray-600">₹{fmt(lot.entryPrice)}</td>
                                                      <td className="py-1 text-gray-600 font-medium">₹{fmt(lot.cost)}</td>
                                                      <td className="py-1 font-medium">
                                                        <span className={lot.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                          {lot.unrealizedPnL >= 0 ? '+' : ''}₹{fmt(lot.unrealizedPnL)}
                                                        </span>
                                                        <span className="text-[9px] ml-1 text-gray-400">({lot.unrealizedPct >= 0 ? '+' : ''}{lot.unrealizedPct.toFixed(2)}%)</span>
                                                      </td>
                                                      <td className="py-1 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                          <button onClick={(e) => { e.stopPropagation(); setEditStockId(lot.buy.id); }} className="p-1 text-gray-500 hover:text-zinc-900 rounded hover:bg-gray-100 transition-colors" title="Edit Buy">
                                                            <Pencil className="w-3.5 h-3.5" />
                                                          </button>
                                                          <button onClick={(e) => { e.stopPropagation(); handleDeleteStock(lot.buy.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title="Delete Buy">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                          </button>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  </tbody>
                                                </table>
                                              </div>

                                              {/* Right Column: Sell Positions */}
                                              <div>
                                                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-100">
                                                  <div className="flex items-center gap-1.5 font-semibold text-[11px] text-red-800">
                                                    <ArrowDownCircle className="w-4 h-4 text-red-600" />
                                                    <span>Sell Positions</span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-gray-500 font-medium">
                                                      {lot.soldQty.toLocaleString()} / {lot.buyQty.toLocaleString()} sold
                                                    </span>
                                                    {lot.matchedSells.length > 0 && (
                                                      <span className={`text-[10px] font-semibold ${lot.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        (Realized: {lot.realizedPnL >= 0 ? '+' : ''}₹{fmt(lot.realizedPnL)})
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>

                                                {lot.matchedSells.length === 0 ? (
                                                  <p className="text-[11px] text-gray-400 py-2 text-center">No sell entries recorded yet.</p>
                                                ) : (
                                                  <table className="w-full text-left text-[11px] whitespace-nowrap">
                                                    <thead>
                                                      <tr className="text-[9px] text-gray-400 uppercase border-b border-gray-100">
                                                        <th className="pb-1 font-medium">Type</th>
                                                        <th className="pb-1 font-medium">Date</th>
                                                        <th className="pb-1 font-medium">Qty</th>
                                                        <th className="pb-1 font-medium">Price</th>
                                                        <th className="pb-1 font-medium">Value</th>
                                                        <th className="pb-1 font-medium">Realized PnL</th>
                                                        <th className="pb-1 text-right font-medium">Actions</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                      {lot.matchedSells.map(sellAlloc => {
                                                        const realPnlPct = lot.entryPrice > 0 ? ((sellAlloc.exit_price - lot.entryPrice) / lot.entryPrice) * 100 : 0;
                                                        return (
                                                          <tr key={`alloc-${sellAlloc.sellId}`} className="hover:bg-red-50/40 transition-colors">
                                                            <td className="py-1">
                                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700">SELL</span>
                                                            </td>
                                                            <td className="py-1 text-gray-500">{new Date(sellAlloc.exit_date).toLocaleDateString()}</td>
                                                            <td className="py-1 font-medium text-gray-800">{sellAlloc.quantity.toLocaleString()}</td>
                                                            <td className="py-1 text-gray-600">₹{fmt(sellAlloc.exit_price)}</td>
                                                            <td className="py-1 text-gray-600 font-medium">₹{fmt(sellAlloc.proceeds)}</td>
                                                            <td className="py-1 font-medium">
                                                              <span className={sellAlloc.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                                {sellAlloc.realizedPnL >= 0 ? '+' : ''}₹{fmt(sellAlloc.realizedPnL)}
                                                              </span>
                                                              <span className="text-[9px] ml-1 text-gray-400">({realPnlPct >= 0 ? '+' : ''}{realPnlPct.toFixed(2)}%)</span>
                                                            </td>
                                                            <td className="py-1 text-right">
                                                              <div className="flex items-center justify-end gap-1">
                                                                <button onClick={(e) => { e.stopPropagation(); setEditSoldStockId(sellAlloc.sellId); }} className="p-1 text-gray-500 hover:text-zinc-900 rounded hover:bg-gray-100 transition-colors" title="Edit Sell">
                                                                  <Pencil className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteSoldStock(sellAlloc.sellId); }} className="p-1 text-gray-500 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title="Delete Sell">
                                                                  <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                              </div>
                                                            </td>
                                                          </tr>
                                                        );
                                                      })}
                                                    </tbody>
                                                  </table>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {symbolGroups.length > 0 && (
                  <div className="px-4 py-2 border-t border-gray-200 bg-gray-50/50 text-[11px] text-gray-500 flex justify-between items-center">
                    <span>{symbolGroups.length} symbol{symbolGroups.length !== 1 ? 's' : ''} · click a row to expand transactions</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <CreatePortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={fetchData}
      />

      <AddStockModal
        isOpen={!!addStockPortfolioId}
        portfolioId={addStockPortfolioId}
        onClose={() => setAddStockPortfolioId(null)}
        onAdded={fetchData}
      />

      <SellStockModal
        isOpen={!!sellStockPortfolioId}
        portfolioId={sellStockPortfolioId}
        onClose={() => setSellStockPortfolioId(null)}
        onAdded={fetchData}
      />

      <EditStockModal
        isOpen={!!editStockId}
        stock={stocks.find(s => s.id === editStockId) || null}
        onClose={() => setEditStockId(null)}
        onEdited={fetchData}
      />

      <EditSoldStockModal
        isOpen={!!editSoldStockId}
        soldStock={soldStocks.find(s => s.id === editSoldStockId) || null}
        onClose={() => setEditSoldStockId(null)}
        onEdited={fetchData}
      />

      <RenamePortfolioModal
        isOpen={!!renamePortfolioId}
        onClose={() => setRenamePortfolioId(null)}
        onRenamed={fetchData}
        portfolioId={renamePortfolioId}
        currentName={portfolios.find(p => p.id === renamePortfolioId)?.name || ''}
      />
    </div>
  )
}

export default App
