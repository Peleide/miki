import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, ShieldAlert, X, QrCode, LogIn } from 'lucide-react';
import { AssetState } from '../../functions/src/gmao/model';
import { PublicBackend, toDataUrl } from '../../services/gmao/backend';
import { Logo } from '../Logo';

type Info = Awaited<ReturnType<PublicBackend['info']>>;

const inputCls = 'w-full rounded-2xl border border-border bg-white px-4 py-3 text-base text-dark placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50';

/** Page ouverte par le QR code d'une machine depuis un téléphone sans l'application : signalement sans compte. */
export const PublicReportPage: React.FC<{ backend: PublicBackend; token: string; staffHref: string }> = ({ backend, token, staffHref }) => {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ name: '', contact: '', description: '', declaredState: 'OPERATIONNEL' as AssetState, safety: false, website: '' });
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [done, setDone] = useState<{ number: string; duplicate?: boolean } | null>(null);
  const [formError, setFormError] = useState('');
  const openedAt = useRef(Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    backend.info(token).then(setInfo).catch(e => setError(e?.message || 'QR code inconnu.'));
    try { setF(p => ({ ...p, name: localStorage.getItem('miki_public_name') || '' })); } catch { /* ignoré */ }
  }, [token]);

  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoBusy(true);
    try {
      const next = [...photos];
      for (const file of Array.from(files).slice(0, 3 - photos.length)) next.push(await toDataUrl(file, 1024, 0.7));
      setPhotos(next);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (f.name.trim().length < 2) { setFormError('Indiquez votre nom.'); return; }
    if (f.description.trim().length < 8) { setFormError('Décrivez le problème en quelques mots.'); return; }
    setBusy(true);
    try {
      const res = await backend.report(token, { ...f, photos, elapsedMs: Date.now() - openedAt.current });
      try { localStorage.setItem('miki_public_name', f.name.trim()); } catch { /* ignoré */ }
      setDone(res);
    } catch (err: any) {
      setFormError(err?.message || 'Envoi impossible, réessayez.');
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] bg-background">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Logo className="h-8" showText={false} />
          <div className="min-w-0"><div className="text-sm font-black text-dark truncate">{info?.organization || 'Maintenance'}</div><div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Signalement</div></div>
        </div>
        {children}
        <a href={staffHref} className="mt-8 flex items-center justify-center gap-2 text-xs font-bold text-gray-400 hover:text-primary"><LogIn size={14} />Vous faites partie de l’équipe ? Ouvrir dans Miki</a>
      </div>
    </div>
  );

  if (error) return shell(<><div className="bg-white rounded-[24px] border border-border p-6 text-center"><QrCode className="mx-auto text-gray-300" size={40} /><p className="mt-3 font-bold text-dark">{error}</p><p className="text-sm text-gray-500 mt-1">Prévenez directement l’équipe maintenance.</p></div></>);
  if (!info) return shell(<><div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary/50" size={36} /></div></>);

  const machine = (
    <div className="bg-white rounded-[24px] border border-border p-4 mb-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Machine</div>
      <div className="text-xl font-black text-dark mt-1">{info.asset.name}</div>
      <div className="text-sm text-gray-500">{[info.asset.code, info.asset.typology, info.asset.site, info.asset.location].filter(Boolean).join(' · ')}</div>
    </div>
  );

  if (done) return (
    shell(<>
      {machine}
      <div className="bg-white rounded-[24px] border border-success/30 p-6 text-center">
        <CheckCircle2 className="mx-auto text-success" size={48} />
        <h1 className="text-xl font-black text-dark mt-3">Merci, c’est transmis</h1>
        <p className="text-sm text-gray-600 mt-1">{done.duplicate ? 'Ce problème avait déjà été signalé : l’équipe maintenance est au courant.' : 'L’équipe maintenance est prévenue.'}</p>
        <p className="text-xs text-gray-400 mt-3">Référence {done.number}</p>
        <button onClick={() => { setDone(null); setF(p => ({ ...p, description: '', safety: false, declaredState: 'OPERATIONNEL' })); setPhotos([]); openedAt.current = Date.now(); }} className="mt-5 text-sm font-bold text-primary">Signaler autre chose</button>
      </div>
    </>)
  );

  if (!info.enabled) return shell(<>{machine}<div className="bg-white rounded-[24px] border border-border p-6 text-center text-sm text-gray-600">Le signalement par QR code n’est pas activé pour cette machine. Prévenez directement l’équipe maintenance.</div></>);

  return (
    shell(<>
      {machine}
      <form onSubmit={submit} className="bg-white rounded-[24px] border border-border p-5 space-y-4" noValidate>
        <h1 className="text-lg font-black text-dark">Signaler un problème</h1>
        <label className="block">
          <span className="block text-sm font-bold text-dark mb-1.5">Votre nom <span className="text-danger">*</span></span>
          <input className={inputCls} value={f.name} onChange={e => set('name', e.target.value)} autoComplete="name" maxLength={80} required />
        </label>
        <label className="block">
          <span className="block text-sm font-bold text-dark mb-1.5">Que se passe-t-il ? <span className="text-danger">*</span></span>
          <textarea className={inputCls} rows={4} value={f.description} onChange={e => set('description', e.target.value)} maxLength={2000} placeholder="Ex. : la raclette laisse des traces d’eau, voyant rouge allumé…" required />
        </label>
        <div>
          <span className="block text-sm font-bold text-dark mb-1.5">La machine est-elle utilisable ?</span>
          <div className="grid grid-cols-3 gap-2">
            {([['OPERATIONNEL', 'Oui'], ['DEGRADE', 'Avec difficulté'], ['INDISPONIBLE', 'Non']] as [AssetState, string][]).map(([v, l]) => (
              <button type="button" key={v} onClick={() => set('declaredState', v)} className={`rounded-2xl border py-3 text-sm font-bold ${f.declaredState === v ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-border'}`}>{l}</button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => set('safety', !f.safety)} className={`w-full rounded-2xl border px-4 py-3 text-left flex items-center gap-3 ${f.safety ? 'border-danger bg-danger/5' : 'border-border'}`}>
          <ShieldAlert size={20} className={f.safety ? 'text-danger' : 'text-gray-400'} />
          <span className={`text-sm font-bold ${f.safety ? 'text-danger' : 'text-dark'}`}>Il y a un danger pour les personnes</span>
          <span className="ml-auto text-xs text-gray-500">{f.safety ? 'Oui' : 'Non'}</span>
        </button>
        <div>
          <span className="block text-sm font-bold text-dark mb-1.5">Photos <span className="font-normal text-gray-400">(facultatif)</span></span>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                <img src={p} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/60 text-white rounded-lg p-0.5" aria-label="Retirer la photo"><X size={12} /></button>
              </div>
            ))}
            {photos.length < 3 && (
              <button type="button" onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-border text-gray-400 flex flex-col items-center justify-center gap-1">
                {photoBusy ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}<span className="text-[10px] font-bold">Photo</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
          </div>
        </div>
        <label className="block">
          <span className="block text-sm font-bold text-dark mb-1.5">Téléphone ou e-mail <span className="font-normal text-gray-400">(facultatif, pour vous rappeler)</span></span>
          <input className={inputCls} value={f.contact} onChange={e => set('contact', e.target.value)} autoComplete="tel" maxLength={120} />
        </label>
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
          <label>Site web<input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} /></label>
        </div>
        {formError && <div className="rounded-2xl bg-danger/10 text-danger text-sm font-bold p-3">{formError}</div>}
        <button type="submit" disabled={busy} className="w-full rounded-2xl bg-primary text-white py-4 text-base font-black shadow-lg shadow-primary/20 disabled:opacity-60 flex items-center justify-center gap-2">
          {busy && <Loader2 size={18} className="animate-spin" />}Envoyer le signalement
        </button>
        <p className="text-[11px] text-gray-400 text-center">Votre nom et votre message sont transmis à l’équipe maintenance de {info.organization}.</p>
      </form>
    </>)
  );
};
