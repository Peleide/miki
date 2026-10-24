import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Camera, Loader2, ChevronDown, Check } from 'lucide-react';
import {
  Asset, AssetState, ChecklistAnswers, GmaoChecklist, GmaoUser, Priority, PRIORITY_LABEL, RequestStatus,
  REQUEST_STATUS_LABEL, STATE_LABEL, WorkOrderStatus, WORK_ORDER_STATUS_LABEL, FAMILIES,
} from '../../functions/src/gmao/model';

// ─── Formatage ───────────────────────────────────────────────────────────────

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const fmtShortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—');
export const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDateTime = (iso?: string | null) => (iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '—');
export const fmtXpf = (n?: number | null) => `${Math.round(n || 0).toLocaleString('fr-FR')} XPF`;
export const fmtNum = (n?: number | null, digits = 0) => (n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: digits }));
export const fmtPct = (r?: number | null) => (r == null ? '—' : `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
export const familyLabel = (code?: string) => FAMILIES.find(f => f.code === code)?.label || code || '—';

/** Valeur pour <input type="datetime-local"> en heure locale. */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');
export const toDateInput = (iso?: string | null) => toLocalInput(iso).slice(0, 10);
export const fromDateInput = (v: string, hour = 7) => (v ? new Date(`${v}T${String(hour).padStart(2, '0')}:00`).toISOString() : '');

export function relativeDays(iso?: string | null): string {
  if (!iso) return '';
  const days = Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days === -1) return 'hier';
  return days > 0 ? `dans ${days} j` : `il y a ${-days} j`;
}

export function sinceLabel(iso?: string | null): string {
  if (!iso) return '';
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return "moins d'1 h";
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} j`;
}

// ─── Badges ──────────────────────────────────────────────────────────────────

export const Badge: React.FC<{ className?: string; children: React.ReactNode; title?: string }> = ({ className = '', children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${className}`}>{children}</span>
);

export const STATE_CLASS: Record<AssetState, string> = {
  OPERATIONNEL: 'bg-success/10 text-success',
  DEGRADE: 'bg-orange-100 text-orange-600',
  INDISPONIBLE: 'bg-danger/10 text-danger',
};
export const STATE_DOT: Record<AssetState, string> = { OPERATIONNEL: 'bg-success', DEGRADE: 'bg-orange-400', INDISPONIBLE: 'bg-danger' };

export const StateBadge: React.FC<{ state: AssetState }> = ({ state }) => (
  <Badge className={STATE_CLASS[state]}><span className={`w-1.5 h-1.5 rounded-full ${STATE_DOT[state]}`} />{STATE_LABEL[state]}</Badge>
);

export const PRIORITY_CLASS: Record<Priority, string> = {
  P1: 'bg-danger text-white',
  P2: 'bg-orange-500 text-white',
  P3: 'bg-amber-100 text-amber-700',
  P4: 'bg-gray-100 text-gray-500',
};
export const PriorityBadge: React.FC<{ p: Priority }> = ({ p }) => <Badge className={PRIORITY_CLASS[p]} title={PRIORITY_LABEL[p]}>{p}</Badge>;

const WO_CLASS: Record<WorkOrderStatus, string> = {
  A_PLANIFIER: 'bg-blue-50 text-blue-600',
  PLANIFIE: 'bg-indigo-50 text-indigo-600',
  EN_COURS: 'bg-primary/10 text-primary',
  EN_ATTENTE: 'bg-amber-100 text-amber-700',
  CLOTURE: 'bg-success/10 text-success',
  ANNULE: 'bg-gray-100 text-gray-400',
};
export const WoStatusBadge: React.FC<{ s: WorkOrderStatus }> = ({ s }) => <Badge className={WO_CLASS[s]}>{WORK_ORDER_STATUS_LABEL[s]}</Badge>;

const REQ_CLASS: Record<RequestStatus, string> = {
  A_APPROUVER: 'bg-danger/10 text-danger',
  APPROUVEE: 'bg-blue-50 text-blue-600',
  PLANIFIEE: 'bg-indigo-50 text-indigo-600',
  CLOTUREE: 'bg-success/10 text-success',
  ANNULEE: 'bg-gray-100 text-gray-400',
};
export const ReqStatusBadge: React.FC<{ s: RequestStatus }> = ({ s }) => <Badge className={REQ_CLASS[s]}>{REQUEST_STATUS_LABEL[s]}</Badge>;

// ─── Mise en page ────────────────────────────────────────────────────────────

export const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`text-[10px] font-black uppercase tracking-widest text-gray-400 ${className}`}>{children}</div>
);

export const Card: React.FC<{ className?: string; children: React.ReactNode; onClick?: () => void }> = ({ className = '', children, onClick }) => (
  <div onClick={onClick} className={`bg-white rounded-[24px] border border-border shadow-sm ${onClick ? 'cursor-pointer hover:border-primary/40 transition-colors' : ''} ${className}`}>{children}</div>
);

export const PageHeader: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
    <div>
      <h1 className="text-2xl font-black text-dark tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="py-10 text-center text-sm text-gray-400 font-medium">{children}</div>
);

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90 shadow-sm shadow-primary/20',
  secondary: 'bg-white text-dark border border-border hover:border-primary/40',
  danger: 'bg-white text-danger border border-danger/30 hover:bg-danger/5',
  ghost: 'text-gray-500 hover:text-dark hover:bg-gray-50',
  success: 'bg-success text-white hover:bg-success/90',
};
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; icon?: React.ReactNode; small?: boolean }> = ({ variant = 'primary', loading, icon, small, children, className = '', disabled, ...rest }) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'} ${BTN[variant]} ${className}`}
  >
    {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
    {children}
  </button>
);

// Pile des fenêtres ouvertes : Échap ne ferme que celle du dessus.
const modalStack: number[] = [];
let modalSeq = 0;

export const Modal: React.FC<{ title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> = ({ title, subtitle, onClose, children, footer, wide }) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const id = ++modalSeq;
    modalStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id && !document.querySelector('.z-\\[600\\]')) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
    };
  }, []);
  return (
  <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center">
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
    <div role="dialog" aria-label={title} className={`relative bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] shadow-2xl`}>
      <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-dark tracking-tight">{title}</h2>
          {subtitle && <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>}
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-2 -m-2 text-gray-400 hover:text-dark rounded-xl"><X size={20} /></button>
      </div>
      <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">{children}</div>
      {footer && <div className="px-6 py-4 border-t border-border flex flex-wrap justify-end gap-2 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
    </div>
  </div>
  );
};

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string; required?: boolean; className?: string }> = ({ label, children, hint, required, className = '' }) => (
  <div role="group" aria-label={label} className={`block ${className}`}>
    <span className="block text-[11px] font-bold text-gray-500 mb-1.5">{label}{required && <span className="text-danger"> *</span>}</span>
    {children}
    {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
  </div>
);

export const inputCls = 'w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-dark placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50';
export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`${inputCls} ${props.className || ''}`} />;
export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...props} className={`${inputCls} ${props.className || ''}`} />;
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ children, className = '', ...rest }) => (
  <div className="relative">
    <select {...rest} className={`${inputCls} appearance-none pr-9 ${className}`}>{children}</select>
    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
  </div>
);

