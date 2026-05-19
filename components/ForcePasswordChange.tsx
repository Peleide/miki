
import React, { useState } from 'react';
import { db } from '../services/db';
import { User } from '../types';
import { Lock, Check, AlertTriangle, Loader2 } from 'lucide-react';

interface ForcePasswordChangeProps {
  user: User;
  onSuccess: (updatedUser: User) => void;
  onLogout: () => void;
}

export const ForcePasswordChange: React.FC<ForcePasswordChangeProps> = ({ user, onSuccess, onLogout }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validatePassword = (pwd: string) => {
    // Rule: Min 6 chars, at least 1 letter and 1 number
    const regex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/;
    return regex.test(pwd);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (!validatePassword(newPassword)) {
      setError("Le mot de passe doit contenir au moins 6 caractères, une lettre et un chiffre.");
      return;
    }

    setLoading(true);
    try {
      // FIX: On passe l'objet user complet pour permettre au service 
      // de déterminer le bon contexte (tenantId)
      const updatedUser = await db.updatePassword(user, newPassword);
      onSuccess(updatedUser);
    } catch (err: any) {
      setError(err.message || "Erreur lors de la mise à jour.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border-t-4 border-yellow-500">
        <div className="flex justify-center mb-6">
          <div className="h-14 w-14 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center">
            <Lock size={28} />
          </div>
        </div>
        
        <h2 className="text-xl font-bold text-center text-gray-800 mb-2">Sécurisez votre compte</h2>
        <p className="text-center text-gray-500 text-sm mb-6">
          C'est votre première connexion. Veuillez choisir un nouveau mot de passe personnel.
        </p>

        {error && (
          <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-xs font-medium flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Nouveau mot de passe</label>
            <input 
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-500 outline-none"
              placeholder="Min. 6 caractères"
            />
            <p className="text-[10px] text-gray-400 mt-1">Doit contenir lettres et chiffres.</p>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Confirmer mot de passe</label>
            <input 
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-500 outline-none"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Enregistrer et continuer
          </button>
        </form>

        <button 
          onClick={onLogout}
          className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600"
        >
          Annuler et se déconnecter
        </button>
      </div>
    </div>
  );
};
