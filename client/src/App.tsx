import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Briefcase, Trash2, Pencil, ChevronDown, ChevronRight, ChevronUp, ArrowUpCircle, ArrowDownCircle, PanelLeftClose, PanelLeftOpen, Copy, FilterX, ArrowUpDown, Columns, Check, GripVertical, Info, User, LogOut, PieChart, Folder, Download, Upload, Home, LayoutDashboard, RefreshCw } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { Auth } from './components/Auth'
import { CreatePortfolioModal } from './components/CreatePortfolioModal'
import { AddStockModal } from './components/AddStockModal'
import { SellStockModal } from './components/SellStockModal'
import { EditStockModal } from './components/EditStockModal'
import { EditSoldStockModal } from './components/EditSoldStockModal'
import { RenamePortfolioModal } from './components/RenamePortfolioModal'
import { CorporateActionModal } from './components/CorporateActionModal'
import { CorporateActionsViewerModal } from './components/CorporateActionsViewerModal'
import { AssetSearch } from './components/AssetSearch'
import { PortfolioInfoModal } from './components/PortfolioInfoModal'
import { RebalanceModal } from './components/RebalanceModal'
import { ConfirmationModal } from './components/ConfirmationModal'
import { RecycleBinModal } from './components/RecycleBinModal'

