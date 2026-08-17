import { useNavigate } from 'react-router-dom';
import { Briefcase, ChevronRight, Loader2, Pencil, Plus, Trash2, MoreVertical } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api/client';
import { usePortfolioContext } from '../hooks/PortfolioContext';

import { CreatePortfolioModal } from '../components/CreatePortfolioModal';
import { RenamePortfolioModal } from '../components/RenamePortfolioModal';
import { RecycleBinModal } from '../components/RecycleBinModal';
import { ConfirmationModal } from '../../../components/ui/ConfirmationModal';
import { PerformanceChart } from '../components/PerformanceChart';

export function HomeDashboard() {
  const { portfolios, setPortfolios, stocks, setIsCreateModalOpen, isCreateModalOpen, fetchData } = usePortfolioContext();
  const navigate = useNavigate();
  const [homeStats, setHomeStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    const fetchStats = async () => {
      try {
        const result = await api.get('/api/calculations/dashboard/stats');
        setHomeStats(result?.summary || null);
      } catch (err) {
        console.error('Failed to fetch dashboard stats', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [portfolios, stocks]); // Re-fetch when underlying data changes

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-tertiary" /></div>;
  }

  if (!homeStats) return null;

  return (
    <div className="flex flex-col">
      {/* Hero Summary */}
      <div className="p-6 mb-4 mt-2">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-xs font-medium text-secondary mb-1">Total Gain/Loss</h2>
            <div className="flex items-baseline gap-3">
              <h1 className={`text-3xl font-bold tracking-tight ${homeStats.totalPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                {homeStats.totalPnL >= 0 ? '+' : ''}₹{homeStats.totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h1>
              <span className={`text-lg font-semibold opacity-90 ${homeStats.totalPnLPercent >= 0 ? 'text-success' : 'text-danger'}`}>
                ({homeStats.totalPnLPercent >= 0 ? '+' : ''}{homeStats.totalPnLPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <div className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Total Invested</span>
            <span className="text-[15px] font-semibold text-primary">₹{homeStats.totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          <div className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Max Investment</span>
            <span className="text-[15px] font-semibold text-primary">₹{homeStats.maxNetInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          <div className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Day Gain</span>
            <span className={`text-[15px] font-semibold ${homeStats.totalDayGain >= 0 ? 'text-success' : 'text-danger'}`}>
              {homeStats.totalDayGain >= 0 ? '+' : ''}₹{(homeStats.totalDayGain || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-1.5 opacity-90 text-sm font-medium">
                ({homeStats.totalDayGainPercent >= 0 ? '+' : ''}{(homeStats.totalDayGainPercent || 0).toFixed(2)}%)
              </span>
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Unrealized Gain/Loss</span>
            <span className={`text-[15px] font-semibold ${homeStats.totalUnrealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
              {homeStats.totalUnrealizedPnL >= 0 ? '+' : ''}₹{homeStats.totalUnrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-1.5 opacity-90 text-sm font-medium">
                ({homeStats.totalUnrealizedPnL >= 0 ? '+' : ''}{homeStats.totalInvestment > 0 ? ((homeStats.totalUnrealizedPnL / homeStats.totalInvestment) * 100).toFixed(2) : '0.00'}%)
              </span>
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Realized Gain/Loss</span>
            <span className={`text-[15px] font-semibold ${homeStats.totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}`}>
              {homeStats.totalRealizedPnL >= 0 ? '+' : ''}₹{homeStats.totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Current Value</span>
            <span className="text-[15px] font-semibold text-primary">
              ₹{homeStats.totalCurrentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">XIRR</span>
            <span className={`text-[15px] font-semibold ${homeStats.xirr >= 0 ? 'text-success' : 'text-danger'}`}>
              {homeStats.xirr >= 0 ? '+' : ''}{(homeStats.xirr * 100).toFixed(2)}%
            </span>
          </div>
          
          <div className="flex flex-col">
            <span className="text-xs text-secondary mb-1 flex items-center gap-1">Total Dividend</span>
            <span className="text-[15px] font-semibold text-primary">
              ₹{homeStats.totalDividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-1.5 opacity-90 text-sm font-medium text-success">
                ({homeStats.totalInvestment > 0 ? ((homeStats.totalDividend / homeStats.totalInvestment) * 100).toFixed(2) : '0.00'}%)
              </span>
            </span>
          </div>
        </div>
      </div>
      
      <PerformanceChart />

      {/* Portfolio List */}
      <div className="mt-4 mb-4">
        <div className="px-2 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-primary">My Portfolios</h3>
        </div>
        {portfolios.length > 0 ? (
          <div className="flex flex-col space-y-1">
            {portfolios.map(p => {
              const pStocks = stocks.filter(s => s.portfolio_id === p.id && Number(s.entry_price) > 0);
              const pSymbols = [...new Set(pStocks.map(s => s.symbol))];
              return (
                <div
                  key={p.id}
                  className="w-full flex items-center justify-between px-3 py-3 hover:bg-surface-hover rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => navigate(`/portfolio/${p.id}`)}>
                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-divider">
                      <Briefcase className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-primary group-hover:underline decoration-tertiary underline-offset-2">{p.name}</p>
                      <p className="text-[11px] text-tertiary">{pSymbols.length} asset{pSymbols.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 relative">
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
              );
            })}
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
