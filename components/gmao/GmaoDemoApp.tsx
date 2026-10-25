import React, { useEffect, useMemo, useState } from 'react';
import { Wrench, ClipboardCheck, ChevronDown, Building2, Smartphone, Loader2 } from 'lucide-react';
import { GmaoShell } from './GmaoShell';
import { PublicReportPage } from './PublicReportPage';
import { DEMO_ORG, demoBackend, demoPublicBackend, demoUsers, getDemoEngine } from '../../services/gmao/demoBackend';
import { COLL, GmaoUser, ROLE_LABEL, qrPath, tokenFromScan } from '../../functions/src/gmao/model';
import { Logo } from '../Logo';

const KEY = 'miki_gmao_demo_persona';
const ICON = { RESPONSABLE: ClipboardCheck, TECHNICIEN: Wrench, CLIENT: Building2 } as const;
const PITCH: Record<string, string> = {
  'demo-resp': 'Responsable maintenance : planifie l’équipe, programme le préventif, gère le parc, les clients et les comptes.',
  'demo-tech1': 'Technicien véhicules et centrales de dilution : son planning, ses relevés kilométriques, ses interventions.',
  'demo-tech2': 'Technicien engins de nettoyage : il ne voit que les machines de son parc (et celles partagées).',
  'demo-client': 'Cliente (Clinique du Lagon) : suit les maintenances de ses machines, signale un problème, laisse une remarque.',
};

/** Démo autonome (sans Firebase) : ?demo dans l'URL. Gère aussi /q/<jeton>?demo (QR code scanné sans l'application). */
export const GmaoDemoApp: React.FC = () => {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const publicToken = tokenFromScan(path);
  const openToken = params.get('open');
  const [users, setUsers] = useState<GmaoUser[] | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [sampleToken, setSampleToken] = useState<string | null>(null);

  useEffect(() => {
    demoUsers().then(setUsers);
    getDemoEngine().ready.then(() => {
      const assets = Object.values(getDemoEngine().state.collections[COLL.assets] || {}) as any[];
      setSampleToken(assets.find(a => a.name === 'Autolaveuse Kärcher B 40')?.qrToken || assets[0]?.qrToken || null);
    });
  }, []);
  const persona = users?.find(u => u.id === personaId);
  const backend = useMemo(() => (persona ? demoBackend({ id: persona.id, name: persona.name, role: persona.role, clientId: persona.clientId || null }) : null), [persona?.id, persona?.clientId]);

  const choose = (id: string | null) => {
    setPersonaId(id);
    try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* ignoré */ }
  };

  if (publicToken) {
    return <PublicReportPage backend={demoPublicBackend()} token={publicToken} staffHref={`/?demo&open=${publicToken}`} />;
  }
  if (!users) return <div className="min-h-[100dvh] flex items-center justify-center"><Loader2 className="animate-spin text-primary/50" size={36} /></div>;

  if (!persona || !backend) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <div className="flex items-center gap-3 mb-8"><Logo className="h-10" showText={false} /><div><div className="text-xl font-black text-dark">Miki GMAO · démonstration</div><div className="text-sm text-gray-500">{DEMO_ORG} : données fictives, stockées dans ce navigateur.</div></div></div>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Choisissez un profil</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {users.map(u => {
              const Icon = ICON[u.role];
              return (
                <button key={u.id} onClick={() => choose(u.id)} className="text-left bg-white border border-border rounded-[24px] p-5 hover:border-primary/50 hover:shadow-md transition-all">
                  <Icon className="text-primary" size={28} />
                  <div className="font-black text-dark mt-3">{u.name}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{ROLE_LABEL[u.role]}</div>
                  <p className="text-xs text-gray-500 mt-2">{PITCH[u.id]}</p>
                </button>
              );
            })}
            {sampleToken && (
              <a href={`${qrPath(sampleToken)}?demo`} className="text-left bg-white border border-dashed border-border rounded-[24px] p-5 hover:border-primary/50 hover:shadow-md transition-all sm:col-span-2 flex items-start gap-4">
                <Smartphone className="text-primary shrink-0" size={28} />
                <div>
                  <div className="font-black text-dark">Téléphone sans application</div>
                  <p className="text-xs text-gray-500 mt-1">Ce que voit n’importe qui en scannant le QR code d’une autolaveuse avec l’appareil photo de son téléphone : un formulaire de signalement, sans compte.</p>
                </div>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const switcher = (
    <div className="relative hidden sm:block">
      <select
        aria-label="Changer de profil"
        value={persona.id}
        onChange={e => choose(e.target.value)}
        className="appearance-none bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl pl-3 pr-7 py-2 focus:outline-none"
      >
        {users.map(u => <option key={u.id} value={u.id}>Démo : {u.name} ({ROLE_LABEL[u.role]})</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-700 pointer-events-none" />
    </div>
  );

  return <GmaoShell key={persona.id} backend={backend} me={persona} onLogout={() => choose(null)} headerExtra={switcher} openToken={openToken} />;
};