export const Segmented = <T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) => (
  <div className="inline-flex flex-wrap bg-gray-100 rounded-2xl p-1 gap-1">
    {options.map(o => (
      <button key={o.value} type="button" onClick={() => onChange(o.value)}
        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${value === o.value ? 'bg-white text-dark shadow-sm' : 'text-gray-500 hover:text-dark'}`}>{o.label}</button>
    ))}
  </div>
);

export const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'default' | 'danger' | 'warning' | 'success'; onClick?: () => void }> = ({ label, value, sub, tone = 'default', onClick }) => {
  const toneCls = { default: 'text-dark', danger: 'text-danger', warning: 'text-orange-500', success: 'text-success' }[tone];
  return (
    <Card onClick={onClick} className="p-4">
      <Label>{label}</Label>
      <div className={`text-3xl font-black mt-2 tracking-tight ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </Card>
  );
};

export const Info: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <Label>{label}</Label>
    <div className="text-sm text-dark mt-1 break-words">{children || '—'}</div>
  </div>
);

// ─── Sélection d'équipement ──────────────────────────────────────────────────

export const AssetPicker: React.FC<{ assets: Asset[]; value: string; onChange: (id: string) => void; siteName: (id: string) => string; autoFocus?: boolean }> = ({ assets, value, onChange, siteName, autoFocus }) => {
  const [q, setQ] = useState('');
  const selected = assets.find(a => a.id === value);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = assets.filter(a => !a.isArchived);
    if (!s) return list.filter(a => a.level === 'EQUIPEMENT').slice(0, 30);
    return list.filter(a => `${a.code} ${a.name} ${a.registration || ''}`.toLowerCase().includes(s)).slice(0, 30);
  }, [q, assets]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-black text-dark">{selected.code} <span className="font-medium text-gray-600">· {selected.name}</span></div>
          <div className="text-[11px] text-gray-500">{siteName(selected.siteId)}</div>
        </div>
        <button type="button" onClick={() => onChange('')} className="text-xs font-bold text-primary">Changer</button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-2 px-3 border-b border-border">
        <Search size={16} className="text-gray-400" />
        <input autoFocus={autoFocus} value={q} onChange={e => setQ(e.target.value)} placeholder="Code, désignation, immatriculation…" className="flex-1 py-2.5 text-sm focus:outline-none" />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {results.map(a => (
          <button type="button" key={a.id} onClick={() => onChange(a.id)} className="w-full text-left px-3 py-2 hover:bg-primary/5 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0">
            <span className="text-sm"><b>{a.code}</b> · {a.name}</span>
            <span className="text-[11px] text-gray-400 shrink-0">{siteName(a.siteId)}</span>
          </button>
        ))}
        {!results.length && <div className="px-3 py-4 text-sm text-gray-400">Aucun équipement trouvé.</div>}
      </div>
    </div>
  );
};

