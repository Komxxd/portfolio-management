import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface RenamePortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRenamed: () => void;
  portfolioId: string | null;
  currentName: string;
}

export function RenamePortfolioModal({ isOpen, onClose, onRenamed, portfolioId, currentName }: RenamePortfolioModalProps) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setError('');
    }
  }, [isOpen, currentName]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !portfolioId || name.trim() === currentName) return;

    setLoading(true);
    setError('');

    const { error: dbError } = await supabase
      .from('portfolios')
      .update({ name: name.trim() })
      .eq('id', portfolioId);

    setLoading(false);

    if (dbError) {
      setError(dbError.message);
    } else {
      onRenamed();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white w-full max-w-md rounded-xl p-6 relative shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-xl font-semibold mb-1 text-zinc-900 tracking-tight">Rename Portfolio</h2>
        <p className="text-sm text-gray-500 mb-6">Enter a new name for your portfolio.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="rename" className="block text-sm font-medium text-gray-700 mb-1">
              Portfolio Name
            </label>
            <input
              type="text"
              id="rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-shadow"
              placeholder="e.g. Long-term Hold"
              autoFocus
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 border border-transparent rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || name.trim() === currentName}
              className="bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
