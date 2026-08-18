import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, Info, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button on open (safer default)
  useEffect(() => {
    if (open) setTimeout(() => cancelRef.current?.focus(), 50);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const iconMap = {
    danger:  { Icon: Trash2,        ring: 'bg-red-100 dark:bg-red-500/10',    icon: 'text-red-500',    btn: 'bg-red-600 hover:bg-red-700 focus:ring-red-500' },
    warning: { Icon: AlertTriangle, ring: 'bg-amber-100 dark:bg-amber-500/10', icon: 'text-amber-500', btn: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-400' },
    info:    { Icon: Info,           ring: 'bg-blue-100 dark:bg-blue-500/10',   icon: 'text-blue-500',  btn: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500' },
  }[variant];

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-title"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#1a1d2e] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/[0.08] animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${iconMap.ring}`}>
            <iconMap.Icon size={22} className={iconMap.icon} />
          </div>

          {/* Text */}
          <h2 id="confirm-title" className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            {title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.10] transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 flex items-center gap-2 ${iconMap.btn}`}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── useConfirm hook — simple state manager ───────────────────────────────────
// Usage:
//   const { confirmProps, confirm } = useConfirm();
//   await confirm({ title: 'Delete user?', message: '...' })  → true | false
//   <ConfirmModal {...confirmProps} />

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

import { useState, useCallback } from 'react';

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  }>({
    open: false,
    opts: { title: '', message: '' },
    resolve: () => {},
  });
  const [loading, setLoading] = useState(false);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, opts, resolve });
      setLoading(false);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve(true);
    setState(s => ({ ...s, open: false }));
  }, [state]);

  const handleCancel = useCallback(() => {
    state.resolve(false);
    setState(s => ({ ...s, open: false }));
  }, [state]);

  const confirmProps: ConfirmModalProps = {
    open: state.open,
    title: state.opts.title,
    message: state.opts.message,
    confirmLabel: state.opts.confirmLabel,
    cancelLabel: state.opts.cancelLabel,
    variant: state.opts.variant,
    loading,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { confirmProps, confirm, setLoading };
}
