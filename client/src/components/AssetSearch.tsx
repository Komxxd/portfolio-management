import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Check } from 'lucide-react';

interface AssetSearchProps {
  availableAssets: { symbol: string, name: string }[];
  selectedSymbols: string[];
  onChange: (symbols: string[]) => void;
}

export function AssetSearch({ availableAssets, selectedSymbols, onChange }: AssetSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredAssets = availableAssets.filter(asset => 
    asset.symbol.toLowerCase().includes(searchText.toLowerCase()) ||
    asset.name?.toLowerCase().includes(searchText.toLowerCase())
  );

  const toggleSymbol = (sym: string) => {
    if (selectedSymbols.includes(sym)) {
      onChange(selectedSymbols.filter(s => s !== sym));
    } else {
      onChange([...selectedSymbols, sym]);
    }
  };

  const removeSymbol = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedSymbols.filter(s => s !== sym));
  };

  return (
    <div className="relative flex items-center gap-2" ref={wrapperRef}>
      {/* Search Input Box */}
      <div 
        className="flex items-center bg-white border border-gray-200 shadow-sm hover:border-gray-300 rounded-lg px-2 py-1 min-w-[220px] cursor-text transition-colors"
        onClick={() => setIsOpen(true)}
      >
        <Search className="w-3.5 h-3.5 text-gray-400 mr-2 shrink-0" />
        
        <div className="flex flex-nowrap gap-1 items-center flex-1 max-w-[280px] overflow-hidden">
          {selectedSymbols.slice(0, 2).map(sym => (
            <span key={sym} className="flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-800 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0">
              {sym}
              <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={(e) => removeSymbol(sym, e)} />
            </span>
          ))}
          {selectedSymbols.length > 2 && (
            <span className="text-[10px] text-gray-500 font-medium px-1 shrink-0">
              +{selectedSymbols.length - 2} more
            </span>
          )}
          
          <input
            type="text"
            className="flex-1 min-w-[60px] outline-none text-[11px] bg-transparent text-zinc-900 placeholder-gray-400 py-0.5"
            placeholder={selectedSymbols.length === 0 ? "Search symbols..." : ""}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
          />
        </div>
        
        {selectedSymbols.length > 0 && (
          <button 
            className="ml-1 text-gray-400 hover:text-gray-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
              setSearchText('');
            }}
            title="Clear all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full max-w-[280px] min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 flex flex-col py-1">
          {filteredAssets.length > 0 ? (
            <>
              <div 
                className="px-3 py-1.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 flex items-center justify-between group"
                onClick={() => {
                  const allFilteredSelected = filteredAssets.every(a => selectedSymbols.includes(a.symbol));
                  if (allFilteredSelected) {
                    const filteredSymbols = filteredAssets.map(a => a.symbol);
                    onChange(selectedSymbols.filter(s => !filteredSymbols.includes(s)));
                  } else {
                    const filteredSymbols = filteredAssets.map(a => a.symbol);
                    onChange(Array.from(new Set([...selectedSymbols, ...filteredSymbols])));
                  }
                }}
              >
                <span className="text-xs font-medium text-blue-600 group-hover:text-blue-700">
                  {filteredAssets.every(a => selectedSymbols.includes(a.symbol)) ? 'Deselect All' : 'Select All'}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto flex flex-col">
              {filteredAssets.map(asset => {
                const isSelected = selectedSymbols.includes(asset.symbol);
                return (
                  <div
                    key={asset.symbol}
                    className="flex items-center px-3 py-1.5 hover:bg-gray-50 cursor-pointer group"
                    onClick={() => toggleSymbol(asset.symbol)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${isSelected ? 'text-zinc-900' : 'text-zinc-700'}`}>
                          {asset.symbol}
                        </span>
                        {asset.name && (
                          <span className="text-[10px] text-gray-500 truncate" title={asset.name}>
                            {asset.name}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-zinc-900 ml-2 shrink-0" />
                    )}
                  </div>
                );
              })}
              </div>
            </>
          ) : (
            <div className="px-3 py-4 text-xs text-gray-500 text-center">
              No assets found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
