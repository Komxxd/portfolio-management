import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Plus, Trash2, Loader2, Sliders } from 'lucide-react';
import { api } from '../../../services/api/client';
import {
  type StrategyRule,
  type StrategyCondition,
  BLANK_RULE,
  formatRuleFormula
} from './strategyTypes';

interface StrategyBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  stocks?: Array<{ id: string; symbol: string; quantity: number; entry_price: number; portfolio_id?: string }>;
  currencySymbol?: string;
}

const CATEGORIES = [
  { id: 'builder', name: 'Global Strategy' },
  { id: 'active', name: 'Saved Strategies' }
];

export function StrategyBuilderModal({
  isOpen,
  onClose,
  portfolioId,
  stocks = [],
  currencySymbol = '₹'
}: StrategyBuilderModalProps) {
  const [activeTab, setActiveTab] = useState<'builder' | 'active'>('builder');
  const [currentRule, setCurrentRule] = useState<StrategyRule>(BLANK_RULE);
  const [savedRules, setSavedRules] = useState<StrategyRule[]>([]);
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  const storageKey = `portfolio_strategies_${portfolioId || 'global'}`;

  // 1. Fetch saved strategies on modal open
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    async function fetchStrategies() {
      setIsLoading(true);
      setApiNotice(null);
      try {
        const data = await api.get(`/api/strategies?portfolio_id=${portfolioId || ''}`);
        if (Array.isArray(data) && isMounted) {
          const cleaned = data.filter((r: any) => r.id !== 'rule-default');
          setSavedRules(cleaned);
          localStorage.setItem(storageKey, JSON.stringify(cleaned));
          setIsLoading(false);
          return;
        }
      } catch (err: any) {
        console.warn('API fetch failed, falling back to local cache', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }

      // Offline localStorage fallback
      try {
        const cached = localStorage.getItem(storageKey);
        if (cached && isMounted) {
          setSavedRules(JSON.parse(cached));
        }
      } catch {}
    }

    fetchStrategies();
    return () => { isMounted = false; };
  }, [isOpen, portfolioId, storageKey]);

  const uniqueSymbols = useMemo(() => {
    const list = portfolioId
      ? stocks.filter(s => !s.portfolio_id || s.portfolio_id === portfolioId)
      : stocks;
    return Array.from(new Set(list.map(s => s.symbol))).sort();
  }, [stocks, portfolioId]);

  // Handlers
  const handleCopyFormula = () => {
    navigator.clipboard.writeText(formatRuleFormula(currentRule));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveRule = async () => {
    setIsSaving(true);
    setApiNotice(null);

    const isGlobal = currentRule.scope === 'global' || !portfolioId;
    const payload = {
      portfolioId: isGlobal ? null : portfolioId,
      name: currentRule.name.trim() || 'Untitled Strategy',
      scope: currentRule.scope || 'global',
      targetSymbol: currentRule.targetSymbol || 'ALL',
      action: currentRule.action || 'BUY',
      sizingType: currentRule.sizingType || 'QTY',
      sizingValue: currentRule.sizingValue !== '' && currentRule.sizingValue !== undefined && currentRule.sizingValue !== null
        ? Number(currentRule.sizingValue)
        : null,
      conditions: currentRule.conditions || [],
      enabled: currentRule.enabled ?? true,
      frequency: currentRule.frequency || 'daily'
    };

    let result: StrategyRule | null = null;
    try {
      const isExisting = currentRule.id && savedRules.some(r => r.id === currentRule.id);
      if (isExisting && !currentRule.id.startsWith('local-')) {
        result = await api.put(`/api/strategies/${currentRule.id}`, payload);
      } else {
        result = await api.post('/api/strategies', payload);
      }
    } catch (err: any) {
      console.warn('Save failed on server, falling back to local save', err);
      result = {
        ...currentRule,
        id: currentRule.id || `local-${Date.now()}`,
        name: currentRule.name.trim() || 'Untitled Strategy',
        createdAt: currentRule.createdAt || new Date().toISOString()
      };
      setApiNotice('Saved locally. Run database migration to enable cloud sync.');
    }

    if (result) {
      const finalItem = result;
      setSavedRules(prev => {
        const idx = prev.findIndex(r => r.id === finalItem.id);
        let next: StrategyRule[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = finalItem;
        } else {
          next = [finalItem, ...prev];
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
      setCurrentRule(finalItem);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setActiveTab('active');
      }, 700);
    }
    setIsSaving(false);
  };

  const handleAddCondition = () => {
    const newCond: StrategyCondition = {
      id: `cond-${Date.now()}`,
      connector: currentRule.conditions.length > 0 ? 'AND' : undefined,
      leftIndicator: '',
      operator: '',
      rightType: 'value',
      rightValue: '',
      rightIndicator: ''
    };
    setCurrentRule(prev => ({ ...prev, conditions: [...prev.conditions, newCond] }));
  };

  const handleRemoveCondition = (id: string) => {
    setCurrentRule(prev => ({ ...prev, conditions: prev.conditions.filter(c => c.id !== id) }));
  };

  const handleUpdateCondition = (id: string, updates: Partial<StrategyCondition>) => {
    setCurrentRule(prev => ({
      ...prev,
      conditions: prev.conditions.map(c => c.id === id ? { ...c, ...updates } : c)
    }));
  };

  const handleDeleteSavedRule = async (id: string) => {
    setSavedRules(prev => {
      const next = prev.filter(r => r.id !== id);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (currentRule.id === id) setCurrentRule(BLANK_RULE);
    if (!id.startsWith('local-')) {
      try { await api.delete(`/api/strategies/${id}`); } catch {}
    }
  };

  const handleToggleRuleStatus = async (id: string) => {
    const target = savedRules.find(r => r.id === id);
    if (!target) return;
    const nextStatus = !target.enabled;
    setSavedRules(prev => {
      const next = prev.map(r => r.id === id ? { ...r, enabled: nextStatus } : r);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (!id.startsWith('local-')) {
      try { await api.put(`/api/strategies/${id}`, { enabled: nextStatus }); } catch {}
    }
  };

  // Render modal via React Portal
  if (!isOpen) return null;

  const isBuilderActive = activeTab === 'builder';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 transition-opacity" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl sm:max-w-3xl h-[85vh] md:h-[540px] bg-surface border border-divider rounded-xl shadow-2xl flex flex-col overflow-hidden text-primary">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-divider shrink-0 bg-surface">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-primary">Strategy Builder</h2>
              <p className="text-[10px] sm:text-xs text-secondary">Declarative signal formulas & portfolio automation.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-secondary hover:text-primary rounded-lg transition-colors">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Two-Column Body */}
        <div className="p-4 sm:p-6 overflow-hidden flex-1 flex flex-row gap-3 sm:gap-6 min-h-0 bg-surface">
          
          {/* Categories Nav */}
          <div className="w-28 sm:w-44 shrink-0 flex flex-col pr-2 sm:pr-4 border-r border-divider">
            <h3 className="text-xs sm:text-sm font-medium text-primary mb-2 px-2">Categories</h3>
            <div className="flex flex-col gap-1 overflow-y-auto flex-1">
              {CATEGORIES.map(cat => {
                const count = cat.id === 'active'
                  ? savedRules.length
                  : savedRules.filter(r => r.scope === 'global').length;

                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      const catId = cat.id as 'builder' | 'active';
                      setActiveTab(catId);
                    }}
                    className={`text-left px-3 py-2 rounded-lg text-xs sm:text-sm transition-colors flex items-center justify-between ${
                      activeTab === cat.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-secondary hover:bg-surface-hover hover:text-primary'
                    }`}
                  >
                    <span>{cat.name}</span>
                    {count > 0 && (
                      <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center font-mono">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Tab Content */}
          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto pr-1">
            
            {isBuilderActive && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-xs sm:text-sm font-medium text-primary">
                      Global Strategy
                    </h3>
                    <p className="text-[10px] sm:text-xs text-secondary">
                      Configure signal-based portfolio conditions.
                    </p>
                  </div>
                  {(currentRule.name || currentRule.action || currentRule.sizingType || currentRule.conditions.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setCurrentRule(BLANK_RULE)}
                      className="text-xs text-secondary hover:text-primary transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Name & Scope Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-secondary mb-1">Strategy Name</label>
                    <input
                      type="text"
                      value={currentRule.name}
                      onChange={e => setCurrentRule(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Portfolio Dip & Momentum"
                      className="w-full bg-surface border border-divider rounded-lg px-2.5 py-1.5 text-xs text-primary focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-secondary mb-1">Target Scope</label>
                    <select
                      value={currentRule.scope === 'global' ? 'ALL' : (currentRule.targetSymbol || 'ALL')}
                      onChange={e => {
                        const val = e.target.value;
                        setCurrentRule(prev => ({
                          ...prev,
                          scope: val === 'ALL' ? 'global' : 'stock',
                          targetSymbol: val
                        }));
                      }}
                      className="w-full bg-surface border border-divider rounded-lg px-2.5 py-1.5 text-xs text-primary focus:outline-none focus:border-primary"
                    >
                      <option value="ALL">All Portfolio Holdings (Global)</option>
                      {uniqueSymbols.map(sym => (
                        <option key={sym} value={sym}>{sym}</option>
                      ))}
                      {currentRule.targetSymbol && currentRule.targetSymbol !== 'ALL' && !uniqueSymbols.includes(currentRule.targetSymbol) && (
                        <option value={currentRule.targetSymbol}>{currentRule.targetSymbol}</option>
                      )}
                      {uniqueSymbols.length === 0 && (
                        <option value="" disabled>No open stocks in this portfolio</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Action & Sizing */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-secondary">Action & Sizing</label>
                  <div className="flex flex-wrap items-center gap-2">
                    
                    {/* Action Selector */}
                    <div className="inline-flex items-center p-0.5 bg-surface border border-divider rounded-lg">
                      {(['BUY', 'SELL', 'ALERT'] as const).map(act => (
                        <button
                          key={act}
                          type="button"
                          onClick={() => setCurrentRule(prev => ({ ...prev, action: prev.action === act ? '' : act }))}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                            currentRule.action === act
                              ? 'bg-primary text-surface font-semibold'
                              : 'text-secondary hover:text-primary'
                          }`}
                        >
                          {act}
                        </button>
                      ))}
                    </div>

                    {/* Sizing Selector */}
                    <div className="inline-flex items-center p-0.5 bg-surface border border-divider rounded-lg">
                      {(['QTY', 'VALUE', 'INCREASE_PCT', 'DECREASE_PCT'] as const).map(st => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setCurrentRule(prev => ({ ...prev, sizingType: prev.sizingType === st ? '' : st }))}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                            currentRule.sizingType === st
                              ? 'bg-primary text-surface font-semibold'
                              : 'text-secondary hover:text-primary'
                          }`}
                        >
                          {st.replace('_', ' ')}
                        </button>
                      ))}
                    </div>

                    {/* Sizing Value */}
                    <input
                      type="number"
                      min="1"
                      value={currentRule.sizingValue ?? ''}
                      onChange={e => setCurrentRule(prev => ({ ...prev, sizingValue: e.target.value === '' ? '' : Number(e.target.value) }))}
                      placeholder="Value"
                      className="w-20 bg-surface border border-divider rounded-lg px-2.5 py-1 text-xs text-primary font-mono focus:outline-none focus:border-primary"
                    />
                    <span className="text-xs text-secondary font-mono">
                      {currentRule.sizingType === 'QTY' && 'Qty'}
                      {currentRule.sizingType === 'VALUE' && currencySymbol}
                      {(currentRule.sizingType === 'INCREASE_PCT' || currentRule.sizingType === 'DECREASE_PCT') && '%'}
                    </span>
                  </div>
                </div>

                {/* Conditions Block */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-secondary">Conditions (IF)</label>
                    <button
                      type="button"
                      onClick={handleAddCondition}
                      className="text-xs font-medium text-secondary hover:text-primary flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Condition</span>
                    </button>
                  </div>

                  {currentRule.conditions.length === 0 ? (
                    <div className="p-4 border border-dashed border-divider rounded-lg text-center space-y-2">
                      <p className="text-xs text-secondary">No conditions configured yet.</p>
                      <button
                        type="button"
                        onClick={handleAddCondition}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-divider rounded-md hover:bg-surface-hover"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Condition</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {currentRule.conditions.map((cond, idx) => (
                        <div key={cond.id} className="space-y-1.5">
                          {idx > 0 && (
                            <div className="flex items-center gap-2 pl-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateCondition(cond.id, { connector: cond.connector === 'OR' ? 'AND' : 'OR' })}
                                className="px-2 py-0.5 rounded text-[10px] font-mono border border-divider bg-surface text-secondary hover:text-primary"
                              >
                                {cond.connector || 'AND'}
                              </button>
                              <div className="h-[1px] flex-1 bg-divider" />
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2 p-2.5 bg-surface border border-divider rounded-lg">
                            {/* Left Indicator */}
                            <select
                              value={cond.leftIndicator || ''}
                              onChange={e => handleUpdateCondition(cond.id, { leftIndicator: e.target.value as any })}
                              className="bg-surface border border-divider rounded-lg px-2 py-1.5 text-xs text-primary"
                            >
                              <option value="" disabled>Select Indicator</option>
                              <option value="rsi">RSI(14, day)</option>
                              <option value="dma50">DMA(50)</option>
                              <option value="dma200">DMA(200)</option>
                              <option value="price">Current Price</option>
                              <option value="changePct">Day Change %</option>
                            </select>

                            {/* Operator */}
                            <select
                              value={cond.operator || ''}
                              onChange={e => handleUpdateCondition(cond.id, { operator: e.target.value as any })}
                              className="bg-surface border border-divider rounded-lg px-2 py-1.5 text-xs font-mono text-primary"
                            >
                              <option value="" disabled>Select Operator</option>
                              <option value="<">&lt;</option>
                              <option value=">">&gt;</option>
                              <option value="<=">&lt;=</option>
                              <option value=">=">&gt;=</option>
                              <option value="CROSSINGOVER">CROSSINGOVER</option>
                              <option value="CROSSINGUNDER">CROSSINGUNDER</option>
                              <option value="==">==</option>
                            </select>

                            {/* Right Type Toggle */}
                            <div className="inline-flex items-center p-0.5 bg-surface border border-divider rounded-lg">
                              <button
                                type="button"
                                onClick={() => handleUpdateCondition(cond.id, { rightType: 'value' })}
                                className={`px-2 py-1 rounded text-[10px] font-medium ${cond.rightType === 'value' ? 'bg-primary text-surface font-semibold' : 'text-secondary'}`}
                              >
                                Value
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateCondition(cond.id, { rightType: 'indicator' })}
                                className={`px-2 py-1 rounded text-[10px] font-medium ${cond.rightType === 'indicator' ? 'bg-primary text-surface font-semibold' : 'text-secondary'}`}
                              >
                                Indicator
                              </button>
                            </div>

                            {/* Right Value or Indicator */}
                            {cond.rightType === 'value' ? (
                              <input
                                type="number"
                                value={cond.rightValue ?? ''}
                                onChange={e => handleUpdateCondition(cond.id, { rightValue: e.target.value === '' ? '' : Number(e.target.value) })}
                                placeholder="Value"
                                className="w-20 bg-surface border border-divider rounded-lg px-2 py-1.5 text-xs text-primary font-mono"
                              />
                            ) : (
                              <select
                                value={cond.rightIndicator || ''}
                                onChange={e => handleUpdateCondition(cond.id, { rightIndicator: e.target.value as any })}
                                className="bg-surface border border-divider rounded-lg px-2 py-1.5 text-xs text-primary"
                              >
                                <option value="" disabled>Select Indicator</option>
                                <option value="dma200">DMA(200)</option>
                                <option value="dma50">DMA(50)</option>
                                <option value="rsi">RSI(14)</option>
                                <option value="price">Current Price</option>
                              </select>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveCondition(cond.id)}
                              className="ml-auto p-1.5 text-secondary hover:text-primary rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Formula Preview */}
                <div className="p-3 bg-surface border border-divider rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-secondary text-xs">
                    <span className="font-medium text-primary">Formula Preview</span>
                    <button type="button" onClick={handleCopyFormula} className="text-secondary hover:text-primary text-[11px] cursor-pointer">
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="p-2.5 bg-surface-hover/50 rounded border border-divider font-mono text-xs text-primary overflow-x-auto whitespace-nowrap">
                    {formatRuleFormula(currentRule)}
                  </div>
                </div>
              </div>
            )}

            {/* Saved Strategies Tab */}
            {activeTab === 'active' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-xs sm:text-sm font-medium text-primary">Saved Strategies</h3>
                    <p className="text-[10px] sm:text-xs text-secondary">Active rules monitored for signals.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCurrentRule(BLANK_RULE); setActiveTab('builder'); }}
                    className="px-2.5 py-1 text-xs font-medium text-secondary hover:text-primary border border-divider rounded-lg cursor-pointer"
                  >
                    + New
                  </button>
                </div>

                {apiNotice && (
                  <div className="p-2.5 rounded-lg border border-divider bg-surface-hover/60 text-[11px] text-secondary">
                    {apiNotice}
                  </div>
                )}

                {isLoading ? (
                  <div className="p-8 flex flex-col items-center justify-center gap-2 text-xs text-secondary">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span>Loading strategies...</span>
                  </div>
                ) : savedRules.length === 0 ? (
                  <div className="p-8 text-center text-xs text-secondary border border-divider rounded-lg">
                    No strategies saved yet. Click &quot;+ New&quot; to configure your first strategy.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {savedRules.map(rule => (
                      <div key={rule.id} className="p-3 rounded-lg border border-divider bg-surface flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-medium text-primary truncate">{rule.name}</span>
                            <span className="text-[10px] text-secondary font-mono">
                              ({rule.scope === 'global' ? 'Global' : (rule.targetSymbol || 'All')})
                            </span>
                          </div>
                          <div className="text-xs font-mono text-secondary truncate">{formatRuleFormula(rule)}</div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleRuleStatus(rule.id)}
                            className={`px-2 py-1 rounded text-[10px] font-medium border border-divider cursor-pointer ${
                              rule.enabled ? 'bg-primary/10 text-primary border-primary/30' : 'text-secondary hover:text-primary'
                            }`}
                          >
                            {rule.enabled ? 'Active' : 'Paused'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentRule(rule);
                              setActiveTab('builder');
                            }}
                            className="px-2 py-1 text-xs text-secondary hover:text-primary cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedRule(rule.id)}
                            className="p-1 text-secondary hover:text-danger cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-divider bg-surface flex items-center justify-between shrink-0">
          <div className="text-xs text-secondary">
            {savedRules.filter(r => r.enabled).length} active rule(s)
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-secondary hover:text-primary cursor-pointer">
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveRule}
              className="px-5 py-2 rounded-lg bg-primary hover:opacity-90 disabled:opacity-50 text-surface text-xs font-semibold shadow flex items-center gap-1.5 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-surface" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3] text-surface" />
                  <span>Saved</span>
                </>
              ) : (
                <span>Save Strategy</span>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
