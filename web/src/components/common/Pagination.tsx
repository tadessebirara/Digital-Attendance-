import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight,
  MoreHorizontal,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PaginationProps {
  totalItems: number;
  rowsPerPage: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rows: number) => void;
  rowsPerPageOptions?: number[];
  /** Show a compact (no labels, smaller) version — used inside modals / panels */
  compact?: boolean;
}

// ─── Page number generator ────────────────────────────────────────────────────
function buildPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  const left  = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}

// ─── Jump-to input ────────────────────────────────────────────────────────────
function JumpTo({ totalPages, onJump }: { totalPages: number; onJump: (p: number) => void }) {
  const [val, setVal] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const commit = () => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onJump(n);
      setVal('');
      ref.current?.blur();
    }
  };

  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <span className="whitespace-nowrap">Go to</span>
      <input
        ref={ref}
        type="number"
        min={1}
        max={totalPages}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && commit()}
        onBlur={commit}
        className="w-12 text-center px-1.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600
                   bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs
                   focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-500
                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                   [&::-webkit-inner-spin-button]:appearance-none"
        placeholder="–"
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export const Pagination = ({
  totalItems,
  rowsPerPage,
  currentPage,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = [10, 20, 50, 100],
  compact = false,
}: PaginationProps) => {
  const totalPages  = Math.max(1, Math.ceil(totalItems / rowsPerPage));
  const startItem   = Math.min((currentPage - 1) * rowsPerPage + 1, totalItems);
  const endItem     = Math.min(currentPage * rowsPerPage, totalItems);
  const pages       = buildPages(currentPage, totalPages);

  // Auto-reset when current page exceeds total after a filter change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) onPageChange(1);
  }, [totalPages, currentPage, onPageChange]);

  const go = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) onPageChange(page);
  };

  const handleRowsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onRowsPerPageChange(parseInt(e.target.value, 10));
    onPageChange(1);
  };

  // Hide completely when nothing to paginate
  if (totalItems === 0) return null;

  // ── Shared button classes ─────────────────────────────────────────────────
  const navBtn = (disabled: boolean) =>
    `flex items-center justify-center rounded-lg border transition-all duration-150 select-none
     ${compact ? 'w-7 h-7' : 'w-8 h-8'}
     ${disabled
       ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed bg-white dark:bg-gray-800/50'
       : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 hover:border-accent-400 dark:hover:border-accent-500 hover:text-accent-600 dark:hover:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/20 active:scale-95 cursor-pointer'
     }`;

  const pageBtn = (active: boolean) =>
    `flex items-center justify-center rounded-lg border text-xs font-semibold transition-all duration-150 select-none
     ${compact ? 'min-w-[28px] h-7 px-1.5' : 'min-w-[32px] h-8 px-2'}
     ${active
       ? 'bg-accent-600 border-accent-600 text-white shadow-sm shadow-violet-200 dark:shadow-violet-900/30 scale-105'
       : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-accent-400 dark:hover:border-accent-500 hover:text-accent-600 dark:hover:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/20 active:scale-95 cursor-pointer'
     }`;

  // ── Compact mode (inside panels/modals) ───────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-gray-100 dark:border-gray-700/60">
        {/* Info */}
        <p className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
          <span className="font-semibold text-gray-700 dark:text-gray-300">{startItem}–{endItem}</span>
          {' '}of{' '}
          <span className="font-semibold text-gray-700 dark:text-gray-300">{totalItems.toLocaleString()}</span>
        </p>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button onClick={() => go(1)} disabled={currentPage === 1} className={navBtn(currentPage === 1)} title="First">
            <ChevronsLeft size={13} />
          </button>
          <button onClick={() => go(currentPage - 1)} disabled={currentPage === 1} className={navBtn(currentPage === 1)} title="Previous">
            <ChevronLeft size={13} />
          </button>

          {pages.map((p, i) =>
            p === '...'
              ? <span key={`e${i}`} className="flex items-center justify-center w-7 h-7 text-gray-400 dark:text-gray-500"><MoreHorizontal size={12} /></span>
              : <button key={p} onClick={() => go(p as number)} className={pageBtn(p === currentPage)}>{p}</button>
          )}

          <button onClick={() => go(currentPage + 1)} disabled={currentPage === totalPages} className={navBtn(currentPage === totalPages)} title="Next">
            <ChevronRight size={13} />
          </button>
          <button onClick={() => go(totalPages)} disabled={currentPage === totalPages} className={navBtn(currentPage === totalPages)} title="Last">
            <ChevronsRight size={13} />
          </button>
        </div>
      </div>
    );
  }

  // ── Full mode ─────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-3
                 px-4 py-3 border-t border-gray-200 dark:border-gray-700
                 bg-white dark:bg-[#1a1d2e] rounded-b-xl"
    >
      {/* ── Left: info + rows selector ── */}
      <div className="flex items-center gap-4 order-2 sm:order-1">
        {/* Record range */}
        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
          Showing{' '}
          <span className="font-semibold text-gray-900 dark:text-white">{startItem.toLocaleString()}</span>
          {' '}–{' '}
          <span className="font-semibold text-gray-900 dark:text-white">{endItem.toLocaleString()}</span>
          {' '}of{' '}
          <span className="font-semibold text-gray-900 dark:text-white">{totalItems.toLocaleString()}</span>
          {' '}results
        </p>

        {/* Rows per page */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <label htmlFor="rpp" className="hidden sm:block text-xs whitespace-nowrap">Rows:</label>
          <select
            id="rpp"
            value={rowsPerPage}
            onChange={handleRowsChange}
            className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-500
                       cursor-pointer"
          >
            {rowsPerPageOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* ── Right: nav controls ── */}
      <div className="flex items-center gap-2 order-1 sm:order-2">
        {/* Jump-to */}
        {totalPages > 5 && (
          <JumpTo totalPages={totalPages} onJump={go} />
        )}

        {/* Page buttons */}
        <div className="flex items-center gap-1">
          {/* First */}
          <button
            onClick={() => go(1)}
            disabled={currentPage === 1}
            className={navBtn(currentPage === 1)}
            title="First page"
          >
            <ChevronsLeft size={14} />
          </button>

          {/* Previous */}
          <button
            onClick={() => go(currentPage - 1)}
            disabled={currentPage === 1}
            className={navBtn(currentPage === 1)}
            title="Previous page"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Numbered pages */}
          {pages.map((p, i) =>
            p === '...'
              ? (
                <span
                  key={`ellipsis-${i}`}
                  className="flex items-center justify-center w-8 h-8 text-gray-400 dark:text-gray-500"
                >
                  <MoreHorizontal size={14} />
                </span>
              )
              : (
                <button
                  key={p}
                  onClick={() => go(p as number)}
                  className={pageBtn(p === currentPage)}
                  aria-current={p === currentPage ? 'page' : undefined}
                >
                  {p}
                </button>
              )
          )}

          {/* Next */}
          <button
            onClick={() => go(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={navBtn(currentPage === totalPages)}
            title="Next page"
          >
            <ChevronRight size={14} />
          </button>

          {/* Last */}
          <button
            onClick={() => go(totalPages)}
            disabled={currentPage === totalPages}
            className={navBtn(currentPage === totalPages)}
            title="Last page"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
