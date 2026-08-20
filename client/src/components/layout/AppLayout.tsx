import React, { useState, useEffect, useRef } from 'react'
import { Plus, Briefcase, Trash2, Pencil, ChevronRight, ChevronDown, Info, User, LogOut, Folder, Home, RefreshCw, Sun, Moon } from 'lucide-react'
import { api } from '../../services/api/client'
import { usePortfolioContext } from '../../features/portfolio/hooks/PortfolioContext'
import { useTheme } from '../../app/providers/ThemeProvider'
import { useAuth } from '../../app/providers/AuthProvider'
import { useNavigate, useLocation, useParams, Outlet } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'
import { MarketTicker } from './MarketTicker'

import { CreatePortfolioModal } from '../../features/portfolio/components/CreatePortfolioModal'
import { ConfirmationModal } from '../ui/ConfirmationModal'

export function AppLayout() {
  const { session, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const {
    portfolios,
    setPortfolios,
    stocks,
    soldStocks,
    pricesLoading,
    handleManualRefresh,
    isCreateModalOpen,
    setIsCreateModalOpen,
    fetchData
  } = usePortfolioContext();

  const location = useLocation();
  const navigate = useNavigate();

  const isPortfolioPage = location.pathname.startsWith('/portfolio/');
  const portfolioId = isPortfolioPage ? location.pathname.split('/')[2] : null;
  const portfolioName = portfolioId ? portfolios.find(p => p.id === portfolioId)?.name : null;

  // Derive unique stock symbols for manual refresh
  const allStockSymbols = [...new Set([...stocks.map(s => s.symbol), ...soldStocks.map(s => s.symbol)])];

  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [isPortfolioMenuOpen, setIsPortfolioMenuOpen] = useState(false);
  const portfolioMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
      if (portfolioMenuRef.current && !portfolioMenuRef.current.contains(event.target as Node)) {
        setIsPortfolioMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!loading && !session) {
      navigate('/login');
    }
  }, [session, loading, navigate]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-divider border-t-zinc-900 rounded-full animate-spin" /></div>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-background text-primary font-sans overflow-hidden">
      <MarketTicker />
      {/* Unified Top Header */}
      <header className="h-16 bg-surface border-b border-divider px-4 flex items-center justify-between shrink-0 z-10 w-full">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center shrink-0 cursor-pointer" onClick={() => navigate('/portfolios')}>
              <img src="/favicon.svg" alt="Logo" className="w-8 h-8" />
              <span className="ml-2 font-bold text-sm tracking-tight text-primary">Portfolio</span>
            </div>

            <div className="flex-1 max-w-md">
              <GlobalSearch />
            </div>

            <nav className="hidden md:flex items-center gap-2 ml-2">
              <button
                onClick={() => navigate('/portfolios')}
                className={`text-sm font-medium transition-colors focus:outline-none ${location.pathname === '/portfolios' ? 'text-primary' : 'text-secondary hover:text-primary'}`}
              >
                My Portfolio
              </button>
              {portfolioName && (
                <div className="relative flex items-center" ref={portfolioMenuRef}>
                  <ChevronRight className="w-4 h-4 text-tertiary" />
                  <button 
                    onClick={() => setIsPortfolioMenuOpen(!isPortfolioMenuOpen)}
                    className="flex items-center gap-1 ml-1 px-2 py-1 rounded hover:bg-surface-hover transition-colors focus:outline-none"
                  >
                    <span className="text-sm font-semibold text-primary">{portfolioName}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-secondary" />
                  </button>
                  {isPortfolioMenuOpen && (
                    <div className="absolute top-full left-5 mt-1 min-w-[200px] max-w-sm bg-surface border border-divider rounded-lg py-1 z-50 shadow-2xl shadow-black/50">
                      {portfolios.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setIsPortfolioMenuOpen(false);
                            navigate(`/portfolio/${p.id}`);
                          }}
                          className={`w-full text-left px-4 py-1.5 text-xs transition-colors ${
                            p.id === portfolioId 
                              ? 'text-primary bg-surface-hover font-medium' 
                              : 'text-secondary hover:bg-background hover:text-primary'
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors border bg-surface-hover text-secondary border-divider hover:bg-divider"
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => handleManualRefresh(allStockSymbols.join(','))}
              disabled={pricesLoading}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors border bg-surface-hover text-secondary border-divider hover:bg-divider ${pricesLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Refresh Portfolio & Prices"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${pricesLoading ? 'animate-spin text-primary' : ''}`} />
            </button>

            <div className="relative group" ref={accountMenuRef}>
              <button
                onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                title="Account Settings"
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors border ${isAccountMenuOpen
                  ? 'bg-surface text-primary border-zinc-900'
                  : 'bg-surface-hover text-secondary border-divider hover:bg-divider'
                  }`}
              >
                <User className="w-4 h-4" />
              </button>



              {isAccountMenuOpen && (
                <div className="absolute right-0 mt-2 min-w-[240px] max-w-sm bg-surface border border-divider rounded-lg py-1 z-50 shadow-2xl shadow-black/50 shadow-black/40 shadow-gray-400/30">
                  <div className="px-4 py-3 border-b border-divider">
                    <p className="text-[10px] text-secondary mb-0.5 uppercase tracking-wide">Signed in as</p>
                    <p className="text-xs font-medium text-primary truncate">
                      {session?.user?.email}
                    </p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={async () => {
                        await api.post('/api/auth/logout', {});
                        localStorage.removeItem('auth_token');
                        window.location.href = '/';
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-secondary hover:bg-background hover:text-primary flex items-center gap-2"
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

      {/* Full-width scrollable container */}
      <div className="flex-1 w-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Main Content constraints */}
        <div className="flex flex-col flex-1 w-full max-w-[1600px] mx-auto bg-background min-h-full">
          <main className="flex-1 flex flex-col min-w-0 bg-background relative z-0">
            <div className="flex-1 p-2 md:p-4 flex flex-col">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
