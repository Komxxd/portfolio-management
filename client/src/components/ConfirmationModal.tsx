import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  requireInputToConfirm?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  requireInputToConfirm
}) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmDisabled = requireInputToConfirm ? inputValue !== requireInputToConfirm : false;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className={`p-2 rounded-full shrink-0 ${isDestructive ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-zinc-900 mb-1 leading-tight">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {message}
              </p>
              {requireInputToConfirm && (
                <div className="mt-4">
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Please type <strong className="font-bold text-zinc-900">{requireInputToConfirm}</strong> to confirm.
                  </label>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-900"
                    placeholder={requireInputToConfirm}
                    autoFocus
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 bg-gray-50 flex items-center justify-end gap-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              if (!isConfirmDisabled) {
                onConfirm();
                onClose();
              }
            }}
            disabled={isConfirmDisabled}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm ${ 
              isConfirmDisabled
                ? 'bg-gray-300 cursor-not-allowed opacity-50'
                : isDestructive 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-zinc-900 hover:bg-zinc-800'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
