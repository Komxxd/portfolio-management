import { useState, useEffect } from 'react'
import { Plus, Briefcase, Search, Trash2, Pencil } from 'lucide-react'
import { supabase } from './supabaseClient'
import { CreatePortfolioModal } from './components/CreatePortfolioModal'
import { AddStockModal } from './components/AddStockModal'
import { EditStockModal } from './components/EditStockModal'

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
  entry_date: string;
}

function App() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [addStockPortfolioId, setAddStockPortfolioId] = useState<string | null>(null);
  const [editStockId, setEditStockId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Real-time prices state
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: portfoliosData, error: pError } = await supabase
        .from('portfolios')
        .select('*')
        .order('created_at', { ascending: true });
        
      if (pError) throw pError;
      setPortfolios(portfoliosData || []);

      if (portfoliosData && portfoliosData.length > 0) {
        if (!activePortfolioId && !portfoliosData.find(p => p.id === activePortfolioId)) {
           setActivePortfolioId(portfoliosData[0].id);
        }

        const { data: stocksData, error: sError } = await supabase
          .from('stocks')
          .select('*');
        if (sError) throw sError;
        setStocks(stocksData || []);
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
        setActivePortfolioId(null);
      }
      fetchData();
    } catch (err: any) {
      console.error('Error deleting portfolio:', err.message);
      alert('Failed to delete portfolio. Please try again.');
    }
  };

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId);
  const activeStocks = stocks.filter(s => s.portfolio_id === activePortfolioId);

  // Fetch live prices whenever active stocks change
  const activeStockSymbols = [...new Set(activeStocks.map(s => s.symbol))].sort().join(',');

  useEffect(() => {
    const fetchLivePrices = async () => {
      if (!activeStockSymbols) {
        setPricesLoading(false);
        return;
      }
      
      setPricesLoading(true);
      try {
        const response = await fetch(`http://localhost:5001/api/prices?symbols=${activeStockSymbols}`);
        if (response.ok) {
          const prices = await response.json();
          setLivePrices(prev => ({ ...prev, ...prices }));
        }
      } catch (err) {
        console.error('Failed to fetch live prices', err);
      } finally {
        setPricesLoading(false);
      }
    };
    
    fetchLivePrices();
  }, [activeStockSymbols]);

  // Calculate portfolio stats
  let totalInvestment = 0;
  let totalCurrentValue = 0;

  const stockRows = activeStocks.map(stock => {
    const qty = Number(stock.quantity);
    const entryPrice = Number(stock.entry_price);
    
    // Use real live price if fetched, otherwise fallback to entry price while loading
    const livePrice = livePrices[stock.symbol] !== undefined ? livePrices[stock.symbol] : entryPrice;
    
    const investment = qty * entryPrice;
    const currentValue = qty * livePrice;
    const pnl = currentValue - investment;
    const pnlPercent = entryPrice > 0 ? (pnl / investment) * 100 : 0;

    totalInvestment += investment;
    totalCurrentValue += currentValue;

    return {
      ...stock,
      livePrice,
      investment,
      currentValue,
      pnl,
      pnlPercent
    };
  });

  const totalPnL = totalCurrentValue - totalInvestment;
  const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
  
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="h-16 px-4 flex items-center gap-3 border-b border-gray-200 shrink-0">
          <div className="w-8 h-8 bg-zinc-900 text-white rounded-md flex items-center justify-center font-bold">
            P
          </div>
          <div>
            <h1 className="font-semibold text-sm">Portfolio</h1>
          </div>
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
                  onClick={() => setActivePortfolioId(portfolio.id)}
                  className={`group w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                    activePortfolioId === portfolio.id 
                      ? 'bg-gray-100 text-zinc-900 font-medium' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${activePortfolioId === portfolio.id ? 'bg-orange-500' : 'bg-gray-300'}`} />
                    <span className="truncate">{portfolio.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-zinc-900">
              {activePortfolio ? activePortfolio.name : 'Portfolios'}
            </h2>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
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
            <div className="max-w-6xl mx-auto">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
                    <span>Total Stocks</span>
                  </div>
                  <div className="text-xl font-bold text-zinc-900">{activeStocks.length}</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
                    <span>Total Investment</span>
                  </div>
                  <div className="text-xl font-bold text-zinc-900">
                    ₹{totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
                    <span>Current Value</span>
                  </div>
                  <div className="text-xl font-bold text-zinc-900">
                    ₹{totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
                    <span>Total PnL</span>
                  </div>
                  <div className={`text-xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-xs font-medium ml-2 bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                      {totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-white">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-sm text-zinc-900">Assets</h3>
                    {pricesLoading && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <div className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                        Live sync...
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={() => setAddStockPortfolioId(activePortfolio.id)}
                    className="text-xs font-medium text-gray-600 hover:text-zinc-900"
                  >
                    + Add New Asset
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/50">
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500">Stock</th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500">Entry Date</th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500">Qty</th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500">Entry Price</th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500">Entry Value</th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500">Live Price</th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500">Current Value</th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500">PnL</th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-gray-500 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stockRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-gray-500 text-xs">
                            No assets found in this portfolio. Add a stock to get started.
                          </td>
                        </tr>
                      ) : (
                        stockRows.map((stock) => (
                          <tr key={stock.id} className="hover:bg-gray-50 transition-colors group">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded border border-gray-200 bg-white flex items-center justify-center font-bold text-[10px] text-gray-600">
                                  {stock.symbol.charAt(0)}
                                </div>
                                <span className="font-medium text-sm text-zinc-900">{stock.symbol}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-600">
                              {new Date(stock.entry_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-600">
                              {Number(stock.quantity).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-600">
                              ₹{Number(stock.entry_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-600">
                              ₹{stock.investment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2 text-xs font-medium text-zinc-900">
                              ₹{stock.livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2 text-xs font-medium text-zinc-900">
                              ₹{stock.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2 text-xs">
                              <span className={`font-medium ${stock.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {stock.pnl >= 0 ? '+' : ''}₹{stock.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] ml-1 text-gray-500">
                                ({stock.pnlPercent >= 0 ? '+' : ''}{stock.pnlPercent.toFixed(2)}%)
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => setEditStockId(stock.id)}
                                  className="p-1.5 text-gray-400 hover:text-zinc-900 transition-colors rounded hover:bg-gray-100" 
                                  title="Edit Asset"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteStock(stock.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50" 
                                  title="Delete Asset"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                {stockRows.length > 0 && (
                  <div className="px-4 py-2 border-t border-gray-200 bg-gray-50/50 text-[11px] text-gray-500 flex justify-between items-center">
                    <span>Showing {stockRows.length} assets</span>
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

      <EditStockModal
        isOpen={!!editStockId}
        stock={stocks.find(s => s.id === editStockId) || null}
        onClose={() => setEditStockId(null)}
        onEdited={fetchData}
      />
    </div>
  )
}

export default App
