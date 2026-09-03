
import React, { useState } from 'react';
import { db } from '../services/db';
import { User } from '../types';
import { LogIn, Loader2, AlertCircle } from 'lucide-react';
import { Logo } from './Logo';

const DEV_ROLES = [
  { label: 'Admin',       email: 'admin@miki.nc',   color: 'bg-gray-900 text-white',    desc: 'Plateforme complète' },
  { label: 'Technicien',  email: 'tech@miki.nc',    color: 'bg-indigo-600 text-white',  desc: 'Gestion · Visites CDil · Tickets' },
  { label: 'Agent',       email: 'agent@miki.nc',   color: 'bg-emerald-600 text-white', desc: 'Scan QR · Emprunts' },
  { label: 'Client',      email: 'client@miki.nc',  color: 'bg-amber-500 text-white',   desc: 'Dashboard lecture seule' },
];

export const Login: React.FC<{ onLoginSuccess: (user: User) => void }> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const loginAs = async (roleEmail: string, roleLabel: string) => {
    setLoading(roleLabel);
    setError(null);
    try {
      const user = await db.authenticate(roleEmail, 'password123');
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion.');
    } finally {
      setLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading('form');
    setError(null);
    try {
      const user = await db.authenticate(email, password);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Identifiants incorrects.');
    } finally {
      setLoading(null);
    }
  };

  if (import.meta.env.DEV) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 font-sans">
        <div className="bg-white p-8 rounded-[32px] floating-light w-full max-w-sm border border-border animate-in slide-in-from-bottom-12">
          <div className="flex justify-center mb-8">
            <Logo className="h-14" />
          </div>

          <div className="mb-6 flex items-center gap-2">
            <span className="flex-1 h-px bg-border" />
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Accès rapide démo</span>
            <span className="flex-1 h-px bg-border" />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-danger rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="space-y-2.5">
            {DEV_ROLES.map(role => (
              <button
                key={role.email}
                onClick={() => loginAs(role.email, role.label)}
                disabled={loading !== null}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-60 ${role.color}`}
              >
                <div className="text-left">
                  <div className="text-[11px] font-black uppercase tracking-widest">{role.label}</div>
                  <div className="text-[10px] opacity-70 font-medium mt-0.5">{role.desc}</div>
                </div>
                {loading === role.label
                  ? <Loader2 size={16} className="animate-spin opacity-80" />
                  : <LogIn size={16} className="opacity-60" />
                }
              </button>
            ))}
          </div>

          <div className="mt-6 text-center">
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Mode émulateur local</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 font-sans">
      <div className="bg-white p-10 rounded-[32px] floating-light w-full max-w-md border border-border animate-in slide-in-from-bottom-12">
        <div className="flex justify-center mb-12">
          <Logo className="h-16" />
        </div>

        <h2 className="text-2xl font-black text-center text-dark mb-10 tracking-tight">Bienvenue</h2>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-danger rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">E-mail professionnel</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-border rounded-2xl p-4 text-sm font-bold text-dark outline-none focus:ring-4 focus:ring-primary/10 transition-all"
              placeholder="votre@email.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-border rounded-2xl p-4 text-sm font-bold text-dark outline-none focus:ring-4 focus:ring-primary/10 transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading !== null}
            className="w-full bg-primary text-white font-black py-5 rounded-[24px] shadow-2xl shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 text-xs tracking-[0.2em] uppercase"
          >
            {loading ? <Loader2 size={24} className="animate-spin" /> : <LogIn size={20} />}
            Se connecter
          </button>
        </form>

        <div className="mt-8 text-center border-t border-border pt-6">
           <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
             Accès réservé au personnel autorisé
           </p>
        </div>
      </div>
    </div>
  );
};
