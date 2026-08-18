import { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, UserX, Clock } from 'lucide-react';
import apiClient from '../../api/client';

interface PenaltyConfig {
  absenceUnit:  'PER_DAY' | 'PER_ABSENCE_RECORD';
  absenceType:  'FIXED' | 'PERCENTAGE';
  absenceValue: number;
  lateUnit:     'PER_MINUTE' | 'PER_HOUR';
  lateType:     'FIXED' | 'PERCENTAGE';
  lateValue:    number;
}

const DEFAULTS: PenaltyConfig = {
  absenceUnit:  'PER_DAY',
  absenceType:  'FIXED',
  absenceValue: 0,
  lateUnit:     'PER_MINUTE',
  lateType:     'FIXED',
  lateValue:    0,
};

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/[0.1]'
      }`}
    >
      {label}
    </button>
  );
}

export function PenaltySettings() {
  const [cfg,     setCfg]     = useState<PenaltyConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    apiClient.get('/salary/penalty-settings')
      .then((res: any) => { if (res.data?.success) setCfg(res.data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof PenaltyConfig>(k: K, v: PenaltyConfig[K]) =>
    setCfg(c => ({ ...c, [k]: v }));

  const handleSave = async () => {
    if (cfg.absenceValue < 0 || cfg.lateValue < 0)
      return showToast('Values cannot be negative.', false);
    if (cfg.absenceType === 'PERCENTAGE' && cfg.absenceValue > 100)
      return showToast('Percentage cannot exceed 100%.', false);
    if (cfg.lateType === 'PERCENTAGE' && cfg.lateValue > 100)
      return showToast('Percentage cannot exceed 100%.', false);

    setSaving(true);
    try {
      await apiClient.put('/salary/penalty-settings', cfg);
      showToast('Saved.', true);
    } catch (e: any) {
      showToast(e?.error || 'Failed to save.', false);
    } finally {
      setSaving(false);
    }
  };

  // Preview strings
  const fmtVal = (v: number, type: string) =>
    type === 'FIXED' ? `ETB ${v.toLocaleString()}` : `${v}%`;

  const absPreview = cfg.absenceValue === 0 ? '—' :
    `${fmtVal(cfg.absenceValue, cfg.absenceType)} / ${cfg.absenceUnit === 'PER_DAY' ? 'day' : 'record'}`;

  const halfPreview = cfg.absenceValue === 0 ? '—' :
    `${fmtVal(cfg.absenceValue / 2, cfg.absenceType)} / half-day`;

  const latePreview = cfg.lateValue === 0 ? '—' :
    `${fmtVal(cfg.lateValue, cfg.lateType)} / ${cfg.lateUnit === 'PER_MINUTE' ? 'min' : 'hr'}`;

  return (
    <div className="space-y-5 max-w-xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Penalty Settings</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Global rules · amounts in ETB</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium ${
          toast.ok
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
        }`}>
          {toast.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Absence card */}
          <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <UserX size={15} className="text-red-500" />
              </div>
              <span className="font-semibold text-gray-900 dark:text-white text-sm">Absence</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Unit */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Unit</p>
                <div className="flex flex-col gap-1.5">
                  <Chip label="Per Day"    active={cfg.absenceUnit === 'PER_DAY'}            onClick={() => set('absenceUnit', 'PER_DAY')} />
                  <Chip label="Per Record" active={cfg.absenceUnit === 'PER_ABSENCE_RECORD'} onClick={() => set('absenceUnit', 'PER_ABSENCE_RECORD')} />
                </div>
              </div>

              {/* Type */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Type</p>
                <div className="flex flex-col gap-1.5">
                  <Chip label="Fixed ETB"  active={cfg.absenceType === 'FIXED'}      onClick={() => set('absenceType', 'FIXED')} />
                  <Chip label="Percentage" active={cfg.absenceType === 'PERCENTAGE'} onClick={() => set('absenceType', 'PERCENTAGE')} />
                </div>
              </div>

              {/* Value */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">
                  {cfg.absenceType === 'FIXED' ? 'ETB' : '%'}
                </p>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                    {cfg.absenceType === 'FIXED' ? 'ETB' : '%'}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={cfg.absenceType === 'PERCENTAGE' ? 100 : undefined}
                    step="0.01"
                    value={cfg.absenceValue}
                    onChange={e => set('absenceValue', parseFloat(e.target.value) || 0)}
                    className="w-full pl-10 pr-2 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Late card */}
          <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                <Clock size={15} className="text-amber-500" />
              </div>
              <span className="font-semibold text-gray-900 dark:text-white text-sm">Late</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Unit */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Unit</p>
                <div className="flex flex-col gap-1.5">
                  <Chip label="Per Minute" active={cfg.lateUnit === 'PER_MINUTE'} onClick={() => set('lateUnit', 'PER_MINUTE')} />
                  <Chip label="Per Hour"   active={cfg.lateUnit === 'PER_HOUR'}   onClick={() => set('lateUnit', 'PER_HOUR')} />
                </div>
              </div>

              {/* Type */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Type</p>
                <div className="flex flex-col gap-1.5">
                  <Chip label="Fixed ETB"  active={cfg.lateType === 'FIXED'}      onClick={() => set('lateType', 'FIXED')} />
                  <Chip label="Percentage" active={cfg.lateType === 'PERCENTAGE'} onClick={() => set('lateType', 'PERCENTAGE')} />
                </div>
              </div>

              {/* Value */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">
                  {cfg.lateType === 'FIXED' ? 'ETB' : '%'}
                </p>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                    {cfg.lateType === 'FIXED' ? 'ETB' : '%'}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={cfg.lateType === 'PERCENTAGE' ? 100 : undefined}
                    step="0.01"
                    value={cfg.lateValue}
                    onChange={e => set('lateValue', parseFloat(e.target.value) || 0)}
                    className="w-full pl-10 pr-2 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live preview strip */}
          <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] px-5 py-4">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider mb-3">Preview</p>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">ABSENT</span>
                <span className="text-sm text-gray-700 dark:text-gray-200">{absPreview}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">HALF DAY</span>
                <span className="text-sm text-gray-700 dark:text-gray-200">{halfPreview}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">LATE</span>
                <span className="text-sm text-gray-700 dark:text-gray-200">{latePreview}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
