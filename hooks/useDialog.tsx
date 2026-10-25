import React, { useState, useCallback } from 'react';
import { AlertTriangle, Info, CheckCircle, X, Loader2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

interface PendingConfirm extends ConfirmConfig {
  resolve: (val: boolean) => void;
  loading?: boolean;
}

interface PromptConfig {
  title: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  required?: boolean;
  defaultValue?: string;
}

interface PendingPrompt extends PromptConfig {
  resolve: (val: string | null) => void;
}

interface ToastItem {
  id: number;
  msg: string;
  type: 'error' | 'success' | 'info';
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

const VARIANT_STYLES = {
  danger:  { icon: AlertTriangle, iconBg: 'bg-red-100', iconColor: 'text-danger',  btn: 'bg-danger text-white shadow-danger/20' },
  warning: { icon: AlertTriangle, iconBg: 'bg-orange-100', iconColor: 'text-orange-500', btn: 'bg-orange-500 text-white shadow-orange-500/20' },
  default: { icon: Info,          iconBg: 'bg-primary/10', iconColor: 'text-primary', btn: 'bg-primary text-white shadow-primary/20' },
};

function ConfirmModal({ pending, onConfirm, onCancel, confirming }: {
  pending: PendingConfirm;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const v = VARIANT_STYLES[pending.variant || 'default'];
  const Icon = v.icon;

  return (
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative bg-white rounded-[32px] p-8 shadow-2xl w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
        <div className={`w-14 h-14 ${v.iconBg} rounded-2xl flex items-center justify-center mb-6`}>
          <Icon size={28} className={v.iconColor} />
        </div>
        <h3 className="font-black text-dark text-lg tracking-tight mb-2">{pending.title}</h3>
        <p className="text-sm font-medium text-gray-500 leading-relaxed mb-8">{pending.message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 py-4 bg-gray-100 text-dark rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all disabled:opacity-50"
          >
            {pending.cancelLabel || 'Annuler'}
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className={`flex-[2] py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${v.btn}`}
          >
            {confirming ? <Loader2 size={14} className="animate-spin"/> : null}
            {pending.confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PromptModal ──────────────────────────────────────────────────────────────

function PromptModal({ pending, onConfirm, onCancel }: {
  pending: PendingPrompt;
  onConfirm: (val: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(pending.defaultValue || '');
  const v = VARIANT_STYLES[pending.variant || 'default'];
  const Icon = v.icon;
  const canSubmit = !pending.required || value.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative bg-white rounded-[32px] p-8 shadow-2xl w-full max-w-sm mx-auto animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
        <div className={`w-14 h-14 ${v.iconBg} rounded-2xl flex items-center justify-center mb-6`}>
          <Icon size={28} className={v.iconColor} />
        </div>
        <h3 className="font-black text-dark text-lg tracking-tight mb-2">{pending.title}</h3>
        <p className="text-sm font-medium text-gray-500 leading-relaxed mb-4">{pending.message}</p>
        <textarea
          autoFocus
          rows={3}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={pending.placeholder || ''}
          className="w-full p-4 bg-gray-50 border border-border rounded-2xl text-sm font-medium outline-none focus:border-primary resize-none mb-6"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-4 bg-gray-100 text-dark rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
          >
            {pending.cancelLabel || 'Annuler'}
          </button>
          <button
            onClick={() => canSubmit && onConfirm(value.trim())}
            disabled={!canSubmit}
            className={`flex-[2] py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all disabled:opacity-40 ${v.btn}`}
          >
            {pending.confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

const TOAST_STYLES = {
  error:   { bg: 'bg-danger',   icon: AlertTriangle },
  success: { bg: 'bg-success',  icon: CheckCircle },
  info:    { bg: 'bg-primary',  icon: Info },
};

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const s = TOAST_STYLES[item.type];
  const Icon = s.icon;

  return (
    <div className={`flex items-center gap-3 ${s.bg} text-white px-5 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 max-w-sm w-full`}>
      <Icon size={18} className="shrink-0"/>
      <span className="text-sm font-bold flex-1 leading-snug">{item.msg}</span>
      <button onClick={onDismiss} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity ml-1">
        <X size={16}/>
      </button>
    </div>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const confirm = useCallback((config: ConfirmConfig): Promise<boolean> =>
    new Promise(resolve => { setConfirming(false); setPending({ ...config, resolve }); }), []);

  const prompt = useCallback((config: PromptConfig): Promise<string | null> =>
    new Promise(resolve => { setPendingPrompt({ ...config, resolve }); }), []);

  const toast = useCallback((msg: string, type: ToastItem['type'] = 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const handleConfirm = async () => {
    if (!pending) return;
    setConfirming(true);
    pending.resolve(true);
    setPending(null);
    setConfirming(false);
  };

  const handleCancel = () => {
    pending?.resolve(false);
    setPending(null);
  };

  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const dialogNode = (
    <>
      {pending && (
        <ConfirmModal
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          confirming={confirming}
        />
      )}
      {pendingPrompt && (
        <PromptModal
          pending={pendingPrompt}
          onConfirm={val => { pendingPrompt.resolve(val); setPendingPrompt(null); }}
          onCancel={() => { pendingPrompt.resolve(null); setPendingPrompt(null); }}
        />
      )}
      {toasts.length > 0 && (
        <div className="fixed bottom-24 left-0 right-0 z-[700] flex flex-col items-center gap-2 px-4 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto w-full max-w-sm">
              <Toast item={t} onDismiss={() => dismissToast(t.id)}/>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return { confirm, prompt, toast, dialogNode };
}
