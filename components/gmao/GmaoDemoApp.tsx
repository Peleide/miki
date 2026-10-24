import React, { useMemo, useState } from 'react';
import { HardHat, Wrench, ClipboardCheck, ChevronDown } from 'lucide-react';
import { GmaoShell } from './GmaoShell';
import { DEMO_USERS, demoBackend } from '../../services/gmao/demoBackend';
import { ROLE_LABEL } from '../../functions/src/gmao/model';
import { Logo } from '../Logo';

const KEY = 'miki_gmao_demo_persona';
const ICON = { RESPONSABLE: ClipboardCheck, TECHNICIEN: Wrench, DEMANDEUR: HardHat } as const;
const PITCH = {
  RESPONSABLE: 'Approuve les demandes, planifie l’équipe, suit le parc et les indicateurs.',
  TECHNICIEN: 'Voit son planning, démarre et clôture ses interventions depuis le terrain.',
  DEMANDEUR: 'Signale un problème en scannant l’engin et suit le traitement de sa demande.',
} as const;

/** Démo autonome (sans Firebase) : ?demo dans l'URL. */
export const GmaoDemoApp: React.FC = () => {
  const [personaId, setPersonaId] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const persona = DEMO_USERS.find(u => u.id === personaId);
  const backend = useMemo(() => (persona ? demoBackend({ id: persona.id, name: persona.name, role: persona.role }) : null), [persona?.id]);

  const choose = (id: string | null) => {
    setPersonaId(id);
    try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* ignoré */ }
  };

  if (!persona || !backend) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <div className="flex items-center gap-3 mb-8"><Logo className="h-10" showText={false} /><div><div className="text-xl font-black text-dark">GMAO · démonstration</div><div className="text-sm text-gray-500">Données fictives, stockées dans ce navigateur.</div></div></div>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Choisissez un profil</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {DEMO_USERS.filter((u, i, all) => all.findIndex(x => x.role === u.role) === i || u.role === 'TECHNICIEN').slice(0, 5).map(u => {
              const Icon = ICON[u.role];
              return (
                <button key={u.id} onClick={() => choose(u.id)} className="text-left bg-white border border-border rounded-[24px] p-5 hover:border-primary/50 hover:shadow-md transition-all">
                  <Icon className="text-primary" size={28} />
                  <div className="font-black text-dark mt-3">{u.name}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{ROLE_LABEL[u.role]}</div>
                  <p className="text-xs text-gray-500 mt-2">{PITCH[u.role]}</p>
                </button>
              );
            })}
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
        {DEMO_USERS.map(u => <option key={u.id} value={u.id}>Démo : {u.name} ({ROLE_LABEL[u.role]})</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-700 pointer-events-none" />
    </div>
  );

  return <GmaoShell key={persona.id} backend={backend} me={persona} orgName="CSP · Maintenance (démo)" onLogout={() => choose(null)} headerExtra={switcher} />;
};