const ALL_COLUMNS = [
  { id: 'symbol', label: 'Symbol' },
  { id: 'netQty', label: 'Net Qty' },
  { id: 'avgBuyPrice', label: 'Avg Buy' },
  { id: 'netCostBasis', label: 'Invested' },
  { id: 'livePrice', label: 'Live Price' },
  { id: 'currentValue', label: 'Current Value' },
  { id: 'unrealizedPnL', label: 'Unrealized PnL' },
  { id: 'unrealizedPnLPct', label: 'Unrealized %' },
  { id: 'realizedPnL', label: 'Realized PnL' },
  { id: 'realizedPnLPct', label: 'Realized %' },
  { id: 'totalDividend', label: 'Dividend' },
  { id: 'brokerage', label: 'Brokerage' },
  { id: 'govtTax', label: 'Govt Tax' },
  { id: 'totalPnL', label: 'Total PnL' },
  { id: 'totalPnLPct', label: 'Total PnL %' },
  { id: 'xirr', label: 'XIRR' },
  { id: 'portfolioWeight', label: '% Invested' },
  { id: 'currentValueWeight', label: '% Current Value' },
  { id: 'priceChange', label: 'Change' },
  { id: 'changePercent', label: 'Change %' },
  { id: 'dayHigh', label: 'Day High' },
  { id: 'dayLow', label: 'Day Low' },
  { id: '52wkHigh', label: '52W High' },
  { id: '52wkLow', label: '52W Low' },
  { id: 'marketCap', label: 'Mkt Cap' },
  { id: 'volume', label: 'Volume' },
  { id: 'avgVolume', label: 'Avg Volume (3M)' },
  { id: 'tradeValue', label: 'Trade Value' },
  { id: 'dayGain', label: 'Day Gain' },
  { id: 'dayGainPct', label: 'Day Gain %' }
];

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
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [soldStocks, setSoldStocks] = useState<SoldStock[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<'home' | 'portfolio'>('portfolio');
  const [isPortfolioInfoModalOpen, setIsPortfolioInfoModalOpen] = useState(false);
  const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [addStockPortfolioId, setAddStockPortfolioId] = useState<string | null>(null);
  const [addStockInitialSymbol, setAddStockInitialSymbol] = useState<string>('');
  const [addStockInitialPrice, setAddStockInitialPrice] = useState<number | undefined>(undefined);
  const [sellStockPortfolioId, setSellStockPortfolioId] = useState<string | null>(null);
  const [sellStockInitialSymbol, setSellStockInitialSymbol] = useState<string>('');
  const [sellStockInitialPrice, setSellStockInitialPrice] = useState<number | undefined>(undefined);
  const [editStockId, setEditStockId] = useState<string | null>(null);
  const [editSoldStockId, setEditSoldStockId] = useState<string | null>(null);
  const [renamePortfolioId, setRenamePortfolioId] = useState<string | null>(null);
  const [corporateActionType, setCorporateActionType] = useState<'bonus' | 'split' | 'dividend' | null>(null);
  const [viewCorporateActionsSymbol, setViewCorporateActionsSymbol] = useState<string | null>(null);
  const [portfolioFilters, setPortfolioFilters] = useState<Record<string, { filterType: 'open' | 'closed' | 'all'; searchSelectedSymbols: string[]; sortField: string | null; sortDirection: 'asc' | 'desc' }>>({});

  const currentFilters = activePortfolioId && portfolioFilters[activePortfolioId] 
    ? portfolioFilters[activePortfolioId] 
    : { filterType: 'open' as const, searchSelectedSymbols: [] as string[], sortField: null as string | null, sortDirection: 'desc' as const };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filterType = currentFilters.filterType;
  const searchSelectedSymbols = currentFilters.searchSelectedSymbols;
  const sortField = currentFilters.sortField;
  const sortDirection = currentFilters.sortDirection;

  const setFilterType = (val: 'open' | 'closed' | 'all') => {
    if (!activePortfolioId) return;
    setPortfolioFilters(prev => ({ ...prev, [activePortfolioId]: { ...(prev[activePortfolioId] || { filterType: 'open', searchSelectedSymbols: [], sortField: null, sortDirection: 'desc' }), filterType: val } }));
  };

  const setSearchSelectedSymbols = (val: string[] | ((prev: string[]) => string[])) => {
    if (!activePortfolioId) return;
    setPortfolioFilters(prev => {
      const current = prev[activePortfolioId] || { filterType: 'open', searchSelectedSymbols: [], sortField: null, sortDirection: 'desc' };
      const nextVal = typeof val === 'function' ? val(current.searchSelectedSymbols) : val;
      return { ...prev, [activePortfolioId]: { ...current, searchSelectedSymbols: nextVal } };
    });
  };

  const setSortField = (val: string | null | ((prev: string | null) => string | null)) => {
    if (!activePortfolioId) return;
    setPortfolioFilters(prev => {
      const current = prev[activePortfolioId] || { filterType: 'open', searchSelectedSymbols: [], sortField: null, sortDirection: 'desc' };
      const nextVal = typeof val === 'function' ? val(current.sortField) : val;
      return { ...prev, [activePortfolioId]: { ...current, sortField: nextVal } };
    });
  };

  const setSortDirection = (val: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) => {
    if (!activePortfolioId) return;
    setPortfolioFilters(prev => {
      const current = prev[activePortfolioId] || { filterType: 'open', searchSelectedSymbols: [], sortField: null, sortDirection: 'desc' };
      const nextVal = typeof val === 'function' ? val(current.sortDirection) : val;
      return { ...prev, [activePortfolioId]: { ...current, sortDirection: nextVal } };
    });
  };

  const [loading, setLoading] = useState(true);

  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());

  type SidebarMode = 'expanded' | 'collapsed' | 'hover';
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    const saved = localStorage.getItem('sidebarMode') as SidebarMode;
    return saved || 'hover';
  });
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarTemporarilyExpanded, setIsSidebarTemporarilyExpanded] = useState(false);
  const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);
  const sidebarMenuRef = useRef<HTMLDivElement>(null);

  const isActuallyExpanded = sidebarMode === 'expanded' || (sidebarMode === 'hover' && isSidebarHovered) || isSidebarTemporarilyExpanded;

  const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
  const [isRecycleBinModalOpen, setIsRecycleBinModalOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [confirmationConfig, setConfirmationConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    isDestructive?: boolean;
    requireInputToConfirm?: string;
  } | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
      if (sidebarMenuRef.current && !sidebarMenuRef.current.contains(event.target as Node)) {
        setIsSidebarMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebarMode', sidebarMode);
  }, [sidebarMode]);
  
  const [portfolioVisibleColumns, setPortfolioVisibleColumns] = useState<Record<string, Set<string>>>(() => {
    const saved = localStorage.getItem('portfolioVisibleColumns');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const result: Record<string, Set<string>> = {};
        for (const key in parsed) {
          result[key] = new Set(parsed[key]);
        }
        return result;
      } catch (e) {}
    }
    return {};
  });

  const [portfolioColumnOrder, setPortfolioColumnOrder] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('portfolioColumnOrder');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  });

  const [portfolioColumnWidths, setPortfolioColumnWidths] = useState<Record<string, Record<string, number>>>(() => {
    const saved = localStorage.getItem('portfolioColumnWidths');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return {};
  });

  const [resizingCol, setResizingCol] = useState<{ id: string, startX: number, startWidth: number } | null>(null);

  useEffect(() => {
    if (!resizingCol || !activePortfolioId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingCol.startX;
      const newWidth = Math.max(50, resizingCol.startWidth + deltaX);
      setPortfolioColumnWidths(prev => ({
        ...prev,
        [activePortfolioId]: {
          ...(prev[activePortfolioId] || {}),
          [resizingCol.id]: newWidth
        }
      }));
    };

    const handleMouseUp = () => {
      setResizingCol(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, activePortfolioId]);

  useEffect(() => {
    localStorage.setItem('portfolioColumnWidths', JSON.stringify(portfolioColumnWidths));
  }, [portfolioColumnWidths]);

  const [draggedColId, setDraggedColId] = useState<string | null>(null);

  useEffect(() => {
    const toSave: Record<string, string[]> = {};
    for (const key in portfolioVisibleColumns) {
      toSave[key] = Array.from(portfolioVisibleColumns[key]);
    }
    localStorage.setItem('portfolioVisibleColumns', JSON.stringify(toSave));
  }, [portfolioVisibleColumns]);

  useEffect(() => {
    localStorage.setItem('portfolioColumnOrder', JSON.stringify(portfolioColumnOrder));
  }, [portfolioColumnOrder]);

  const visibleColumns = (() => {
    let cols = (activePortfolioId && portfolioVisibleColumns[activePortfolioId]) 
      ? new Set(portfolioVisibleColumns[activePortfolioId]) 
      : new Set(ALL_COLUMNS.map(c => c.id));
    
    // Auto-enable new columns if they are not explicitly disabled
    const saved = localStorage.getItem('portfolioVisibleColumns');
    if (activePortfolioId && saved && portfolioVisibleColumns[activePortfolioId]) {

      const isMissingInvested = !portfolioVisibleColumns[activePortfolioId].has('portfolioWeight') && 
        !(JSON.parse(saved)[activePortfolioId] || []).includes('portfolioWeight');
      const isMissingCV = !portfolioVisibleColumns[activePortfolioId].has('currentValueWeight') && 
        !(JSON.parse(saved)[activePortfolioId] || []).includes('currentValueWeight');
        
      if (isMissingInvested || isMissingCV) {
        if (isMissingInvested) cols.add('portfolioWeight');
        if (isMissingCV) cols.add('currentValueWeight');
        setPortfolioVisibleColumns(prev => ({
          ...prev,
          [activePortfolioId]: cols
        }));
        
        setPortfolioColumnOrder(prev => {
          const currentOrder = prev[activePortfolioId] || ALL_COLUMNS.map(c => c.id);
          const newOrder = [...currentOrder];
          if (isMissingInvested && !newOrder.includes('portfolioWeight')) newOrder.push('portfolioWeight');
          if (isMissingCV && !newOrder.includes('currentValueWeight')) newOrder.push('currentValueWeight');
          return { ...prev, [activePortfolioId]: newOrder };
        });
      }
    }
    return cols;
  })();

  const activeColumnOrder = (() => {
    let order = (activePortfolioId && portfolioColumnOrder[activePortfolioId])
      ? [...portfolioColumnOrder[activePortfolioId]]
      : ALL_COLUMNS.map(c => c.id);
    
    const missingCols = ALL_COLUMNS.map(c => c.id).filter(id => !order.includes(id));
    if (missingCols.length > 0) {
      missingCols.forEach(missingCol => {
        let inserted = false;
        if (missingCol === 'unrealizedPnLPct') {
          const idx = order.indexOf('unrealizedPnL');
          if (idx !== -1) { order.splice(idx + 1, 0, missingCol); inserted = true; }
        } else if (missingCol === 'realizedPnLPct') {
          const idx = order.indexOf('realizedPnL');
          if (idx !== -1) { order.splice(idx + 1, 0, missingCol); inserted = true; }
        } else if (missingCol === 'totalPnLPct') {
          const idx = order.indexOf('totalPnL');
          if (idx !== -1) { order.splice(idx + 1, 0, missingCol); inserted = true; }
        }
        
        if (!inserted) {
          order.push(missingCol);
        }
      });
    }
    return order;
  })();

  const toggleColumn = (colId: string) => {
    if (!activePortfolioId) return;
    setPortfolioVisibleColumns(prev => {
      const current = prev[activePortfolioId] || new Set(ALL_COLUMNS.map(c => c.id));
      const next = new Set(current);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return { ...prev, [activePortfolioId]: next };
    });
  };

  const resetColumns = () => {
    if (!activePortfolioId) return;
    setPortfolioColumnOrder(prev => {
      const next = { ...prev };
      delete next[activePortfolioId];
      return next;
    });
    setPortfolioVisibleColumns(prev => {
      const next = { ...prev };
      delete next[activePortfolioId];
      return next;
    });
    setPortfolioColumnWidths(prev => {
      const next = { ...prev };
      delete next[activePortfolioId];
      return next;
    });
  };

  const handleColumnDragStart = (e: React.DragEvent, id: string) => {
    setDraggedColId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleColumnDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedColId || draggedColId === targetId || !activePortfolioId) return;

    setPortfolioColumnOrder(prev => {
      const currentOrder = prev[activePortfolioId] || ALL_COLUMNS.map(c => c.id);
      const draggedIdx = currentOrder.indexOf(draggedColId);
      const targetIdx = currentOrder.indexOf(targetId);
      
      const newOrder = [...currentOrder];
      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedColId);
      
      return { ...prev, [activePortfolioId]: newOrder };
    });
    setDraggedColId(null);
  };

  const [draggedPortfolioId, setDraggedPortfolioId] = useState<string | null>(null);

  const [sidebarTooltip, setSidebarTooltip] = useState<{ text: string, top: number, left: number } | null>(null);
  const handleSidebarTooltipEnter = (e: React.MouseEvent, text: string) => {
    if (isActuallyExpanded) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setSidebarTooltip({
      text,
      top: rect.top + rect.height / 2,
      left: rect.left + 44,
    });
  };
  const handleSidebarTooltipLeave = () => setSidebarTooltip(null);


  // Real-time prices state
  const [livePrices, setLivePrices] = useState<Record<string, { 
    price: number; 
    name: string;
    change?: number;
    changePercent?: number;
    dayHigh?: number;
    dayLow?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    marketCap?: number;
    volume?: number;
    avgVolume?: number;
    previousClose?: number;
  }>>({});
  const [pricesLoading, setPricesLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Auto-cleanup deleted portfolios older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      await supabase
        .from('portfolios')
        .delete()
        .not('deleted_at', 'is', null)
        .lt('deleted_at', thirtyDaysAgo.toISOString());

      const { data: portfoliosData, error: pError } = await supabase
        .from('portfolios')
        .select('*')
        .is('deleted_at', null)
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

  const handleManualRefresh = async () => {
    setPricesLoading(true);
    await fetchData();
    if (allStockSymbols) {
      try {
        const apiBase = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${apiBase}/api/prices?symbols=${encodeURIComponent(allStockSymbols)}&t=${Date.now()}`);
        if (response.ok) {
          const prices = await response.json();
          setLivePrices(prev => ({ ...prev, ...prices }));
        }
      } catch (err) {
        console.error('Failed to fetch live prices', err);
      }
    }
    setPricesLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const executeDeleteAsset = async (symbol: string) => {
    if (!activePortfolio) return;
    try {
      const { error: e1 } = await supabase
        .from('stocks')
        .delete()
        .eq('portfolio_id', activePortfolio.id)
        .eq('symbol', symbol);
      
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from('sold_stocks')
        .delete()
        .eq('portfolio_id', activePortfolio.id)
        .eq('symbol', symbol);

      if (e2) throw e2;

      setStocks(prev => prev.filter(s => s.symbol !== symbol));
      setSoldStocks(prev => prev.filter(s => s.symbol !== symbol));
    } catch (err: any) {
      console.error('Error deleting asset:', err.message);
      alert(`Failed to delete ${symbol}. Please try again.`);
    }
  };

  const handleDeleteStock = (stockId: string) => {
    const stockToDelete = stocks.find(s => s.id === stockId);
    if (stockToDelete && stockToDelete.entry_price > 0) {
      const otherBuys = stocks.filter(s => s.symbol === stockToDelete.symbol && s.id !== stockId && s.entry_price > 0);
      if (otherBuys.length === 0) {
        const hasOtherEntries = stocks.some(s => s.symbol === stockToDelete.symbol && s.id !== stockId) || 
                                soldStocks.some(s => s.symbol === stockToDelete.symbol);
        if (hasOtherEntries) {
           setConfirmationConfig({
             isOpen: true,
             title: 'Delete Asset entirely?',
             message: `Deleting the last Buy entry for ${stockToDelete.symbol} will also delete all associated Sells and Corporate Actions. Continue?`,
             confirmText: 'Delete All',
             isDestructive: true,
             onConfirm: () => executeDeleteAsset(stockToDelete.symbol)
           });
           return;
        }
        executeDeleteAsset(stockToDelete.symbol);
        return;
      }
    }

    setConfirmationConfig({
      isOpen: true,
      title: 'Delete Buy Entry',
      message: 'Are you sure you want to delete this buy entry? This action cannot be undone.',
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
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
      }
    });
  };


  const handleDeleteSoldStock = (soldStockId: string) => {
    setConfirmationConfig({
      isOpen: true,
      title: 'Delete Sell Entry',
      message: 'Are you sure you want to delete this sell entry? This action cannot be undone.',
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
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
      }
    });
  };

  const handleDeleteAsset = (symbol: string) => {
    setConfirmationConfig({
      isOpen: true,
      title: `Delete Asset: ${symbol}`,
      message: `Are you sure you want to delete ALL records for ${symbol}? This cannot be undone.`,
      confirmText: 'Delete Asset',
      isDestructive: true,
      onConfirm: () => executeDeleteAsset(symbol)
    });
  };

  const handleDeletePortfolio = (id: string) => {
    const portfolioName = portfolios.find(p => p.id === id)?.name;
    setConfirmationConfig({
      isOpen: true,
      title: 'Delete Portfolio',
      message: `Are you sure you want to delete "${portfolioName}"? It will be moved to the Recycle Bin and can be recovered within 30 days.`,
      confirmText: 'Delete',
      isDestructive: true,
      requireInputToConfirm: portfolioName,
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('portfolios')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);

          if (error) throw error;

          if (activePortfolioId === id) {
            setActivePortfolioId(portfolios.length > 1 ? portfolios.find(p => p.id !== id)?.id || null : null);
          }

          await fetchData();
        } catch (err: any) {
          console.error('Error deleting portfolio:', err);
          alert('Failed to delete portfolio. Please try again.');
        }
      }
    });
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

  // Fetch live prices for ALL symbols across all portfolios
  const allStockSymbols = [...new Set(stocks.map(s => s.symbol))].sort().join(',');

  useEffect(() => {
    const fetchLivePrices = async (showLoading = false) => {
      if (!allStockSymbols) {
        if (showLoading) setPricesLoading(false);
        return;
      }
      if (showLoading) setPricesLoading(true);
      try {
        const apiBase = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${apiBase}/api/prices?symbols=${encodeURIComponent(allStockSymbols)}&t=${Date.now()}`);
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
  }, [allStockSymbols]);

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

    const totalBoughtQty = buys.reduce((sum, b) => Number(b.entry_price) > 0 ? sum + Number(b.quantity) : sum, 0);
    const totalSoldQty = sells.reduce((sum, s) => sum + Number(s.quantity), 0);

    // ── Chronological Event Processing & FIFO ────────────────────────────
    type HistoryEvent = {
      id?: string;
      type: 'BUY' | 'BONUS' | 'SPLIT' | 'DIVIDEND';
      date: string;
      qty: number;
      price?: number;
      brokerage?: number;
      govtTax?: number;
    };

    const events: { type: 'BUY' | 'BONUS' | 'SPLIT' | 'DIVIDEND' | 'SELL'; date: number; raw: any }[] = [];
    
    buys.forEach(b => {
      if (Number(b.entry_price) === 0) {
        events.push({ type: 'BONUS', date: new Date(b.entry_date).getTime(), raw: b });
      } else if (Number(b.entry_price) === -1) {
        events.push({ type: 'SPLIT', date: new Date(b.entry_date).getTime(), raw: b });
      } else if (Number(b.entry_price) === -2) {
        events.push({ type: 'DIVIDEND', date: new Date(b.entry_date).getTime(), raw: b });
      } else {
        events.push({ type: 'BUY', date: new Date(b.entry_date).getTime(), raw: b });
      }
    });
    sells.forEach(s => {
      events.push({ type: 'SELL', date: new Date(s.exit_date).getTime(), raw: s });
    });

    events.sort((a, b) => a.date - b.date);

    const openLots: any[] = [];
    const stockCashFlows: { date: number; amount: number }[] = [];
    let stockTotalDividend = 0;
    
    events.forEach(ev => {
      if (ev.type === 'BUY') {
        const b = ev.raw as Stock;
        const qty = Number(b.quantity);
        const price = Number(b.entry_price);
        openLots.push({
          id: b.id,
          buy: b,
          originalDate: b.entry_date,
          originalQty: qty,
          originalPrice: price,
          buyQty: qty,
          entryPrice: price,
          cost: qty * price,
          remainingQty: qty,
          soldQty: 0,
          realizedPnL: 0,
          history: [{ id: b.id, type: 'BUY', date: b.entry_date, qty, price, brokerage: Number(b.brokerage || 0), govtTax: Number(b.govt_tax || 0) }] as HistoryEvent[],
          matchedSells: []
        });

        stockCashFlows.push({
          date: new Date(b.entry_date).getTime(),
          amount: -((qty * price) + Number(b.brokerage || 0) + Number(b.govt_tax || 0))
        });
      } else if (ev.type === 'SELL') {
        const s = ev.raw as SoldStock;
        let needed = Number(s.quantity);
        const exitPrice = Number(s.exit_price);
        
        stockCashFlows.push({
          date: new Date(s.exit_date).getTime(),
          amount: (needed * exitPrice) - Number(s.brokerage || 0) - Number(s.govt_tax || 0)
        });
        
        for (const lot of openLots) {
          if (needed <= 0) break;
          if (lot.remainingQty <= 0) continue;
          
          const takeQty = Math.min(needed, lot.remainingQty);
          const proceeds = takeQty * exitPrice;
          
          const allocatedBrokerage = (takeQty / Number(s.quantity)) * Number(s.brokerage || 0);
          const allocatedGovtTax = (takeQty / Number(s.quantity)) * Number(s.govt_tax || 0);

          const realPnL = takeQty * (exitPrice - lot.entryPrice);
          
          lot.matchedSells.push({
            sellId: s.id,
            exit_date: s.exit_date,
            quantity: takeQty,
            exit_price: exitPrice,
            proceeds,
            realizedPnL: realPnL,
            brokerage: allocatedBrokerage,
            govtTax: allocatedGovtTax
          });
          
          lot.soldQty += takeQty;
          lot.remainingQty -= takeQty;
          lot.realizedPnL += realPnL;
          needed -= takeQty;
        }
      } else if (ev.type === 'BONUS') {
        const b = ev.raw as Stock;
        const bonusQty = Number(b.quantity);
        
        const totalOpen = openLots.reduce((sum, lot) => sum + lot.remainingQty, 0);
        
        if (totalOpen > 0) {
          openLots.forEach(lot => {
            if (lot.remainingQty > 0) {
              const share = bonusQty * (lot.remainingQty / totalOpen);
              lot.buyQty += share;
              lot.remainingQty += share;
              lot.entryPrice = lot.cost / lot.buyQty;
              lot.history.push({
                id: b.id,
                type: 'BONUS',
                date: b.entry_date,
                qty: share
              });
            }
          });
        }
      } else if (ev.type === 'SPLIT') {
        const b = ev.raw as Stock;
        const multiplier = Number(b.quantity);
        
        openLots.forEach(lot => {
          if (lot.remainingQty > 0) {
            lot.buyQty *= multiplier;
            lot.remainingQty *= multiplier;
            lot.entryPrice = lot.cost / lot.buyQty;
            lot.history.push({
              id: b.id,
              type: 'SPLIT',
              date: b.entry_date,
              qty: multiplier
            });
          }
        });
      } else if (ev.type === 'DIVIDEND') {
        const b = ev.raw as Stock;
        const dividendPerShare = Number(b.quantity);
        
        let totalDividendReceived = 0;
        
        openLots.forEach(lot => {
          if (lot.remainingQty > 0) {
            const dividendAmount = lot.remainingQty * dividendPerShare;
            totalDividendReceived += dividendAmount;
            lot.realizedPnL += dividendAmount;
            
            // We no longer push to lot.history for DIVIDEND so it only shows on the sell side
            
            lot.matchedSells.push({
              sellId: b.id,
              type: 'DIVIDEND',
              exit_date: b.entry_date,
              quantity: lot.remainingQty,
              exit_price: dividendPerShare,
              proceeds: dividendAmount,
              realizedPnL: dividendAmount
            });
          }
        });
        
        if (totalDividendReceived > 0) {
          stockTotalDividend += totalDividendReceived;
          stockCashFlows.push({
            date: new Date(b.entry_date).getTime(),
            amount: totalDividendReceived
          });
        }
      }
    });

    const fallbackPrice = buys.length > 0 ? Number(buys[buys.length - 1].entry_price) : 0;
    const currentLivePrice = livePrices[symbol]?.price !== undefined ? livePrices[symbol].price : fallbackPrice;

    const fifoBuyLots = openLots.map(lot => {
      const status: 'OPEN' | 'PARTIALLY_SOLD' | 'CLOSED' =
        lot.remainingQty === 0 ? 'CLOSED' : lot.soldQty > 0 ? 'PARTIALLY_SOLD' : 'OPEN';
        
      const unrealizedPnL = lot.remainingQty * (currentLivePrice - lot.entryPrice);
      const unrealizedPct = (lot.remainingQty * lot.entryPrice) > 0 ? (unrealizedPnL / (lot.remainingQty * lot.entryPrice)) * 100 : 0;

      return {
        ...lot,
        status,
        unrealizedPnL,
        unrealizedPct
      };
    });

    // Held cost basis = sum of cost of remaining open shares
    const netQty = fifoBuyLots.reduce((sum, lot) => sum + lot.remainingQty, 0);
    const netCostBasis = fifoBuyLots.reduce((sum, lot) => sum + (lot.remainingQty * lot.entryPrice), 0);
    // Avg buy price for currently held shares
    const avgBuyPrice = netQty > 0 ? netCostBasis / netQty : 0;

    const livePrice = livePrices[symbol]?.price !== undefined ? livePrices[symbol].price : (avgBuyPrice || fallbackPrice);
    const companyName = livePrices[symbol]?.name || '';

    const currentValue = netQty * livePrice;
    const unrealizedPnL = currentValue - netCostBasis;
    const unrealizedPct = netCostBasis > 0 ? (unrealizedPnL / netCostBasis) * 100 : 0;
    const fifoRealizedPnL = fifoBuyLots.reduce((sum, lot) => sum + lot.realizedPnL, 0);

    const totalBuyCost = buys.reduce((sum, b) => Number(b.entry_price) > 0 ? sum + (Number(b.quantity) * Number(b.entry_price)) : sum, 0);
    const totalBrokerage = buys.reduce((sum, b) => sum + Number(b.brokerage || 0), 0) + sells.reduce((sum, s) => sum + Number(s.brokerage || 0), 0);
    const totalGovtTax = buys.reduce((sum, b) => sum + Number(b.govt_tax || 0), 0) + sells.reduce((sum, s) => sum + Number(s.govt_tax || 0), 0);

    const xirrCashFlows = [...stockCashFlows];
    if (currentValue > 0 || xirrCashFlows.length > 0) {
      xirrCashFlows.push({
        date: Date.now(),
        amount: currentValue
      });
    }
    const xirr = calculateXIRR(xirrCashFlows);

    const priceChange = livePrices[symbol]?.change || 0;
    const changePercent = livePrices[symbol]?.changePercent || 0;
    const dayGain = netQty * priceChange;
    const dayGainPct = changePercent;
    const tradeValue = livePrice * (livePrices[symbol]?.volume || 0);

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
      events,
      openLots: fifoBuyLots,
      stockCashFlows,
      totalDividend: stockTotalDividend,
      xirr,
      priceChange,
      changePercent,
      dayHigh: livePrices[symbol]?.dayHigh,
      dayLow: livePrices[symbol]?.dayLow,
      fiftyTwoWeekHigh: livePrices[symbol]?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: livePrices[symbol]?.fiftyTwoWeekLow,
      marketCap: livePrices[symbol]?.marketCap,
      volume: livePrices[symbol]?.volume,
      avgVolume: livePrices[symbol]?.avgVolume,
      tradeValue,
      dayGain,
      dayGainPct
    };
  });

  let filteredSymbolGroups = symbolGroups;
  if (filterType === 'open') {
    filteredSymbolGroups = symbolGroups.filter(g => g.netQty > 0);
  } else if (filterType === 'closed') {
    filteredSymbolGroups = symbolGroups.filter(g => g.netQty === 0 && g.totalBoughtQty > 0);
  }

  if (searchSelectedSymbols.length > 0) {
    filteredSymbolGroups = filteredSymbolGroups.filter(g => searchSelectedSymbols.includes(g.symbol));
  }

  let totalInvestment = 0;
  let totalCurrentValue = 0;
  let totalUnrealizedPnL = 0;
  let totalRealizedPnL = 0;
  let portfolioTotalBrokerage = 0;
  let portfolioTotalGovtTax = 0;
  let portfolioTotalDividend = 0;

  const allTransactions: { date: number; amount: number }[] = [];

  filteredSymbolGroups.forEach(g => {
    totalInvestment += g.netCostBasis;
    totalCurrentValue += g.currentValue;
    totalUnrealizedPnL += g.unrealizedPnL;
    totalRealizedPnL += g.realizedPnL;
    portfolioTotalBrokerage += g.totalBrokerage;
    portfolioTotalGovtTax += g.totalGovtTax;
    portfolioTotalDividend += g.totalDividend;
    
    g.stockCashFlows.forEach(cf => {
      allTransactions.push({
        date: cf.date,
        amount: -cf.amount
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
      } else if (sortField === 'xirr') {
        valA = a.xirr;
        valB = b.xirr;
      } else if (sortField === 'portfolioWeight') {
        valA = totalInvestment > 0 ? (a.netCostBasis / totalInvestment) * 100 : 0;
        valB = totalInvestment > 0 ? (b.netCostBasis / totalInvestment) * 100 : 0;
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

  const activeColumnWidths = activePortfolioId && portfolioColumnWidths[activePortfolioId] ? portfolioColumnWidths[activePortfolioId] : {};

  const handleResizeStart = (e: React.MouseEvent, id: string, currentWidth: number) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingCol({ id, startX: e.clientX, startWidth: currentWidth });
  };

  const SortHeader = ({ field, label }: { field: string, label: string }) => {
    const width = activeColumnWidths[field] || (field === 'symbol' ? 180 : 100);
    return (
      <th 
        className={`px-3 py-2 text-[9px] uppercase tracking-wider font-semibold text-gray-500 cursor-pointer bg-white hover:bg-gray-100 transition-colors select-none group relative ${resizingCol?.id === field ? 'bg-gray-100' : ''}`}
        style={{ width, minWidth: width, maxWidth: width }}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1 overflow-hidden">
          <span className="truncate">{label}</span>
          {sortField === field ? (
            sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-zinc-900 shrink-0" /> : <ChevronDown className="w-3 h-3 text-zinc-900 shrink-0" />
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
          )}
        </div>
        
        {/* Custom Tooltip */}
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block z-50 whitespace-nowrap bg-zinc-900 text-white text-[10px] font-medium px-2 py-1 rounded border border-zinc-700 pointer-events-none normal-case tracking-normal">
          {label}
        </div>

        <div 
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onMouseDown={(e) => handleResizeStart(e, field, width)}
        />
      </th>
    );
  };

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

  const totalPnL = totalUnrealizedPnL + totalRealizedPnL - portfolioTotalBrokerage - portfolioTotalGovtTax;
  const totalPnLPercent = maxNetInvested > 0 ? (totalPnL / maxNetInvested) * 100 : 0;
  const unrealizedPnLPercent = totalInvestment > 0 ? (totalUnrealizedPnL / totalInvestment) * 100 : 0;

  // ── Aggregated Home Stats (across all portfolios) ───────────────────────────
  const homeStats = React.useMemo(() => {
    let homeTotalInvestment = 0;
    let homeTotalCurrentValue = 0;
    let homeTotalUnrealizedPnL = 0;
    let homeTotalRealizedPnL = 0;
    let homeTotalBrokerage = 0;
    let homeTotalGovtTax = 0;
    let homeTotalStocks = 0;
    let homeTotalDividend = 0;
    const homeAllTransactions: { date: number; amount: number }[] = [];

    portfolios.forEach(portfolio => {
      const pStocks = stocks.filter(s => s.portfolio_id === portfolio.id);
      const pSoldStocks = soldStocks.filter(s => s.portfolio_id === portfolio.id);
      const pSymbols = [...new Set([...pStocks.map(s => s.symbol), ...pSoldStocks.map(s => s.symbol)])].sort();

      const pSymbolGroups = pSymbols.map(symbol => {
        const buys = pStocks.filter(s => s.symbol === symbol);
        const sells = pSoldStocks.filter(s => s.symbol === symbol);
        const totalBoughtQty = buys.reduce((sum, b) => Number(b.entry_price) > 0 ? sum + Number(b.quantity) : sum, 0);

        const events: { type: 'BUY' | 'BONUS' | 'SPLIT' | 'DIVIDEND' | 'SELL'; date: number; raw: any }[] = [];
        buys.forEach(b => {
          if (Number(b.entry_price) === 0) events.push({ type: 'BONUS', date: new Date(b.entry_date).getTime(), raw: b });
          else if (Number(b.entry_price) === -1) events.push({ type: 'SPLIT', date: new Date(b.entry_date).getTime(), raw: b });
          else if (Number(b.entry_price) === -2) events.push({ type: 'DIVIDEND', date: new Date(b.entry_date).getTime(), raw: b });
          else events.push({ type: 'BUY', date: new Date(b.entry_date).getTime(), raw: b });
        });
        sells.forEach(s => events.push({ type: 'SELL', date: new Date(s.exit_date).getTime(), raw: s }));
        events.sort((a, b) => a.date - b.date || (a.type === 'SELL' ? 1 : -1));

        const openLots: any[] = [];
        let stockTotalDividend = 0;
        const stockCashFlows: { date: number; amount: number }[] = [];

        events.forEach(ev => {
          if (ev.type === 'BUY') {
            const b = ev.raw;
            const qty = Number(b.quantity);
            const price = Number(b.entry_price);
            const brokerage = Number(b.brokerage || 0);
            const govtTax = Number(b.govt_tax || 0);
            openLots.push({ buyQty: qty, remainingQty: qty, entryPrice: price, cost: qty * price, soldQty: 0, realizedPnL: 0, brokerage, govtTax });
            stockCashFlows.push({ date: new Date(b.entry_date).getTime(), amount: -(qty * price + brokerage + govtTax) });
          } else if (ev.type === 'SELL') {
            const s = ev.raw;
            let sellQty = Number(s.quantity);
            const exitPrice = Number(s.exit_price);
            const brokerage = Number(s.brokerage || 0);
            const govtTax = Number(s.govt_tax || 0);
            const proceeds = sellQty * exitPrice;
            stockCashFlows.push({ date: new Date(s.exit_date).getTime(), amount: proceeds - brokerage - govtTax });
            for (const lot of openLots) {
              if (sellQty <= 0) break;
              if (lot.remainingQty <= 0) continue;
              const matchQty = Math.min(lot.remainingQty, sellQty);
              const costBasis = matchQty * lot.entryPrice;
              lot.realizedPnL += matchQty * exitPrice - costBasis;
              lot.remainingQty -= matchQty;
              lot.soldQty += matchQty;
              sellQty -= matchQty;
            }
          } else if (ev.type === 'BONUS') {
            const b = ev.raw;
            const bonusQty = Number(b.quantity);
            openLots.push({ buyQty: bonusQty, remainingQty: bonusQty, entryPrice: 0, cost: 0, soldQty: 0, realizedPnL: 0, brokerage: 0, govtTax: 0 });
          } else if (ev.type === 'SPLIT') {
            const b = ev.raw;
            const multiplier = Number(b.quantity);
            openLots.forEach(lot => {
              if (lot.remainingQty > 0) {
                lot.buyQty *= multiplier;
                lot.remainingQty *= multiplier;
                lot.entryPrice = lot.cost / lot.buyQty;
              }
            });
          } else if (ev.type === 'DIVIDEND') {
            const b = ev.raw;
            const dividendPerShare = Number(b.quantity);
            let totalDivReceived = 0;
            openLots.forEach(lot => {
              if (lot.remainingQty > 0) {
                const divAmount = lot.remainingQty * dividendPerShare;
                totalDivReceived += divAmount;
                lot.realizedPnL += divAmount;
              }
            });
            if (totalDivReceived > 0) {
              stockTotalDividend += totalDivReceived;
              stockCashFlows.push({ date: new Date(b.entry_date).getTime(), amount: totalDivReceived });
            }
          }
        });

        const netQty = openLots.reduce((sum: number, lot: any) => sum + lot.remainingQty, 0);
        const netCostBasis = openLots.reduce((sum: number, lot: any) => sum + (lot.remainingQty * lot.entryPrice), 0);
        const avgBuyPrice = netQty > 0 ? netCostBasis / netQty : 0;
        const livePrice = livePrices[symbol]?.price !== undefined ? livePrices[symbol].price : avgBuyPrice;
        const currentValue = netQty * livePrice;
        const unrealizedPnL = currentValue - netCostBasis;
        const fifoRealizedPnL = openLots.reduce((sum: number, lot: any) => sum + lot.realizedPnL, 0);
        const totalBrokerage = buys.reduce((sum, b) => sum + Number(b.brokerage || 0), 0) + sells.reduce((sum, s) => sum + Number(s.brokerage || 0), 0);
        const totalGovtTax = buys.reduce((sum, b) => sum + Number(b.govt_tax || 0), 0) + sells.reduce((sum, s) => sum + Number(s.govt_tax || 0), 0);

        return { symbol, netQty, netCostBasis, currentValue, unrealizedPnL, realizedPnL: fifoRealizedPnL, totalBrokerage, totalGovtTax, stockCashFlows, totalBoughtQty, totalDividend: stockTotalDividend };
      });

      // Only count open positions for total stocks
      const openGroups = pSymbolGroups.filter(g => g.netQty > 0);
      homeTotalStocks += openGroups.length;

      pSymbolGroups.forEach(g => {
        homeTotalInvestment += g.netCostBasis;
        homeTotalCurrentValue += g.currentValue;
        homeTotalUnrealizedPnL += g.unrealizedPnL;
        homeTotalRealizedPnL += g.realizedPnL;
        homeTotalBrokerage += g.totalBrokerage;
        homeTotalGovtTax += g.totalGovtTax;
        homeTotalDividend += g.totalDividend;
        g.stockCashFlows.forEach(cf => {
          homeAllTransactions.push({ date: cf.date, amount: -cf.amount });
        });
      });
    });

    homeAllTransactions.sort((a, b) => a.date - b.date);
    let homeMaxNetInvested = 0;
    let homeCurrentInvested = 0;
    homeAllTransactions.forEach(tx => {
      homeCurrentInvested += tx.amount;
      if (homeCurrentInvested > homeMaxNetInvested) homeMaxNetInvested = homeCurrentInvested;
    });

    const homeXirrCashFlows = homeAllTransactions.map(t => ({ date: t.date, amount: -t.amount }));
    if (homeTotalCurrentValue > 0 || homeXirrCashFlows.length > 0) {
      homeXirrCashFlows.push({ date: Date.now(), amount: homeTotalCurrentValue });
    }
    const homeXIRR = calculateXIRR(homeXirrCashFlows);

    const homeTotalPnL = homeTotalUnrealizedPnL + homeTotalRealizedPnL - homeTotalBrokerage - homeTotalGovtTax;
    const homeTotalPnLPercent = homeMaxNetInvested > 0 ? (homeTotalPnL / homeMaxNetInvested) * 100 : 0;
    const homeUnrealizedPnLPercent = homeTotalInvestment > 0 ? (homeTotalUnrealizedPnL / homeTotalInvestment) * 100 : 0;

    return {
      totalStocks: homeTotalStocks,
      maxNetInvested: homeMaxNetInvested,
      totalInvestment: homeTotalInvestment,
      totalCurrentValue: homeTotalCurrentValue,
      totalUnrealizedPnL: homeTotalUnrealizedPnL,
      unrealizedPnLPercent: homeUnrealizedPnLPercent,
      totalRealizedPnL: homeTotalRealizedPnL,
      totalPnL: homeTotalPnL,
      totalPnLPercent: homeTotalPnLPercent,
      totalDividend: homeTotalDividend,
      xirr: homeXIRR,
    };
  }, [portfolios, stocks, soldStocks, livePrices]);

  const exportToExcel = () => {
    if (!activePortfolio || filteredSymbolGroups.length === 0) return;

    // 1. Create Summary Sheet Data
    const summaryData = filteredSymbolGroups.map(group => {
      const currentPrice = livePrices[group.symbol]?.price || 0;
      const currentValue = group.netQty * currentPrice;
      const pnl = currentValue - group.netCostBasis;
      const pnlPct = group.netCostBasis > 0 ? (pnl / group.netCostBasis) * 100 : 0;
      
      return {
        Ticker: group.symbol,
        'Total Quantity': group.netQty,
        'Avg Buy Price': group.avgBuyPrice,
        'Current Price': currentPrice,
        'Invested Value': group.netCostBasis,
        'Current Value': currentValue,
        'P&L': pnl,
        'P&L %': pnlPct,
        'Total Dividend': group.totalDividend
      };
    });

    // 2. Create Details Sheet Data
    const detailsData: any[] = [];
    filteredSymbolGroups.forEach(group => {
      group.events.forEach(ev => {
        if (ev.type === 'BUY') {
          detailsData.push({
            Type: 'BUY',
            Date: ev.raw.entry_date,
            Ticker: group.symbol,
            Quantity: ev.raw.quantity,
            Price: ev.raw.entry_price,
            'Total Amount': ev.raw.quantity * ev.raw.entry_price
          });
        } else if (ev.type === 'SELL') {
          detailsData.push({
            Type: 'SELL',
            Date: ev.raw.exit_date,
            Ticker: group.symbol,
            Quantity: ev.raw.quantity,
            Price: ev.raw.exit_price,
            'Total Amount': ev.raw.quantity * ev.raw.exit_price
          });
        } else if (ev.type === 'DIVIDEND') {
          detailsData.push({
            Type: 'DIVIDEND',
            Date: ev.raw.entry_date,
            Ticker: group.symbol,
            Quantity: '-',
            Price: ev.raw.quantity,
            'Total Amount': '-'
          });
        } else if (ev.type === 'SPLIT') {
          detailsData.push({
            Type: 'SPLIT',
            Date: ev.raw.entry_date,
            Ticker: group.symbol,
            Quantity: ev.raw.quantity,
            Price: '-',
            'Total Amount': '-'
          });
        } else if (ev.type === 'BONUS') {
          detailsData.push({
            Type: 'BONUS',
            Date: ev.raw.entry_date,
            Ticker: group.symbol,
            Quantity: ev.raw.quantity,
            Price: '-',
            'Total Amount': '-'
          });
        }
      });
    });

    // 3. Create Workbook
    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsDetails = XLSX.utils.json_to_sheet(detailsData);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    XLSX.utils.book_append_sheet(wb, wsDetails, 'Details');

    XLSX.writeFile(wb, `${activePortfolio.name}_Export.xlsx`);
  };

  const importFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });

      const wsDetailsName = wb.SheetNames.find(n => n.toLowerCase() === 'details');
      if (!wsDetailsName) {
        alert('Could not find a "Details" sheet in the uploaded Excel file. Please upload a file with the correct format.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const wsDetails = wb.Sheets[wsDetailsName];
      const data: any[] = XLSX.utils.sheet_to_json(wsDetails);

      if (data.length === 0) {
        alert('The "Details" sheet is empty.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const portfolioName = prompt('Enter a name for the imported portfolio:', file.name.replace(/\.[^/.]+$/, ""));
      if (!portfolioName) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      try {
        setLoading(true);
        const { data: newPortfolio, error: portfolioError } = await supabase
          .from('portfolios')
          .insert([{ name: portfolioName }])
          .select()
          .single();

        if (portfolioError) throw portfolioError;

        const buysToInsert: any[] = [];
        const sellsToInsert: any[] = [];

        data.forEach(row => {
          const type = row['Type']?.toString().toUpperCase();
          const symbol = row['Ticker'];
          
          let rawQty = 0;
          let rawPrice = 0;

          if (type === 'DIVIDEND') {
            rawQty = Number(row['Price']); // Dividend amount per share was exported in the 'Price' column
            rawPrice = -2;
          } else if (type === 'SPLIT') {
            rawQty = Number(row['Quantity']); // Multiplier was exported in the 'Quantity' column
            rawPrice = -1;
          } else if (type === 'BONUS') {
            rawQty = Number(row['Quantity']); // Multiplier was exported in the 'Quantity' column
            rawPrice = 0;
          } else {
            rawQty = Number(row['Quantity']);
            rawPrice = Number(row['Price']);
          }

          let parsedDate;
          const dateStr = row['Date'];
          if (typeof dateStr === 'number') {
            const date = new Date(Math.round((dateStr - 25569) * 86400 * 1000));
            parsedDate = date.toISOString().split('T')[0];
          } else if (typeof dateStr === 'string') {
            parsedDate = new Date(dateStr).toISOString().split('T')[0];
          } else {
             parsedDate = new Date().toISOString().split('T')[0];
          }

          if (type === 'BUY' || type === 'DIVIDEND' || type === 'SPLIT' || type === 'BONUS') {
            buysToInsert.push({ portfolio_id: newPortfolio.id, symbol, quantity: rawQty, entry_price: rawPrice, entry_date: parsedDate });
          } else if (type === 'SELL') {
            sellsToInsert.push({ portfolio_id: newPortfolio.id, symbol, quantity: rawQty, exit_price: rawPrice, exit_date: parsedDate });
          }
        });

        if (buysToInsert.length > 0) {
          const { error: buysError } = await supabase.from('stocks').insert(buysToInsert);
          if (buysError) throw buysError;
        }

        if (sellsToInsert.length > 0) {
          const { error: sellsError } = await supabase.from('sold_stocks').insert(sellsToInsert);
          if (sellsError) throw sellsError;
        }

        await fetchData();
        setActivePortfolioId(newPortfolio.id);
      } catch (err) {
        console.error('Import Error:', err);
        alert('Failed to import portfolio. Please check console for details.');
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* Unified Top Header */}
      <header className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center shrink-0">
            <PieChart className="w-5 h-5 text-zinc-900" />
          </div>
          
          <span className="text-gray-300 font-light text-lg leading-none mb-0.5">/</span>
          {activePage === 'home' ? (
            <h2 className="text-sm font-semibold text-zinc-900 leading-tight">Home</h2>
          ) : (
            <>
              <button 
                onClick={() => { if (sidebarMode !== 'expanded') setIsSidebarTemporarilyExpanded(prev => !prev); }}
                className="text-sm font-medium text-gray-500 hover:text-zinc-900 transition-colors cursor-pointer"
              >
                Portfolios
              </button>
              
              {activePortfolio && (
                <>
                  <span className="text-gray-300 font-light text-lg leading-none mb-0.5">/</span>
                  <h2 className="text-sm font-semibold text-zinc-900 leading-tight">
                    {activePortfolio.name}
                  </h2>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            disabled={pricesLoading}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors border bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200 ${pricesLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Refresh Portfolio & Prices"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pricesLoading ? 'animate-spin text-zinc-900' : ''}`} />
          </button>

          <div className="relative group" ref={accountMenuRef}>
            <button
              onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors border ${
                isAccountMenuOpen 
                  ? 'bg-zinc-900 text-white border-zinc-900' 
                  : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <User className="w-4 h-4" />
            </button>

          {/* Custom Tooltip */}
          {!isAccountMenuOpen && (
            <div className="absolute right-0 top-full mt-2 hidden group-hover:block z-50 whitespace-nowrap bg-zinc-900 text-white text-[10px] font-medium px-2 py-1 rounded border border-zinc-700">
              Account Settings
            </div>
          )}

          {isAccountMenuOpen && (
            <div className="absolute right-0 mt-2 min-w-[240px] max-w-sm bg-white border border-gray-200 rounded-lg py-1 z-50 shadow-lg shadow-gray-400/30">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] text-gray-500 mb-0.5 uppercase tracking-wide">Signed in as</p>
                <p className="text-xs font-medium text-gray-900 truncate">
                  {session?.user?.email}
                </p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="w-full text-left px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-zinc-900 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside 
          onMouseEnter={() => setIsSidebarHovered(true)}
          onMouseLeave={() => {
            setIsSidebarHovered(false);
            setIsSidebarTemporarilyExpanded(false);
          }}
          className={`bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${isActuallyExpanded ? 'w-56' : 'w-12'}`}
        >
          <div className="w-56 flex flex-col h-full bg-white">



        <div className="flex-1 overflow-y-auto pb-4 pt-2">
          {/* Overview Section */}
          <div>
            <div className="flex items-center pl-4 pr-4 mb-2 mt-2">
              <div 
                className="flex items-center gap-3 text-gray-400" 
                onMouseEnter={(e) => handleSidebarTooltipEnter(e, "Overview")}
                onMouseLeave={handleSidebarTooltipLeave}
              >
                <LayoutDashboard className="w-5 h-5 shrink-0" />
                <p className={`text-[10px] font-semibold uppercase tracking-wide transition-opacity duration-300 ${isActuallyExpanded ? 'opacity-100' : 'opacity-0'}`}>Overview</p>
              </div>
            </div>
            <nav className="mt-1">
              <button
                onClick={() => setActivePage('home')}
                onMouseEnter={(e) => handleSidebarTooltipEnter(e, "Home")}
                onMouseLeave={handleSidebarTooltipLeave}
                className={`group w-full flex items-center pl-4 pr-2 py-1.5 text-xs transition-colors ${
                  activePage === 'home'
                    ? 'text-zinc-900 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Home className={`w-5 h-5 shrink-0 transition-colors ${activePage === 'home' ? 'text-zinc-900' : 'text-gray-400 group-hover:text-gray-500'}`} />
                  <span className={`truncate transition-opacity duration-300 ${isActuallyExpanded ? 'opacity-100' : 'opacity-0'}`}>Home</span>
                </div>
              </button>
            </nav>
          </div>

          {/* Portfolios Section */}
          <div>
            <div className="flex items-center justify-between pl-4 pr-4 mb-2 mt-4">
              <div 
                className="flex items-center gap-3 text-gray-400" 
                onMouseEnter={(e) => handleSidebarTooltipEnter(e, "Portfolios")}
                onMouseLeave={handleSidebarTooltipLeave}
              >
                <Folder className="w-5 h-5 shrink-0" />
                <p className={`text-[10px] font-semibold uppercase tracking-wide transition-opacity duration-300 ${isActuallyExpanded ? 'opacity-100' : 'opacity-0'}`}>Portfolios</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".xlsx, .xls"
                  onChange={importFromExcel}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-gray-400 hover:text-zinc-900 transition-colors"
                  title="Import Portfolio"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="text-gray-400 hover:text-zinc-900 transition-colors"
                  title="Create Portfolio"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <nav className="mt-1">
              {portfolios.map(portfolio => (
                <button
                  key={portfolio.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, portfolio.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, portfolio.id)}
                  onDragEnd={() => setDraggedPortfolioId(null)}
                  onClick={() => { setActivePortfolioId(portfolio.id); setActivePage('portfolio'); }}
                  onMouseEnter={(e) => handleSidebarTooltipEnter(e, portfolio.name)}
                  onMouseLeave={handleSidebarTooltipLeave}
                  className={`group w-full flex items-center justify-between pl-4 pr-2 py-1.5 text-xs transition-colors cursor-grab active:cursor-grabbing ${
                    draggedPortfolioId === portfolio.id ? 'opacity-50 border border-dashed border-gray-400' : ''
                  } ${
                    activePortfolioId === portfolio.id && activePage === 'portfolio'
                      ? 'text-zinc-900 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className={`w-5 h-5 shrink-0 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${activePortfolioId === portfolio.id && activePage === 'portfolio' ? 'bg-zinc-900 text-white' : 'bg-gray-200 text-gray-500 group-hover:bg-gray-300'}`}>
                      {portfolio.name ? portfolio.name.charAt(0).toUpperCase() : 'P'}
                    </div>
                    <span className={`truncate transition-opacity duration-300 ${isActuallyExpanded ? 'opacity-100' : 'opacity-0'}`}>{portfolio.name}</span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
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
                <div className={`pl-4 py-2 text-xs text-gray-400 transition-opacity duration-300 ${isActuallyExpanded ? 'opacity-100' : 'opacity-0'}`}>
                  No portfolios yet.
                </div>
              )}
            </nav>
          </div>
        </div>
        <div className="mt-auto flex flex-col relative" ref={sidebarMenuRef}>
          <div 
            className="pl-4 py-3 flex items-center gap-3 text-gray-400 cursor-pointer hover:text-zinc-900 transition-colors" 
            onClick={() => setIsRecycleBinModalOpen(true)}
            onMouseEnter={(e) => handleSidebarTooltipEnter(e, "Recycle Bin")}
            onMouseLeave={handleSidebarTooltipLeave}
          >
            <Trash2 className="w-5 h-5 shrink-0" />
            <p className={`text-[10px] font-semibold uppercase tracking-wide transition-opacity duration-300 ${isActuallyExpanded ? 'opacity-100' : 'opacity-0'}`}>Recycle Bin</p>
          </div>
          <div className="pl-4 pb-4 pt-1 flex items-center">
            <button
              onClick={() => setIsSidebarMenuOpen(!isSidebarMenuOpen)}
              className="text-gray-400 hover:text-zinc-900 transition-colors"
              onMouseEnter={(e) => handleSidebarTooltipEnter(e, "Sidebar Control")}
              onMouseLeave={handleSidebarTooltipLeave}
            >
              {sidebarMode === 'collapsed' ? <PanelLeftOpen className="w-5 h-5 shrink-0" /> : <PanelLeftClose className="w-5 h-5 shrink-0" />}
            </button>
          </div>

          {isSidebarMenuOpen && (
            <div className="fixed left-4 bottom-12 min-w-[180px] bg-white border border-gray-200 rounded-lg py-1 z-50 shadow-lg shadow-gray-400/30">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Sidebar Control</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setSidebarMode('expanded'); setIsSidebarMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-zinc-900 flex items-center justify-between"
                >
                  Expanded
                  {sidebarMode === 'expanded' && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setSidebarMode('collapsed'); setIsSidebarMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-zinc-900 flex items-center justify-between"
                >
                  Collapsed
                  {sidebarMode === 'collapsed' && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => { setSidebarMode('hover'); setIsSidebarMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 hover:text-zinc-900 flex items-center justify-between"
                >
                  Expand on hover
                  {sidebarMode === 'hover' && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </aside>

      {/* Floating Open Button Removed */}

      {/* Custom Sidebar Tooltip */}
      {sidebarTooltip && !isActuallyExpanded && (
        <div 
          className="fixed z-[100] bg-zinc-900 text-white text-[10px] px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap pointer-events-none"
          style={{
            top: sidebarTooltip.top,
            left: sidebarTooltip.left,
            transform: 'translateY(-50%)'
          }}
        >
          {sidebarTooltip.text}
          <div className="absolute top-1/2 -left-1 -mt-1 w-2 h-2 bg-zinc-900 rotate-45" />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-2 md:p-4 flex flex-col min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-zinc-900 rounded-full animate-spin" />
            </div>
          ) : activePage === 'home' ? (
            <div className="h-full flex flex-col overflow-y-auto">
              {/* Stats Cards - same format as individual portfolio */}
              <div className="flex flex-wrap gap-2 mb-4 [&>div]:flex-1 [&>div]:min-w-fit">
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Total Stocks</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900">{homeStats.totalStocks}</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Max Investment</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 truncate" title={`₹${homeStats.maxNetInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    ₹{homeStats.maxNetInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Total Invested</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 truncate" title={`₹${homeStats.totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    ₹{homeStats.totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Current Value</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 truncate" title={`₹${homeStats.totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    ₹{homeStats.totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Unrealized PnL</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${homeStats.totalUnrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`₹${homeStats.totalUnrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    {homeStats.totalUnrealizedPnL >= 0 ? '+' : ''}₹{homeStats.totalUnrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Unrealized %</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${homeStats.unrealizedPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`${homeStats.unrealizedPnLPercent.toFixed(2)}%`}>
                    {homeStats.unrealizedPnLPercent >= 0 ? '+' : ''}{homeStats.unrealizedPnLPercent.toFixed(2)}%
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Realized PnL</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${homeStats.totalRealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`₹${homeStats.totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    {homeStats.totalRealizedPnL >= 0 ? '+' : ''}₹{homeStats.totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Total Dividend</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 truncate" title={`₹${homeStats.totalDividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    ₹{homeStats.totalDividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Total PnL</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${homeStats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`₹${homeStats.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    {homeStats.totalPnL >= 0 ? '+' : ''}₹{homeStats.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Total PnL %</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${homeStats.totalPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`${homeStats.totalPnLPercent.toFixed(2)}%`}>
                    {homeStats.totalPnLPercent >= 0 ? '+' : ''}{homeStats.totalPnLPercent.toFixed(2)}%
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>XIRR</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${homeStats.xirr >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`${(homeStats.xirr * 100).toFixed(2)}%`}>
                    {homeStats.xirr >= 0 ? '+' : ''}{(homeStats.xirr * 100).toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Portfolio List */}
              {portfolios.length > 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-zinc-900">Your Portfolios</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {portfolios.map(p => {
                      const pStocks = stocks.filter(s => s.portfolio_id === p.id && Number(s.entry_price) > 0);
                      const pSymbols = [...new Set(pStocks.map(s => s.symbol))];
                      return (
                        <button
                          key={p.id}
                          onClick={() => { setActivePortfolioId(p.id); setActivePage('portfolio'); }}
                          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center text-xs font-bold">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                              <p className="text-[11px] text-gray-400">{pSymbols.length} asset{pSymbols.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-6">
                    <Briefcase className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-2">No Portfolios Yet</h3>
                  <p className="text-sm text-gray-500 mb-8">Create your first portfolio to start tracking your assets.</p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-6 py-2.5 rounded-lg transition-colors shadow-sm"
                  >
                    Create New Portfolio
                  </button>
                </div>
              )}
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
            <div className="w-full flex flex-col h-full min-h-0">
              {/* Stats Cards */}
              <div className="flex flex-wrap gap-2 mb-4 [&>div]:flex-1 [&>div]:min-w-fit">
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
                    <span>Total Invested</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 truncate" title={`₹${totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    ₹{totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Unrealized %</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${unrealizedPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`${unrealizedPnLPercent.toFixed(2)}%`}>
                    {unrealizedPnLPercent >= 0 ? '+' : ''}{unrealizedPnLPercent.toFixed(2)}%
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
                    <span>Total Dividend</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900 truncate" title={`₹${portfolioTotalDividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    ₹{portfolioTotalDividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Total PnL</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`₹${totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                    {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-gray-500 mb-0.5">
                    <span>Total PnL %</span>
                  </div>
                  <div className={`text-sm font-bold truncate ${totalPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`} title={`${totalPnLPercent.toFixed(2)}%`}>
                    {totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
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
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
                <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center bg-white shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base text-zinc-900">Assets</h3>
                      <button 
                        onClick={() => setIsPortfolioInfoModalOpen(true)}
                        className="text-gray-400 hover:text-blue-500 transition-colors"
                        title="View Corporate Actions Timeline"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                      {pricesLoading && (
                        <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-zinc-900 rounded-full animate-spin" title="Updating live prices..." />
                      )}
                    </div>
                    <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                      {(['open', 'closed', 'all'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setFilterType(type)}
                          className={`px-3 py-1 text-[10px] font-medium rounded-md capitalize transition-colors ${
                            filterType === type ? 'bg-white text-zinc-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    
                    <AssetSearch 
                      availableAssets={allSymbols.map(sym => ({ symbol: sym, name: livePrices[sym]?.name || '' }))} 
                      selectedSymbols={searchSelectedSymbols} 
                      onChange={setSearchSelectedSymbols} 
                    />

                    {(filterType !== 'open' || sortField !== null || searchSelectedSymbols.length > 0) && (
                      <button
                        onClick={() => {
                          setFilterType('open');
                          setSortField(null);
                          setSearchSelectedSymbols([]);
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-md shadow-sm text-[10px] font-medium text-gray-600 hover:text-zinc-900 transition-colors"
                      >
                        <FilterX className="w-3 h-3" />
                        Clear
                      </button>
                    )}
                    
                    <div className="relative">
                      <button
                        onClick={() => setIsColumnsDropdownOpen(!isColumnsDropdownOpen)}
                        className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-md shadow-sm text-[10px] font-medium text-gray-600 hover:text-zinc-900 transition-colors"
                      >
                        <Columns className="w-3 h-3" />
                        Columns
                      </button>
                      
                      {isColumnsDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setIsColumnsDropdownOpen(false)} />
                          <div className="absolute left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 max-h-64 overflow-y-auto">
                            <div className="border-b border-gray-100 p-1 mb-1">
                              <button
                                onClick={resetColumns}
                                className="w-full flex items-center justify-center px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded transition-colors"
                              >
                                Reset to Default
                              </button>
                            </div>
                            {activeColumnOrder.map(colId => {
                              const col = ALL_COLUMNS.find(c => c.id === colId)!;
                              return (
                                <div
                                  key={col.id}
                                  draggable
                                  onDragStart={(e) => handleColumnDragStart(e, col.id)}
                                  onDragOver={handleColumnDragOver}
                                  onDrop={(e) => handleColumnDrop(e, col.id)}
                                  className={`w-full flex items-center px-3 py-1.5 text-[10px] text-left hover:bg-gray-50 text-zinc-900 cursor-move transition-colors ${draggedColId === col.id ? 'opacity-50' : ''}`}
                                >
                                  <GripVertical className="w-3 h-3 text-gray-400 mr-2 shrink-0" />
                                  <div className="w-4 flex justify-center mr-1 shrink-0 cursor-pointer" onClick={() => toggleColumn(col.id)}>
                                    {visibleColumns.has(col.id) && <Check className="w-3 h-3 text-zinc-900" />}
                                  </div>
                                  <span className="flex-1 cursor-pointer select-none" onClick={() => toggleColumn(col.id)}>{col.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
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
                    <button
                      onClick={() => setIsRebalanceModalOpen(true)}
                      className="text-xs font-medium text-orange-600 hover:text-orange-800 transition-colors"
                    >
                      Rebalance
                    </button>
                    <div className="w-px h-3 bg-gray-300 mx-1"></div>
                    <button
                      onClick={() => setCorporateActionType('bonus')}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Add Bonus
                    </button>
                    <button
                      onClick={() => setCorporateActionType('split')}
                      className="text-xs font-medium text-purple-600 hover:text-purple-800 transition-colors"
                    >
                      Add Split
                    </button>
                    <button
                      onClick={() => setCorporateActionType('dividend')}
                      className="text-xs font-medium text-green-600 hover:text-green-800 transition-colors"
                    >
                      Add Dividend
                    </button>
                    <div className="w-px h-3 bg-gray-300 mx-1"></div>
                    <button
                      onClick={() => {
                        if (expandedSymbols.size > 0) {
                          setExpandedSymbols(new Set());
                        } else {
                          setExpandedSymbols(new Set(filteredSymbolGroups.map(g => g.symbol)));
                        }
                      }}
                      className="text-xs font-medium text-gray-500 hover:text-zinc-900 transition-colors flex items-center gap-1"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                      {expandedSymbols.size > 0 ? 'Collapse All' : 'Expand All'}
                    </button>
                    <div className="w-px h-3 bg-gray-300 mx-1"></div>

                    <button
                      onClick={exportToExcel}
                      disabled={filteredSymbolGroups.length === 0}
                      className="text-xs font-medium text-gray-600 hover:text-zinc-900 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </button>
                  </div>
                </div>

                <div className="overflow-auto flex-1 bg-white">
                  <table className="w-full text-left border-collapse whitespace-nowrap table-fixed">
                    <thead className="sticky top-0 z-10 bg-white shadow-sm">
                      <tr className="border-b border-gray-200 divide-x divide-gray-200">
                        <th className="px-2 py-1.5 text-[8px] uppercase tracking-wider font-semibold text-gray-500 w-6 bg-white"></th>
                        {activeColumnOrder.map(colId => {
                          if (!visibleColumns.has(colId)) return null;
                          const col = ALL_COLUMNS.find(c => c.id === colId)!;
                          return <SortHeader key={col.id} field={col.id} label={col.label} />;
                        })}
                        <th className="px-2 py-1.5 text-[8px] text-right w-8 bg-white"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSymbolGroups.length === 0 ? (
                        <tr>
                          <td colSpan={visibleColumns.size + 2} className="px-3 py-6 text-center text-gray-500 text-[10px]">
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
                                className="border-b border-gray-200 divide-x divide-gray-200 hover:bg-gray-50 cursor-pointer transition-colors group"
                              >
                                <td className="pl-2 pr-1 py-1.5">
                                  <span className="text-gray-400 group-hover:text-zinc-700 transition-colors">
                                    {isExpanded
                                      ? <ChevronDown className="w-3 h-3" />
                                      : <ChevronRight className="w-3 h-3" />}
                                  </span>
                                </td>
                                {activeColumnOrder.map(colId => {
                                  if (!visibleColumns.has(colId)) return null;
                                  switch (colId) {
                                    case 'symbol':
                                      return (
                                        <td key="symbol" className="px-2 py-1.5 truncate">
                                          <div className="flex items-center gap-1.5 overflow-hidden">
                                            <div className="min-w-0 flex-1">
                                              <div className="font-semibold text-[9px] text-zinc-900 flex items-center gap-1.5 truncate">
                                                <span className="truncate">{group.symbol}</span>
                                                {group.companyName && (
                                                  <span className="font-normal text-[9px] text-gray-500 truncate" title={group.companyName}>
                                                    {group.companyName}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-[8px] text-gray-400 mt-0.5 truncate flex items-center gap-1.5">
                                                <span>
                                                  {group.totalBoughtQty.toLocaleString()} bought
                                                  {group.totalSoldQty > 0 && <> · <span className="text-red-400">{group.totalSoldQty.toLocaleString()} sold</span></>}
                                                </span>
                                                <span>·</span>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAddStockInitialSymbol(group.symbol);
                                                    setAddStockInitialPrice(group.livePrice);
                                                    setAddStockPortfolioId(activePortfolioId);
                                                  }}
                                                  className="text-green-600 hover:text-green-700 hover:underline transition-colors focus:outline-none"
                                                  title={`Buy more ${group.symbol}`}
                                                >
                                                  Buy
                                                </button>
                                                <span>·</span>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSellStockInitialSymbol(group.symbol);
                                                    setSellStockInitialPrice(group.livePrice);
                                                    setSellStockPortfolioId(activePortfolioId);
                                                  }}
                                                  className="text-red-500 hover:text-red-700 hover:underline transition-colors focus:outline-none"
                                                  title={`Sell ${group.symbol}`}
                                                >
                                                  Sell
                                                </button>
                                                <span>·</span>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setViewCorporateActionsSymbol(group.symbol);
                                                  }}
                                                  className="text-blue-500 hover:text-blue-700 hover:underline transition-colors focus:outline-none"
                                                  title={`View Corporate Actions for ${group.symbol}`}
                                                >
                                                  Corporate Actions
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                      );
                                    case 'netQty':
                                      return <td key="netQty" className="px-2 py-1.5 text-[9px] font-semibold text-zinc-900 truncate">{group.netQty.toLocaleString()}</td>;
                                    case 'avgBuyPrice':
                                      return <td key="avgBuyPrice" className="px-2 py-1.5 text-[9px] text-gray-600 truncate">₹{fmt(group.avgBuyPrice)}</td>;
                                    case 'netCostBasis':
                                      return <td key="netCostBasis" className="px-2 py-1.5 text-[9px] text-gray-600 truncate" title="Avg buy price × remaining shares — money still at work">₹{fmt(group.netCostBasis)}</td>;
                                    case 'portfolioWeight':
                                      const weight = totalInvestment > 0 ? (group.netCostBasis / totalInvestment) * 100 : 0;
                                      return (
                                        <td key="portfolioWeight" className="px-2 py-1.5 text-[9px] text-gray-600 truncate">
                                          {weight.toFixed(2)}%
                                        </td>
                                      );
                                    case 'currentValueWeight':
                                      const cvWeight = totalCurrentValue > 0 ? (group.currentValue / totalCurrentValue) * 100 : 0;
                                      return (
                                        <td key="currentValueWeight" className="px-2 py-1.5 text-[9px] text-gray-600 truncate">
                                          {cvWeight.toFixed(2)}%
                                        </td>
                                      );
                                    case 'livePrice':
                                      return <td key="livePrice" className="px-2 py-1.5 text-[9px] font-medium text-zinc-900 truncate">₹{fmt(group.livePrice)}</td>;
                                    case 'currentValue':
                                      return <td key="currentValue" className="px-2 py-1.5 text-[9px] font-medium text-zinc-900 truncate">₹{fmt(group.currentValue)}</td>;
                                    case 'unrealizedPnL':
                                      return (
                                        <td key="unrealizedPnL" className="px-2 py-1.5 text-[9px] truncate">
                                          <span className={`font-medium ${group.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {group.unrealizedPnL >= 0 ? '+' : ''}₹{fmt(group.unrealizedPnL)}
                                          </span>
                                        </td>
                                      );
                                    case 'unrealizedPnLPct':
                                      return (
                                        <td key="unrealizedPnLPct" className="px-2 py-1.5 text-[9px] truncate">
                                          <span className={`font-medium ${group.unrealizedPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {group.unrealizedPct >= 0 ? '+' : ''}{group.unrealizedPct.toFixed(2)}%
                                          </span>
                                        </td>
                                      );
                                    case 'realizedPnL':
                                      return (
                                        <td key="realizedPnL" className="px-2 py-1.5 text-[9px] truncate">
                                          {group.sells.length > 0 ? (
                                            <span className={`font-medium ${group.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {group.realizedPnL >= 0 ? '+' : ''}₹{fmt(group.realizedPnL)}
                                            </span>
                                          ) : (
                                            <span className="text-gray-300">—</span>
                                          )}
                                        </td>
                                      );
                                    case 'realizedPnLPct':
                                      return (
                                        <td key="realizedPnLPct" className="px-2 py-1.5 text-[9px] truncate">
                                          {group.sells.length > 0 ? (
                                            (() => {
                                              const realizedCostBasis = group.totalBuyCost - group.netCostBasis;
                                              const realizedPct = realizedCostBasis > 0 ? (group.realizedPnL / realizedCostBasis) * 100 : 0;
                                              return (
                                                <span className={`font-medium ${realizedPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                  {realizedPct >= 0 ? '+' : ''}{realizedPct.toFixed(2)}%
                                                </span>
                                              );
                                            })()
                                          ) : (
                                            <span className="text-gray-300">—</span>
                                          )}
                                        </td>
                                      );
                                    case 'totalDividend':
                                      return (
                                        <td key="totalDividend" className="px-2 py-1.5 text-[9px] truncate">
                                          {group.totalDividend > 0 ? (
                                            <span className="font-medium text-green-600">
                                              ₹{fmt(group.totalDividend)}
                                            </span>
                                          ) : (
                                            <span className="text-gray-300">—</span>
                                          )}
                                        </td>
                                      );
                                    case 'brokerage':
                                      return <td key="brokerage" className="px-2 py-1.5 text-[9px] text-gray-600 truncate">₹{fmt(group.totalBrokerage)}</td>;
                                    case 'govtTax':
                                      return <td key="govtTax" className="px-2 py-1.5 text-[9px] text-gray-600 truncate">₹{fmt(group.totalGovtTax)}</td>;
                                    case 'totalPnL':
                                      return (
                                        <td key="totalPnL" className="px-2 py-1.5 text-[9px] truncate">
                                          {(() => {
                                            const total = group.unrealizedPnL + group.realizedPnL - group.totalBrokerage - group.totalGovtTax;
                                            return (
                                              <span className={`font-medium ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {total >= 0 ? '+' : ''}₹{fmt(total)}
                                              </span>
                                            );
                                          })()}
                                        </td>
                                      );
                                    case 'totalPnLPct':
                                      return (
                                        <td key="totalPnLPct" className="px-2 py-1.5 text-[9px] truncate">
                                          {(() => {
                                            const total = group.unrealizedPnL + group.realizedPnL - group.totalBrokerage - group.totalGovtTax;
                                            const totalPct = group.totalBuyCost > 0 ? (total / group.totalBuyCost) * 100 : 0;
                                            return (
                                              <span className={`font-medium ${totalPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {totalPct >= 0 ? '+' : ''}{totalPct.toFixed(2)}%
                                              </span>
                                            );
                                          })()}
                                        </td>
                                      );
                                    case 'xirr':
                                      return (
                                        <td key="xirr" className={`px-2 py-1.5 text-[9px] font-bold ${group.xirr >= 0 ? 'text-green-600' : 'text-red-600'} truncate`}>
                                          {group.xirr >= 0 ? '+' : ''}{(group.xirr * 100).toFixed(2)}%
                                        </td>
                                      );
                                    case 'priceChange':
                                      return (
                                        <td key="priceChange" className={`px-2 py-1.5 text-[9px] font-medium ${group.priceChange >= 0 ? 'text-green-600' : 'text-red-600'} truncate`}>
                                          {group.priceChange >= 0 ? '+' : ''}₹{fmt(group.priceChange)}
                                        </td>
                                      );
                                    case 'changePercent':
                                      return (
                                        <td key="changePercent" className={`px-2 py-1.5 text-[9px] font-medium ${group.changePercent >= 0 ? 'text-green-600' : 'text-red-600'} truncate`}>
                                          {group.changePercent >= 0 ? '+' : ''}{group.changePercent.toFixed(2)}%
                                        </td>
                                      );
                                    case 'dayHigh':
                                      return <td key="dayHigh" className="px-2 py-1.5 text-[9px] text-zinc-900 truncate">{group.dayHigh ? `₹${fmt(group.dayHigh)}` : '—'}</td>;
                                    case 'dayLow':
                                      return <td key="dayLow" className="px-2 py-1.5 text-[9px] text-zinc-900 truncate">{group.dayLow ? `₹${fmt(group.dayLow)}` : '—'}</td>;
                                    case '52wkHigh':
                                      return <td key="52wkHigh" className="px-2 py-1.5 text-[9px] text-zinc-900 truncate">{group.fiftyTwoWeekHigh ? `₹${fmt(group.fiftyTwoWeekHigh)}` : '—'}</td>;
                                    case '52wkLow':
                                      return <td key="52wkLow" className="px-2 py-1.5 text-[9px] text-zinc-900 truncate">{group.fiftyTwoWeekLow ? `₹${fmt(group.fiftyTwoWeekLow)}` : '—'}</td>;
                                    case 'marketCap':
                                      return (
                                        <td key="marketCap" className="px-2 py-1.5 text-[9px] text-zinc-900 truncate">
                                          {group.marketCap ? `₹${(group.marketCap / 10000000).toFixed(2)} Cr` : '—'}
                                        </td>
                                      );
                                    case 'volume':
                                      return <td key="volume" className="px-2 py-1.5 text-[9px] text-zinc-900 truncate">{group.volume ? group.volume.toLocaleString() : '—'}</td>;
                                    case 'avgVolume':
                                      return <td key="avgVolume" className="px-2 py-1.5 text-[9px] text-zinc-900 truncate">{group.avgVolume ? group.avgVolume.toLocaleString() : '—'}</td>;
                                    case 'tradeValue':
                                      return (
                                        <td key="tradeValue" className="px-2 py-1.5 text-[9px] text-zinc-900 truncate">
                                          {group.tradeValue ? `₹${(group.tradeValue / 10000000).toFixed(2)} Cr` : '—'}
                                        </td>
                                      );
                                    case 'dayGain':
                                      return (
                                        <td key="dayGain" className={`px-2 py-1.5 text-[9px] font-medium ${group.dayGain >= 0 ? 'text-green-600' : 'text-red-600'} truncate`}>
                                          {group.dayGain >= 0 ? '+' : ''}₹{fmt(group.dayGain)}
                                        </td>
                                      );
                                    case 'dayGainPct':
                                      return (
                                        <td key="dayGainPct" className={`px-2 py-1.5 text-[9px] font-medium ${group.dayGainPct >= 0 ? 'text-green-600' : 'text-red-600'} truncate`}>
                                          {group.dayGainPct >= 0 ? '+' : ''}{group.dayGainPct.toFixed(2)}%
                                        </td>
                                      );
                                    default:
                                      return null;
                                  }
                                })}
                                <td className="px-2 py-1.5 text-[10px] text-right">
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteAsset(group.symbol); }} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title={`Delete ${group.symbol}`}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>

                              {/* ── Expanded detail side-by-side FIFO section ── */}
                              {isExpanded && (
                                <tr className="border-t border-b border-gray-200 bg-gray-50/70">
                                  <td colSpan={visibleColumns.size + 2} className="p-2">
                                    <div className="space-y-2">
                                      {group.fifoBuyLots.length === 0 ? (
                                        <p className="text-[10px] text-gray-400 py-2 text-center">No buy entries found.</p>
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

                                                <table className="w-full text-left text-[10px] whitespace-nowrap">
                                                  <thead>
                                                    <tr className="text-[9px] text-gray-400 uppercase border-b border-gray-100">
                                                      <th className="pb-1 font-medium">Type</th>
                                                      <th className="pb-1 font-medium">Date</th>
                                                      <th className="pb-1 font-medium">Qty</th>
                                                      <th className="pb-1 font-medium">Price</th>
                                                      <th className="pb-1 font-medium">Value</th>
                                                      <th className="pb-1 font-medium">Brokerage</th>
                                                      <th className="pb-1 font-medium">Govt Tax</th>
                                                      <th className="pb-1 font-medium">Unrealized PnL</th>
                                                      <th className="pb-1 text-right font-medium">Actions</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {/* Current Combined State Row */}
                                                    {lot.history && lot.history.length > 0 && (
                                                      <tr className="bg-blue-50/30">
                                                        <td className="py-1">
                                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-700">COMBINED</span>
                                                        </td>
                                                        <td className="py-1 text-gray-500 font-medium">
                                                          {new Date(lot.history[lot.history.length - 1].date).toLocaleDateString()}
                                                        </td>
                                                        <td className="py-1 font-bold text-gray-800">{lot.buyQty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
                                                        <td className="py-1 text-gray-600 font-semibold">₹{fmt(lot.entryPrice)}</td>
                                                        <td className="py-1 text-gray-600 font-medium">₹{fmt(lot.cost)}</td>
                                                        <td></td>
                                                        <td></td>
                                                        <td className="py-1 font-medium">
                                                          <span className={lot.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                            {lot.unrealizedPnL >= 0 ? '+' : ''}₹{fmt(lot.unrealizedPnL)}
                                                          </span>
                                                          <span className="text-[9px] ml-1 text-gray-400">({lot.unrealizedPct >= 0 ? '+' : ''}{lot.unrealizedPct.toFixed(2)}%)</span>
                                                        </td>
                                                        <td className="py-1 text-right"></td>
                                                      </tr>
                                                    )}

                                                    {/* History Events Rows */}
                                                    {[...(lot.history || [])].reverse().map((ev: any, idx: number) => {
                                                      const isBuy = ev.type === 'BUY';
                                                      const eventCost = ev.qty * (ev.price || 0);
                                                      const eventUnrealizedPnL = isBuy ? ev.qty * (group.livePrice - (ev.price || 0)) : 0;
                                                      const eventUnrealizedPct = eventCost > 0 ? (eventUnrealizedPnL / eventCost) * 100 : 0;
                                                      
                                                      return (
                                                        <tr key={`${ev.type}-${idx}`} className="border-t border-gray-100">
                                                          <td className="py-1">
                                                            {ev.type === 'BONUS' ? (
                                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-100 text-purple-700">BONUS</span>
                                                            ) : ev.type === 'SPLIT' ? (
                                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">SPLIT</span>
                                                            ) : ev.type === 'DIVIDEND' ? (
                                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-700">DIVIDEND</span>
                                                            ) : (
                                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-100 text-green-700">BUY</span>
                                                            )}
                                                          </td>
                                                          <td className="py-1 text-gray-400">{new Date(ev.date).toLocaleDateString()}</td>
                                                          <td className="py-1 font-medium text-gray-600">
                                                            {ev.type === 'SPLIT' 
                                                              ? `x${ev.qty.toFixed(2)}` 
                                                              : ev.qty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                                                          </td>
                                                          <td className="py-1 text-gray-400">
                                                            {ev.type === 'SPLIT' ? '—' : ev.type === 'DIVIDEND' ? `₹${fmt(ev.qty)}/sh` : (ev.price !== undefined ? `₹${fmt(ev.price)}` : '₹0.00')}
                                                          </td>
                                                          <td className="py-1 text-gray-600 font-medium">{eventCost > 0 ? `₹${fmt(eventCost)}` : '—'}</td>
                                                          <td className="py-1 text-gray-500 text-[10px]">
                                                            {ev.brokerage ? `₹${fmt(ev.brokerage)}` : '—'}
                                                          </td>
                                                          <td className="py-1 text-gray-500 text-[10px]">
                                                            {ev.govtTax ? `₹${fmt(ev.govtTax)}` : '—'}
                                                          </td>
                                                          <td className="py-1 font-medium">
                                                            {isBuy ? (
                                                              <>
                                                                <span className={eventUnrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}>
                                                                  {eventUnrealizedPnL >= 0 ? '+' : ''}₹{fmt(eventUnrealizedPnL)}
                                                                </span>
                                                                <span className="text-[9px] ml-1 text-gray-400">({eventUnrealizedPct >= 0 ? '+' : ''}{eventUnrealizedPct.toFixed(2)}%)</span>
                                                              </>
                                                            ) : '—'}
                                                          </td>
                                                          <td className="py-1 text-right">
                                                            {ev.id && (
                                                              <div className="flex items-center justify-end gap-1">
                                                                <button onClick={(e) => { e.stopPropagation(); setEditStockId(ev.id); }} className="p-1 text-gray-500 hover:text-zinc-900 rounded hover:bg-gray-100 transition-colors" title="Edit Entry">
                                                                  <Pencil className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteStock(ev.id); }} className="p-1 text-gray-500 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title="Delete Entry">
                                                                  <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                              </div>
                                                            )}
                                                          </td>
                                                        </tr>
                                                      );
                                                    })}
                                                    
                                                    {/* If no history (fallback for older DB structures before refactor) */}
                                                    {(!lot.history || lot.history.length === 0) && (
                                                      <tr>
                                                        <td className="py-1">
                                                          {lot.entryPrice === 0 ? (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-100 text-purple-700">BONUS</span>
                                                          ) : (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-100 text-green-700">BUY</span>
                                                          )}
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
                                                    )}
                                                  </tbody>
                                                </table>
                                              </div>

                                              {/* Right Column: Sell Positions */}
                                              <div>
                                                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-100">
                                                  <div className="flex items-center gap-1.5 font-semibold text-[10px] text-red-800">
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
                                                  <p className="text-[10px] text-gray-400 py-2 text-center">No sell entries recorded yet.</p>
                                                ) : (
                                                  <table className="w-full text-left text-[10px] whitespace-nowrap">
                                                    <thead>
                                                      <tr className="text-[9px] text-gray-400 uppercase border-b border-gray-100">
                                                        <th className="pb-1 font-medium">Type</th>
                                                        <th className="pb-1 font-medium">Date</th>
                                                        <th className="pb-1 font-medium">Qty</th>
                                                        <th className="pb-1 font-medium">Price</th>
                                                        <th className="pb-1 font-medium">Value</th>
                                                        <th className="pb-1 font-medium">Brokerage</th>
                                                        <th className="pb-1 font-medium">Govt Tax</th>
                                                        <th className="pb-1 font-medium">Realized PnL</th>
                                                        <th className="pb-1 text-right font-medium">Actions</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                      {lot.matchedSells.map((sellAlloc: any) => {
                                                        const realPnlPct = lot.entryPrice > 0 ? ((sellAlloc.exit_price - lot.entryPrice) / lot.entryPrice) * 100 : 0;
                                                        return (
                                                          <tr key={`alloc-${sellAlloc.sellId}`} className="hover:bg-red-50/40 transition-colors">
                                                            <td className="py-1">
                                                              {sellAlloc.type === 'DIVIDEND' ? (
                                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-700">DIVIDEND</span>
                                                              ) : (
                                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700">SELL</span>
                                                              )}
                                                            </td>
                                                            <td className="py-1 text-gray-500">{new Date(sellAlloc.exit_date).toLocaleDateString()}</td>
                                                            <td className="py-1 font-medium text-gray-800">{sellAlloc.quantity.toLocaleString()}</td>
                                                            <td className="py-1 text-gray-600">₹{fmt(sellAlloc.exit_price)}</td>
                                                            <td className="py-1 text-gray-600 font-medium">₹{fmt(sellAlloc.proceeds)}</td>
                                                            <td className="py-1 text-gray-500 text-[10px]">{sellAlloc.brokerage ? `₹${fmt(sellAlloc.brokerage)}` : '—'}</td>
                                                            <td className="py-1 text-gray-500 text-[10px]">{sellAlloc.govtTax ? `₹${fmt(sellAlloc.govtTax)}` : '—'}</td>
                                                            <td className="py-1 font-medium">
                                                              <span className={sellAlloc.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                                {sellAlloc.realizedPnL >= 0 ? '+' : ''}₹{fmt(sellAlloc.realizedPnL)}
                                                              </span>
                                                              {sellAlloc.type !== 'DIVIDEND' && (
                                                                <span className="text-[9px] ml-1 text-gray-400">({realPnlPct >= 0 ? '+' : ''}{realPnlPct.toFixed(2)}%)</span>
                                                              )}
                                                            </td>
                                                            <td className="py-1 text-right">
                                                              <div className="flex items-center justify-end gap-1">
                                                                <button onClick={(e) => { e.stopPropagation(); sellAlloc.type === 'DIVIDEND' ? setEditStockId(sellAlloc.sellId) : setEditSoldStockId(sellAlloc.sellId); }} className="p-1 text-gray-500 hover:text-zinc-900 rounded hover:bg-gray-100 transition-colors" title={sellAlloc.type === 'DIVIDEND' ? "Edit Dividend" : "Edit Sell"}>
                                                                  <Pencil className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); sellAlloc.type === 'DIVIDEND' ? handleDeleteStock(sellAlloc.sellId) : handleDeleteSoldStock(sellAlloc.sellId); }} className="p-1 text-gray-500 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title={sellAlloc.type === 'DIVIDEND' ? "Delete Dividend" : "Delete Sell"}>
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
                  <div className="px-4 py-2 border-t border-gray-200 bg-gray-50/50 text-[10px] text-gray-500 flex justify-between items-center">
                    <span>Click a row to expand transactions</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      </div>

      <CreatePortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={fetchData}
      />

      <AddStockModal
        isOpen={!!addStockPortfolioId}
        portfolioId={addStockPortfolioId}
        initialSymbol={addStockInitialSymbol}
        initialPrice={addStockInitialPrice}
        onClose={() => { setAddStockPortfolioId(null); setAddStockInitialSymbol(''); setAddStockInitialPrice(undefined); }}
        onAdded={fetchData}
      />

      <SellStockModal
        isOpen={!!sellStockPortfolioId}
        portfolioId={sellStockPortfolioId}
        initialSymbol={sellStockInitialSymbol}
        initialPrice={sellStockInitialPrice}
        onClose={() => { setSellStockPortfolioId(null); setSellStockInitialSymbol(''); setSellStockInitialPrice(undefined); }}
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

      <CorporateActionModal
        isOpen={corporateActionType !== null}
        onClose={() => setCorporateActionType(null)}
        type={corporateActionType}
        portfolioId={activePortfolio?.id || null}
        ownedSymbols={symbolGroups.filter(g => g.netQty > 0).map(g => g.symbol)}
        symbolGroups={symbolGroups}
        onSuccess={fetchData}
      />

      <CorporateActionsViewerModal
        isOpen={viewCorporateActionsSymbol !== null}
        onClose={() => setViewCorporateActionsSymbol(null)}
        symbol={viewCorporateActionsSymbol || ''}
        portfolioId={activePortfolioId || ''}
        onSuccess={fetchData}
      />

      <PortfolioInfoModal
        isOpen={isPortfolioInfoModalOpen}
        onClose={() => setIsPortfolioInfoModalOpen(false)}
        symbols={allSymbols.map(sym => ({ symbol: sym, name: livePrices[sym]?.name || '' }))}
        portfolioId={activePortfolioId || ''}
        onSuccess={fetchData}
      />

      <RecycleBinModal
        isOpen={isRecycleBinModalOpen}
        onClose={() => setIsRecycleBinModalOpen(false)}
        onRestore={fetchData}
      />

      {confirmationConfig && (
        <ConfirmationModal
          isOpen={confirmationConfig.isOpen}
          onClose={() => setConfirmationConfig(null)}
          onConfirm={confirmationConfig.onConfirm}
          title={confirmationConfig.title}
          message={confirmationConfig.message}
          confirmText={confirmationConfig.confirmText}
          isDestructive={confirmationConfig.isDestructive}
          requireInputToConfirm={confirmationConfig.requireInputToConfirm}
        />
      )}

      <RebalanceModal
        isOpen={isRebalanceModalOpen}
        onClose={() => setIsRebalanceModalOpen(false)}
        portfolioId={activePortfolioId || ''}
        symbolGroups={filteredSymbolGroups}
        totalCurrentValue={totalCurrentValue}
        onSuccess={() => {
          fetchData();
        }}
      />
    </div>
  )
}

export default App
