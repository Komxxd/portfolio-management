import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function StockDetails() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();

  return (
    <div className="p-6 h-full w-full bg-background overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors focus:outline-none"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-surface border border-divider rounded-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4 border border-divider">
            <span className="text-2xl font-bold text-primary">{symbol?.[0]}</span>
          </div>
          <h1 className="text-2xl font-bold text-primary">{symbol}</h1>
          <p className="text-tertiary">
            This is a placeholder stock details page for <strong>{symbol}</strong>.
          </p>
          <div className="p-4 bg-hover rounded-lg inline-block border border-divider mt-6 text-left max-w-lg mx-auto">
            <p className="text-sm text-secondary leading-relaxed">
              In the future, this page will display interactive charts, detailed fundamentals, corporate actions history, and your specific holdings across all portfolios for this stock.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
