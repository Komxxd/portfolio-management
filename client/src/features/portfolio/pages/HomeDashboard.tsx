import { useNavigate } from 'react-router-dom';
import { Plus, BarChart2, Briefcase, TrendingUp, Search, ChevronDown, Check, MoreVertical, LineChart, Trash2, Loader2, Pencil, GripVertical, Columns } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../../services/api/client';
import { usePortfolioContext } from '../hooks/PortfolioContext';

import { CreatePortfolioModal } from '../components/CreatePortfolioModal';
import { RenamePortfolioModal } from '../components/RenamePortfolioModal';
import { RecycleBinModal } from '../components/RecycleBinModal';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { PerformanceChart } from '../components/PerformanceChart';

const GLOBAL_SUMMARY_STATS = [
  { id: 'totalPnL', label: 'Total Gain/Loss' },
  { id: 'totalInvested', label: 'Total Invested' },
  { id: 'maxInvestment', label: 'Max Investment' },
  { id: 'dayGain', label: 'Day Gain' },
  { id: 'unrealizedPnL', label: 'Unrealized Gain/Loss' },
  { id: 'realizedPnL', label: 'Realized Gain/Loss' },
  { id: 'currentValue', label: 'Current Value' },
  { id: 'xirr', label: 'XIRR' },
  { id: 'totalDividend', label: 'Total Dividend' },
];

const LIST_SUMMARY_STATS = [
  { id: 'totalStocks', label: 'Total Stocks' },
  { id: 'netInvested', label: 'Net Invested' },
  { id: 'unrealizedPnL', label: 'Unrealized P&L' },
  { id: 'realizedPnL', label: 'Realized P&L' },
  { id: 'totalDividend', label: 'Total Dividend' },
  { id: 'dayGain', label: 'Day Gain' },
  { id: 'totalPnL', label: 'Total P&L' },
  { id: 'currentValue', label: 'Current Value' },
  { id: 'brokerage', label: 'Total Brokerage & Tax' },
  { id: 'xirr', label: 'XIRR' }
];

function SortableMenuItem({ stat, isVisible, onToggle }: { stat: any, isVisible: boolean, onToggle: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: stat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-full flex items-center px-2 py-1 text-[9px] text-left hover:bg-background text-primary transition-colors ${isDragging ? 'bg-surface shadow-md border border-divider rounded-md' : ''}`}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="w-4 flex justify-center mr-1 shrink-0 cursor-grab active:cursor-grabbing text-secondary/50 hover:text-secondary"
      >
        <GripVertical className="w-3 h-3" />
      </div>
      <div className="w-4 flex justify-center mr-1 shrink-0 cursor-pointer" onClick={() => onToggle(stat.id)}>
        {isVisible && <Check className="w-3 h-3 text-primary" />}
      </div>
      <span className="flex-1 cursor-pointer select-none" onClick={() => onToggle(stat.id)}>{stat.label}</span>
    </div>
  );
}

function SortablePortfolioRow({ id, children }: { id: string, children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative w-full flex items-center group/row ${isDragging ? 'bg-surface shadow-lg border border-divider rounded-lg' : ''}`}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="px-2 py-3 shrink-0 cursor-grab active:cursor-grabbing text-secondary/30 hover:text-secondary transition-opacity flex items-center justify-center"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}