// ─── Sélection d'intervenants ────────────────────────────────────────────────

export const UserChips: React.FC<{ users: GmaoUser[]; value: string[]; onChange: (ids: string[]) => void }> = ({ users, value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {users.map(u => {
      const on = value.includes(u.id);
      return (
        <button type="button" key={u.id} onClick={() => onChange(on ? value.filter(x => x !== u.id) : [...value, u.id])}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${on ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-border hover:border-primary/40'}`}>
          {on && <Check size={12} />}{u.name}
        </button>
      );
    })}
    {!users.length && <span className="text-sm text-gray-400">Aucun technicien enregistré.</span>}
  </div>
);

// ─── Photos ──────────────────────────────────────────────────────────────────

export const PhotoInput: React.FC<{ value: string[]; onChange: (urls: string[]) => void; upload: (f: File) => Promise<string>; max?: number }> = ({ value, onChange, upload, max = 4 }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, max - value.length)) urls.push(await upload(f));
      onChange([...value, ...urls]);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {value.map((u, i) => (
        <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
          <img src={u} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/60 text-white rounded-lg p-0.5" aria-label="Retirer la photo"><X size={12} /></button>
        </div>
      ))}
      {value.length < max && (
        <button type="button" onClick={() => ref.current?.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-border text-gray-400 hover:text-primary hover:border-primary/40 flex flex-col items-center justify-center gap-1">
          {busy ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
          <span className="text-[10px] font-bold">Photo</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => pick(e.target.files)} />
    </div>
  );
};

export const PhotoStrip: React.FC<{ urls?: string[] }> = ({ urls }) => (
  urls && urls.length ? (
    <div className="flex flex-wrap gap-2">
      {urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="w-20 h-20 object-cover rounded-xl border border-border" /></a>)}
    </div>
  ) : null
);

// ─── Check-list ──────────────────────────────────────────────────────────────

export const ChecklistForm: React.FC<{ checklist: GmaoChecklist; value: ChecklistAnswers; onChange: (v: ChecklistAnswers) => void; upload?: (f: File) => Promise<string>; safety?: boolean }> = ({ checklist, value, onChange, upload, safety }) => {
  const set = (id: string, v: any) => onChange({ ...value, [id]: { ...(value[id] || {}), value: v } });
  return (
    <div className="space-y-2">
      {checklist.items.map(item => {
        const v = value[item.id]?.value;
        return (
          <div key={item.id} className={`rounded-2xl border px-4 py-3 ${safety && v === false ? 'border-danger/40 bg-danger/5' : 'border-border'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-dark">{item.label}{item.required && <span className="text-danger"> *</span>}</div>
              {item.type === 'BOOLEAN' && (
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => set(item.id, true)} className={`px-3 py-1 rounded-lg text-xs font-black ${v === true ? 'bg-success text-white' : 'bg-gray-100 text-gray-500'}`}>{safety ? 'OK' : 'Conforme'}</button>
                  <button type="button" onClick={() => set(item.id, false)} className={`px-3 py-1 rounded-lg text-xs font-black ${v === false ? 'bg-danger text-white' : 'bg-gray-100 text-gray-500'}`}>{safety ? 'Non' : 'Non conforme'}</button>
                </div>
              )}
            </div>
            {item.type === 'TEXT' && <Input className="mt-2" value={v || ''} onChange={e => set(item.id, e.target.value)} />}
            {item.type === 'NUMBER' && <Input className="mt-2" type="number" inputMode="decimal" value={v ?? ''} onChange={e => set(item.id, e.target.value === '' ? '' : Number(e.target.value))} />}
            {item.type === 'PHOTO' && upload && <div className="mt-2"><PhotoInput value={v ? [v] : []} max={1} upload={upload} onChange={urls => set(item.id, urls[0] || '')} /></div>}
          </div>
        );
      })}
    </div>
  );
};

export const ChecklistAnswersView: React.FC<{ checklist?: GmaoChecklist; answers?: ChecklistAnswers | null }> = ({ checklist, answers }) => {
  if (!checklist || !answers) return null;
  return (
    <div className="space-y-1">
      {checklist.items.map(i => {
        const v = answers[i.id]?.value;
        const txt = v === true ? 'Conforme' : v === false ? 'Non conforme' : (v === undefined || v === '' ? '—' : String(v));
        return (
          <div key={i.id} className="flex justify-between gap-3 text-sm py-1 border-b border-gray-50 last:border-0">
            <span className="text-gray-600">{i.label}</span>
            {i.type === 'PHOTO' && v ? <a href={v} target="_blank" rel="noreferrer" className="text-primary font-bold">Photo</a>
              : <span className={`font-bold ${v === false ? 'text-danger' : v === true ? 'text-success' : 'text-dark'}`}>{txt}</span>}
          </div>
        );
      })}
    </div>
  );
};

/** Export CSV (séparateur ;, BOM UTF-8) — même convention que le reste de Miki. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
