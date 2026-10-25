import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Wrench, Loader2 } from 'lucide-react';
import { functions } from '../../services/firebaseConfig';
import { PLANS, PlanTier } from '../../functions/src/gmao/model';
import { KITS } from '../../functions/src/gmao/kits';

const inputCls = 'w-full border-2 border-border rounded-2xl p-3 text-sm font-bold text-dark outline-none focus:border-primary';
const labelCls = 'text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1';
const TIERS = Object.keys(PLANS) as PlanTier[];

/** Console plateforme : création d'une organisation GMAO (offre, kits, responsable) et changement d'offre. */
export const GmaoAdminPanel: React.FC<{ tenants: any[]; onChanged: () => void; toast: (m: string, t?: any) => void }> = ({ tenants, onChanged, toast }) => {
  const [f, setF] = useState({ name: '', tier: 'STARTER' as PlanTier, assetCodeMode: 'GENERATED', assetCodePrefix: 'MAC', kits: [] as string[], firstName: '', lastName: '', email: '', maxTechnicians: '', maxAssets: '', maxClients: '' });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const gmaoTenants = tenants.filter(t => t.modules?.gmao);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res: any = await httpsCallable(functions, 'gmaoCreateOrganization')({
        name: f.name, tier: f.tier, assetCodeMode: f.assetCodeMode, assetCodePrefix: f.assetCodePrefix, kits: f.kits,
        limits: f.tier === 'SUR_MESURE' ? { maxTechnicians: f.maxTechnicians, maxAssets: f.maxAssets, maxClients: f.maxClients } : undefined,
      });
      if (f.email.trim()) {
        const u: any = await httpsCallable(functions, 'manageUser')({ action: 'CREATE', tenantId: res.data.id, userData: { email: f.email.trim(), firstName: f.firstName.trim(), lastName: f.lastName.trim(), role: 'TECHNICIAN' } });
        setCreated({ email: f.email.trim(), password: u.data?.password || '' });
      }
      toast('Organisation GMAO créée.', 'success');
      setF(p => ({ ...p, name: '', firstName: '', lastName: '', email: '' }));
      onChanged();
    } catch (err: any) {
      toast(err?.message || 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  const changeTier = async (tenantId: string, tier: PlanTier) => {
    try {
      await httpsCallable(functions, 'gmaoSetPlan')({ tenantId, tier });
      toast(`Offre ${PLANS[tier].label} appliquée.`, 'success');
      onChanged();
    } catch (err: any) { toast(err?.message || 'Échec.'); }
  };

  return (
    <div className="bg-white p-8 rounded-[40px] border border-border shadow-sm space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Wrench size={20} /></div>
        <h3 className="text-[11px] font-black uppercase text-dark tracking-widest">Organisations GMAO</h3>
      </div>
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1.5 md:col-span-2"><label className={labelCls}>Nom de l'organisation</label><input required value={f.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Ex. : Groupe WDP" /></div>
        <div className="space-y-1.5">
          <label className={labelCls}>Offre</label>
          <select value={f.tier} onChange={e => set('tier', e.target.value)} className={`${inputCls} bg-white`}>
            {TIERS.map(t => <option key={t} value={t}>{PLANS[t].label} · {PLANS[t].maxTechnicians} tech. · {PLANS[t].maxAssets} machines · {PLANS[t].maxClients} clients{PLANS[t].priceXpf ? ` · ${PLANS[t].priceXpf!.toLocaleString('fr-FR')} XPF/an` : ''}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Codes machine</label>
          <div className="flex gap-2">
            <select value={f.assetCodeMode} onChange={e => set('assetCodeMode', e.target.value)} className={`${inputCls} bg-white`}><option value="GENERATED">Générés</option><option value="MANUAL">Codes de l'entreprise</option></select>
            {f.assetCodeMode === 'GENERATED' && <input value={f.assetCodePrefix} maxLength={6} onChange={e => set('assetCodePrefix', e.target.value.toUpperCase())} className={`${inputCls} w-28`} placeholder="Préfixe" />}
          </div>
        </div>
        {f.tier === 'SUR_MESURE' && (
          <div className="md:col-span-2 grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><label className={labelCls}>Techniciens</label><input type="number" min={1} value={f.maxTechnicians} onChange={e => set('maxTechnicians', e.target.value)} className={inputCls} /></div>
            <div className="space-y-1.5"><label className={labelCls}>Machines</label><input type="number" min={1} value={f.maxAssets} onChange={e => set('maxAssets', e.target.value)} className={inputCls} /></div>
            <div className="space-y-1.5"><label className={labelCls}>Clients</label><input type="number" min={0} value={f.maxClients} onChange={e => set('maxClients', e.target.value)} className={inputCls} /></div>
          </div>
        )}
        <div className="space-y-1.5 md:col-span-2">
          <label className={labelCls}>Kits de démarrage</label>
          <div className="flex flex-wrap gap-2">
            {KITS.map(k => {
              const on = f.kits.includes(k.id);
              return <button type="button" key={k.id} onClick={() => set('kits', on ? f.kits.filter(x => x !== k.id) : [...f.kits, k.id])} className={`px-3 py-2 rounded-xl text-xs font-bold border ${on ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-border'}`}>{k.name}</button>;
            })}
          </div>
        </div>
        <div className="md:col-span-2 grid md:grid-cols-3 gap-3">
          <div className="space-y-1.5"><label className={labelCls}>Responsable : prénom</label><input value={f.firstName} onChange={e => set('firstName', e.target.value)} className={inputCls} /></div>
          <div className="space-y-1.5"><label className={labelCls}>Nom</label><input value={f.lastName} onChange={e => set('lastName', e.target.value)} className={inputCls} /></div>
          <div className="space-y-1.5"><label className={labelCls}>E-mail</label><input type="email" value={f.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="facultatif" /></div>
        </div>
        <button type="submit" disabled={busy || !f.name.trim()} className="md:col-span-2 bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 uppercase tracking-widest text-[11px] flex items-center justify-center gap-2">{busy && <Loader2 size={16} className="animate-spin" />}Créer l'organisation GMAO</button>
      </form>
      {created && (
        <div className="rounded-2xl bg-gray-50 p-4 font-mono text-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 font-sans mb-1">Compte responsable (mot de passe provisoire)</div>
          <div>{created.email}</div><div className="text-lg font-black tracking-widest">{created.password}</div>
        </div>
      )}
      {gmaoTenants.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-border"><th className="py-2">Organisation</th><th className="py-2">Offre</th><th className="py-2">Limites</th></tr></thead>
          <tbody>
            {gmaoTenants.map(t => (
              <tr key={t.id} className="border-b border-gray-50">
                <td className="py-2.5 font-black text-dark">{t.name}</td>
                <td className="py-2.5">
                  <select value={t.plan?.tier || ''} onChange={e => changeTier(t.id, e.target.value as PlanTier)} className="border border-border rounded-xl px-2 py-1.5 text-xs font-bold bg-white">
                    {!t.plan && <option value="">Sans offre (illimité)</option>}
                    {TIERS.map(x => <option key={x} value={x}>{PLANS[x].label}</option>)}
                  </select>
                </td>
                <td className="py-2.5 text-xs text-gray-500">{t.plan ? `${t.plan.maxTechnicians} tech. · ${t.plan.maxAssets} machines · ${t.plan.maxClients} clients` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