export function HomeDashboard() {
  const { portfolios, setPortfolios, stocks, setIsCreateModalOpen, isCreateModalOpen, fetchData } = usePortfolioContext();
  const navigate = useNavigate();
  const [homeStats, setHomeStats] = useState<any>(null);
  const [portfolioSummaries, setPortfolioSummaries] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [isChartVisible, setIsChartVisible] = useState(false);
  
  const [selectedSummaryPortfolioIds, setSelectedSummaryPortfolioIds] = useState<string[] | null>(null);
  const [isSummaryDropdownOpen, setIsSummaryDropdownOpen] = useState(false);
  const summaryDropdownRef = useRef<HTMLDivElement>(null);

  // Global Summary Layout State
  const [globalSummaryOrder, setGlobalSummaryOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('home_global_summary_order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        const existingIds = new Set(order);
        const missingStats = GLOBAL_SUMMARY_STATS.map(s => s.id).filter(id => !existingIds.has(id));
        return [...order, ...missingStats];
      } catch (e) {}
    }
    return GLOBAL_SUMMARY_STATS.map(s => s.id);
  });
  const [globalVisibleStats, setGlobalVisibleStats] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('home_global_summary_visible');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {}
    }
    return new Set(GLOBAL_SUMMARY_STATS.map(s => s.id));
  });
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);
  const globalSettingsRef = useRef<HTMLDivElement>(null);

  // List Summary Layout State
  const [listSummaryOrder, setListSummaryOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('home_portfolio_list_summary_order');
    if (saved) {
      try {
        const order = JSON.parse(saved);
        const existingIds = new Set(order);
        const missingStats = LIST_SUMMARY_STATS.map(s => s.id).filter(id => !existingIds.has(id));
        return [...order, ...missingStats];
      } catch (e) {}
    }
    return LIST_SUMMARY_STATS.map(s => s.id);
  });
  const [listVisibleStats, setListVisibleStats] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('home_portfolio_list_summary_visible');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {}
    }
    return new Set(LIST_SUMMARY_STATS.map(s => s.id));
  });
  const [isListSettingsOpen, setIsListSettingsOpen] = useState(false);
  const listSettingsRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
    localStorage.setItem('home_global_summary_order', JSON.stringify(globalSummaryOrder));
  }, [globalSummaryOrder]);
  useEffect(() => {
    localStorage.setItem('home_global_summary_visible', JSON.stringify(Array.from(globalVisibleStats)));
  }, [globalVisibleStats]);

  useEffect(() => {
    localStorage.setItem('home_portfolio_list_summary_order', JSON.stringify(listSummaryOrder));
  }, [listSummaryOrder]);
  useEffect(() => {
    localStorage.setItem('home_portfolio_list_summary_visible', JSON.stringify(Array.from(listVisibleStats)));
  }, [listVisibleStats]);

  const [portfolioOrder, setPortfolioOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('home_portfolio_order');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });

  useEffect(() => {
    setPortfolioOrder(prev => {
      const actualIds = portfolios.map(p => p.id);
      const newOrder = prev.filter(id => actualIds.includes(id));
      actualIds.forEach(id => {
        if (!newOrder.includes(id)) newOrder.push(id);
      });
      return newOrder;
    });
  }, [portfolios]);

  useEffect(() => {
    localStorage.setItem('home_portfolio_order', JSON.stringify(portfolioOrder));
  }, [portfolioOrder]);

  const handlePortfolioDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPortfolioOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Modal states
  const [renamePortfolioId, setRenamePortfolioId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);
  const [isRecycleBinModalOpen, setIsRecycleBinModalOpen] = useState(false);
  const [confirmationConfig, setConfirmationConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    isDestructive?: boolean;
    requireInputToConfirm?: string;
  } | null>(null);

  const handleDeletePortfolio = async (id: string) => {
    try {
      await api.delete(`/api/portfolios/${id}`);
      setPortfolios(prev => prev.filter(p => p.id !== id));
      await fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyPortfolio = async (id: string) => {
    try {
      const p = portfolios.find(p => p.id === id);
      if (!p) return;
      await api.post(`/api/portfolios`, { name: `${p.name} (Copy)` });
      await fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (summaryDropdownRef.current && !summaryDropdownRef.current.contains(event.target as Node)) {
        setIsSummaryDropdownOpen(false);
      }
      if (globalSettingsRef.current && !globalSettingsRef.current.contains(event.target as Node)) {
        setIsGlobalSettingsOpen(false);
      }
      if (listSettingsRef.current && !listSettingsRef.current.contains(event.target as Node)) {
        setIsListSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGlobalDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setGlobalSummaryOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleListDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setListSummaryOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleGlobalStat = (id: string) => {
    setGlobalVisibleStats(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const toggleListStat = (id: string) => {
    setListVisibleStats(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  useEffect(() => {
    if (portfolios.length > 0 && selectedSummaryPortfolioIds === null) {
      setSelectedSummaryPortfolioIds(portfolios.map(p => p.id));
    }
  }, [portfolios, selectedSummaryPortfolioIds]);

  useEffect(() => {
    if (selectedSummaryPortfolioIds === null) return;

    const fetchStats = async () => {
      try {
        const queryParams = new URLSearchParams();
        if (selectedSummaryPortfolioIds.length > 0) {
          queryParams.set('portfolioIds', selectedSummaryPortfolioIds.join(','));
        } else {
          queryParams.set('portfolioIds', 'NONE');
        }
        const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';
        const result = await api.get(`/api/calculations/dashboard/stats${qs}`);
        setHomeStats(result?.summary || null);
        setPortfolioSummaries(result?.portfolioSummaries || {});
      } catch (err) {
        console.error('Failed to fetch dashboard stats', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [portfolios, stocks, selectedSummaryPortfolioIds]); // Re-fetch when underlying data changes

  const toggleSummaryPortfolioSelection = (id: string) => {
    setSelectedSummaryPortfolioIds(prev => {
      if (!prev) return [id];
      if (prev.includes(id)) {
        return prev.filter(pId => pId !== id);
      }
      return [...prev, id];
    });
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-tertiary" /></div>;
  }

  if (!homeStats) return null;

  const renderGlobalStat = (id: string) => {
    if (!globalVisibleStats.has(id)) return null;
    switch (id) {
      case 'totalPnL': return (
          <div key="totalPnL" className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Total Gain/Loss</span>
            <span className={`text-[15px] font-semibold ${homeStats.totalPnL >= 0 ? 'text-success' : 'text-danger'}`}>
              {homeStats.totalPnL >= 0 ? '+' : ''}₹{homeStats.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-1.5 text-xs opacity-90 font-medium">({homeStats.totalPnLPercent >= 0 ? '+' : ''}{homeStats.totalPnLPercent.toFixed(2)}%)</span>
            </span>
          </div>
      );
      case 'totalInvested': return (
          <div key="totalInvested" className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Total Invested</span>
            <span className="text-[15px] font-semibold text-primary">₹{homeStats.totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
      );
      case 'maxInvestment': return (
          <div key="maxInvestment" className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Max Investment</span>
            <span className="text-[15px] font-semibold text-primary">₹{homeStats.maxNetInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
      );
      case 'dayGain': return (
          <div key="dayGain" className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Day Gain</span>
            <span className={`text-[15px] font-semibold ${homeStats.totalDayGain >= 0 ? 'text-success' : 'text-danger'}`}>
              {homeStats.totalDayGain >= 0 ? '+' : ''}₹{(homeStats.totalDayGain || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-1.5 opacity-90 text-sm font-medium">
                ({homeStats.totalDayGainPercent >= 0 ? '+' : ''}{(homeStats.totalDayGainPercent || 0).toFixed(2)}%)
              </span>
            </span>
          </div>
      );
      case 'unrealizedPnL': return (
          <div key="unrealizedPnL" className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Unrealized Gain/Loss</span>
            <span className={`text-[15px] font-semibold ${homeStats.totalUnrealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
              {homeStats.totalUnrealizedPnL >= 0 ? '+' : ''}₹{homeStats.totalUnrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-1.5 opacity-90 text-sm font-medium">
                ({homeStats.totalUnrealizedPnL >= 0 ? '+' : ''}{homeStats.totalInvestment > 0 ? ((homeStats.totalUnrealizedPnL / homeStats.totalInvestment) * 100).toFixed(2) : '0.00'}%)
              </span>
            </span>
          </div>
      );
      case 'realizedPnL': return (
          <div key="realizedPnL" className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Realized Gain/Loss</span>
            <span className={`text-[15px] font-semibold ${homeStats.totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
              {homeStats.totalRealizedPnL >= 0 ? '+' : ''}₹{homeStats.totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
      );
      case 'currentValue': return (
          <div key="currentValue" className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Current Value</span>
            <span className="text-[15px] font-semibold text-primary">₹{homeStats.totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
      );
      case 'xirr': return (
          <div key="xirr" className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">XIRR</span>
            <span className={`text-[15px] font-semibold ${(homeStats.xirr || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
              {(homeStats.xirr || 0) >= 0 ? '+' : ''}{((homeStats.xirr || 0) * 100).toFixed(2)}%
            </span>
          </div>
      );
      case 'totalDividend': return (
          <div key="totalDividend" className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Total Dividend</span>
            <span className="text-[15px] font-semibold text-primary">
              ₹{homeStats.totalDividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-1.5 opacity-90 text-sm font-medium text-success">
                ({homeStats.totalInvestment > 0 ? ((homeStats.totalDividend / homeStats.totalInvestment) * 100).toFixed(2) : '0.00'}%)
              </span>
            </span>
          </div>
      );
      default: return null;
    }
  };

  return (
    <div className="flex flex-col">
      {/* Summary Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3 mt-6">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-primary">Summary</h2>
          <div className="relative z-40" ref={summaryDropdownRef}>
            <button 
              onClick={() => setIsSummaryDropdownOpen(!isSummaryDropdownOpen)}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity bg-surface px-2 py-1 rounded border border-divider"
            >
              {selectedSummaryPortfolioIds === null || selectedSummaryPortfolioIds.length === portfolios.length 
                ? 'All Portfolios' 
                : selectedSummaryPortfolioIds.length === 1 
                  ? portfolios.find(p => p.id === selectedSummaryPortfolioIds[0])?.name || 'Selected'
                  : selectedSummaryPortfolioIds.length === 0 
                    ? 'None Selected'
                    : `${selectedSummaryPortfolioIds.length} Portfolios Selected`}
              <ChevronDown className="w-3.5 h-3.5 text-secondary" />
            </button>
            
            {isSummaryDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-56 bg-surface border border-divider rounded-lg shadow-xl shadow-black/20 py-1 max-h-64 overflow-y-auto z-50">
                <button
                  onClick={() => {
                    const allSelected = selectedSummaryPortfolioIds?.length === portfolios.length;
                    if (allSelected) {
                      setSelectedSummaryPortfolioIds([]);
                    } else {
                      setSelectedSummaryPortfolioIds(portfolios.map(p => p.id));
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center gap-2 border-b border-divider text-primary hover:bg-surface-hover font-medium mb-1"
                >
                  <div className={`w-3.5 h-3.5 shrink-0 rounded-sm border ${selectedSummaryPortfolioIds?.length === portfolios.length ? 'bg-primary border-primary flex items-center justify-center' : 'border-secondary'}`}>
                    {selectedSummaryPortfolioIds?.length === portfolios.length && <Check className="w-2.5 h-2.5 text-background" />}
                  </div>
                  <span>{selectedSummaryPortfolioIds?.length === portfolios.length ? 'Unselect All' : 'Select All'}</span>
                </button>
                {portfolios.map(p => {
                  const isSelected = selectedSummaryPortfolioIds?.includes(p.id) || false;
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleSummaryPortfolioSelection(p.id)}
                      className={`w-full text-left px-4 py-2 text-xs transition-colors flex items-center gap-2 truncate ${isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-secondary hover:bg-surface-hover hover:text-primary'}`}
                      title={p.name}
                    >
                      <div className={`w-3.5 h-3.5 shrink-0 rounded-sm border ${isSelected ? 'bg-primary border-primary flex items-center justify-center' : 'border-secondary'}`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-background" />}
                      </div>
                      <span className="truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsChartVisible(!isChartVisible)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors rounded border ${isChartVisible ? 'bg-surface-hover text-primary border-primary' : 'text-secondary hover:text-primary hover:bg-surface-hover border-divider'}`}
          >
            <LineChart className="w-4 h-4" />
            Chart
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-background hover:opacity-90 transition-opacity rounded"
          >
            <Plus className="w-4 h-4" />
            Create New Portfolio
          </button>
          <button
            onClick={() => setIsRecycleBinModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-secondary hover:text-primary hover:bg-surface-hover transition-colors rounded border border-divider"
          >
            <Trash2 className="w-4 h-4" />
            Bin
          </button>
          
          <div className="relative flex" ref={globalSettingsRef}>
            <button
              onClick={() => setIsGlobalSettingsOpen(!isGlobalSettingsOpen)}
              className="flex items-center justify-center w-8 h-8 bg-surface hover:bg-surface-hover border border-divider rounded text-secondary hover:text-primary transition-colors"
              title="Customize Summary"
            >
              <Columns className="w-4 h-4" />
            </button>
            
            {isGlobalSettingsOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface border border-divider rounded-lg shadow-xl shadow-black/20 py-1 max-h-64 overflow-y-auto z-50">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleGlobalDragEnd}
                >
                  <SortableContext items={globalSummaryOrder} strategy={verticalListSortingStrategy}>
                    {globalSummaryOrder.map(id => {
                      const stat = GLOBAL_SUMMARY_STATS.find(s => s.id === id);
                      if (!stat) return null;
                      return (
                        <SortableMenuItem
                          key={id}
                          stat={stat}
                          isVisible={globalVisibleStats.has(id)}
                          onToggle={toggleGlobalStat}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="w-full bg-surface border border-divider rounded-lg shadow-sm p-4 mb-4 mt-2">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          {globalSummaryOrder.map(renderGlobalStat)}
        </div>
      </div>
      
      {isChartVisible && <PerformanceChart selectedPortfolioId={selectedSummaryPortfolioIds?.length ? selectedSummaryPortfolioIds.join(',') : 'NONE'} />}

      {/* Portfolio List */}
      <div className="mt-4 mb-4">
        <div className="px-2 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary">My Portfolios</h3>
          
          <div className="relative flex" ref={listSettingsRef}>
            <button
              onClick={() => setIsListSettingsOpen(!isListSettingsOpen)}
              className="flex items-center justify-center w-8 h-8 bg-surface hover:bg-surface-hover border border-divider rounded text-secondary hover:text-primary transition-colors"
              title="Customize Summary"
            >
              <Columns className="w-4 h-4" />
            </button>
            
            {isListSettingsOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface border border-divider rounded-lg shadow-xl shadow-black/20 py-1 max-h-64 overflow-y-auto z-50">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleListDragEnd}
                >
                  <SortableContext items={listSummaryOrder} strategy={verticalListSortingStrategy}>
                    {listSummaryOrder.map(id => {
                      const stat = LIST_SUMMARY_STATS.find(s => s.id === id);
                      if (!stat) return null;
                      return (
                        <SortableMenuItem
                          key={id}
                          stat={stat}
                          isVisible={listVisibleStats.has(id)}
                          onToggle={toggleListStat}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>
        </div>
        {portfolios.length > 0 ? (
          <div className="flex flex-col gap-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handlePortfolioDragEnd}
            >
              <SortableContext items={portfolioOrder} strategy={verticalListSortingStrategy}>
                {portfolioOrder.map(pid => {
                  const p = portfolios.find(p => p.id === pid);
                  if (!p) return null;
                  
                  const pStocks = stocks.filter(s => s.portfolio_id === p.id && Number(s.entry_price) > 0);
                  const pSymbols = [...new Set(pStocks.map(s => s.symbol))];
                  const ps = portfolioSummaries[p.id];

                  const renderMiniCard = (label: string, value: React.ReactNode, valueClass: string = "text-primary", key: string) => (
                    <div key={key} className="bg-background px-2.5 py-1.5 flex flex-col justify-center rounded-sm min-w-[110px]">
                      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium text-secondary mb-[1px]">
                        <span className="whitespace-nowrap truncate">{label}</span>
                      </div>
                      <div className={`text-xs font-bold truncate ${valueClass}`}>{value}</div>
                    </div>
                  );

                  const renderListStat = (id: string, ps: any, pSymbols: any) => {
                    if (!listVisibleStats.has(id)) return null;
                    switch (id) {
                      case 'totalStocks': return renderMiniCard("Total Stocks", pSymbols.length, "text-primary", id);
                      case 'netInvested': return renderMiniCard("Net Invested", `₹${ps.totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "text-primary", id);
                      case 'unrealizedPnL': return renderMiniCard(
                        `Unrealized PnL`,
                        <span>{ps.totalUnrealizedPnL >= 0 ? '+' : ''}₹{ps.totalUnrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[9px] font-medium opacity-80">({ps.totalUnrealizedPnL >= 0 ? '+' : ''}{ps.unrealizedPnLPercent.toFixed(2)}%)</span></span>,
                        ps.totalUnrealizedPnL >= 0 ? 'text-success' : 'text-danger',
                        id
                      );
                      case 'realizedPnL': return renderMiniCard(
                        "Realized PnL",
                        `${ps.totalRealizedPnL >= 0 ? '+' : ''}₹${ps.totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        ps.totalRealizedPnL >= 0 ? 'text-success' : 'text-danger',
                        id
                      );
                      case 'totalDividend': return renderMiniCard(
                        `Dividend`,
                        <span>₹{ps.totalDividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[9px] font-medium opacity-80">({ps.totalInvestment > 0 ? ((ps.totalDividend / ps.totalInvestment) * 100).toFixed(2) : '0.00'}%)</span></span>,
                        "text-primary",
                        id
                      );
                      case 'dayGain': return renderMiniCard(
                        `Day Gain`,
                        <span>{ps.totalDayGain >= 0 ? '+' : ''}₹{(ps.totalDayGain || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[9px] font-medium opacity-80">({ps.totalDayGainPercent >= 0 ? '+' : ''}{ps.totalDayGainPercent.toFixed(2)}%)</span></span>,
                        ps.totalDayGain >= 0 ? 'text-success' : 'text-danger',
                        id
                      );
                      case 'totalPnL': return renderMiniCard(
                        `Total PnL`,
                        <span>{ps.totalPnL >= 0 ? '+' : ''}₹{ps.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[9px] font-medium opacity-80">({ps.totalPnLPercent >= 0 ? '+' : ''}{ps.totalPnLPercent.toFixed(2)}%)</span></span>,
                        ps.totalPnL >= 0 ? 'text-success' : 'text-danger',
                        id
                      );
                      case 'currentValue': return renderMiniCard(
                        "Current Value",
                        `₹${ps.totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        "text-primary",
                        id
                      );
                      case 'brokerage': return renderMiniCard(
                        "Brokerage & Tax",
                        `-₹${((ps.totalBrokerage || 0) + (ps.totalGovtTax || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        "text-danger",
                        id
                      );
                      case 'xirr': return renderMiniCard(
                        "XIRR",
                        `${ps.xirr >= 0 ? '+' : ''}${(ps.xirr * 100).toFixed(2)}%`,
                        ps.xirr >= 0 ? 'text-success' : 'text-danger',
                        id
                      );
                      default: return null;
                    }
                  };

                  return (
                    <SortablePortfolioRow key={p.id} id={p.id}>
                      <div className="w-full flex flex-col xl:flex-row xl:items-center justify-between px-3 py-3 hover:bg-surface-hover rounded-lg transition-colors group">
                        <div className="flex flex-col xl:flex-row xl:items-center flex-1 cursor-pointer" onClick={() => navigate(`/portfolio/${p.id}`)}>
                          <div className="flex items-center shrink-0">
                            <div className="min-w-[120px]">
                              <p 
                                className="text-sm font-medium text-primary group-hover:underline decoration-tertiary underline-offset-2 whitespace-nowrap"
                                title={p.name}
                              >
                                {p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name}
                              </p>
                              <p className="text-[11px] text-tertiary">{pSymbols.length} asset{pSymbols.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>

                          {ps && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-10 gap-2 mt-4 xl:mt-0 xl:ml-6 flex-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              {listSummaryOrder.map(id => renderListStat(id, ps, pSymbols))}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 relative mt-4 xl:mt-0 xl:ml-4 shrink-0 self-end xl:self-auto">
                          <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setSelectedSummaryPortfolioIds([p.id]);
                              setIsChartVisible(true);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="p-1.5 text-tertiary hover:text-primary hover:bg-surface-hover rounded transition-colors"
                            title="Show Chart"
                          >
                            <LineChart className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === p.id ? null : p.id); }}
                            className="p-1.5 text-tertiary hover:text-primary hover:bg-surface-hover rounded transition-colors"
                            title="Options"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {activeMenuId === p.id && (
                            <div className="absolute right-0 top-full mt-1 w-36 bg-surface border border-divider rounded-lg shadow-xl shadow-black/20 z-50 py-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => { setRenamePortfolioId(p.id); setActiveMenuId(null); }}
                                className="w-full text-left px-4 py-2 text-xs text-secondary hover:bg-background hover:text-primary transition-colors"
                              >
                                Rename
                              </button>
                              <button
                                onClick={() => { handleCopyPortfolio(p.id); setActiveMenuId(null); }}
                                className="w-full text-left px-4 py-2 text-xs text-secondary hover:bg-background hover:text-primary transition-colors"
                              >
                                Duplicate
                              </button>
                              <button
                                onClick={() => {
                                  setConfirmationConfig({
                                    isOpen: true,
                                    title: 'Delete Portfolio',
                                    message: `Are you sure you want to delete "${p.name}"? This action cannot be undone.`,
                                    confirmText: 'Delete Portfolio',
                                    isDestructive: true,
                                    requireInputToConfirm: p.name,
                                    onConfirm: () => {
                                      handleDeletePortfolio(p.id);
                                      setConfirmationConfig(null);
                                    }
                                  });
                                  setActiveMenuId(null);
                                }}
                                className="w-full text-left px-4 py-2 text-xs text-danger hover:bg-danger/10 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </SortablePortfolioRow>
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-surface-hover rounded-xl flex items-center justify-center mb-4">
              <Briefcase className="w-6 h-6 text-tertiary" />
            </div>
            <p className="text-sm text-secondary mb-2">No active portfolio.</p>
            <p className="text-xs text-tertiary max-w-xs mb-4">Create your first portfolio to start tracking your investments.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreatePortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => fetchData()}
      />

      <RenamePortfolioModal
        isOpen={!!renamePortfolioId}
        onClose={() => setRenamePortfolioId(null)}
        onRenamed={() => fetchData()}
        portfolioId={renamePortfolioId}
        currentName={portfolios.find(p => p.id === renamePortfolioId)?.name || ''}
      />

      <RecycleBinModal
        isOpen={isRecycleBinModalOpen}
        onClose={() => setIsRecycleBinModalOpen(false)}
        onRestore={() => fetchData()}
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
    </div>
  );
}
