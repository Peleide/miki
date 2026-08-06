import React, { useState, useEffect } from 'react';
import { User, CdilUnit, VisitSession, VisitEntry, ComponentState } from '../types';
import { db } from '../services/db';
import { Plus, ChevronLeft, Save, CheckCircle, Download, ClipboardList, Loader2, Trash2, Zap, CalendarDays, Camera, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

interface CdilVisitPanelProps {
  user: User;
}

type PanelView = 'list' | 'fill';

const STATE_LABEL: Record<string, string> = { ok: 'OK (0)', '1': '1 remplacement', '2': '2 remplacements' };
const STATE_CLASS: Record<string, string> = {
  ok:  'bg-success/10 text-success border-success/30',
  '1': 'bg-orange-50 text-orange-600 border-orange-200',
  '2': 'bg-danger/10 text-danger border-danger/30',
};

function exportToCsv(session: VisitSession) {
  const typeLabel = session.sessionType === 'INTERVENTION' ? 'Intervention inopinée' : 'Visite périodique';
  const headers = ['Date', 'Type de visite', 'Technicien', 'Localisation', 'Service', 'N° Série', 'Buse', 'Crépine', 'Ligne aspiration', 'Remarques'];
  const rows = session.entries.map(e => [
    session.date,
    typeLabel,
    session.technicianName,
    e.location,
    e.service,
    e.serialNumber,
    String(e.buse),
    String(e.crepine),
    String(e.ligne),
    e.remarks || '',
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n');

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CDil_${session.title.replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const CdilVisitPanel: React.FC<CdilVisitPanelProps> = ({ user }) => {
  const { confirm, toast, dialogNode } = useDialog();
  const [view, setView] = useState<PanelView>('list');
  const [sessions, setSessions] = useState<VisitSession[]>([]);
  const [activeSession, setActiveSession] = useState<VisitSession | null>(null);
  const [entries, setEntries] = useState<VisitEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'DRAFT' | 'COMPLETED'>('DRAFT');

  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSessionType, setNewSessionType] = useState<'PERIODIQUE' | 'INTERVENTION'>('PERIODIQUE');
  const [availableUnits, setAvailableUnits] = useState<CdilUnit[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  const [photoModal, setPhotoModal] = useState<number | null>(null);
  const [uploadingPhotoIdx, setUploadingPhotoIdx] = useState<number | null>(null);

  useEffect(() => { loadSessions(); }, [user.tenantId]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const s = await db.getVisitSessions(user.tenantId, 'CDIL');
      setSessions(s);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openNewForm = async () => {
    setShowNewForm(true);
    setNewSessionType('PERIODIQUE');
    setSelectedUnitIds([]);
    if (availableUnits.length === 0) {
      try {
        const units = await db.getCdilUnits(user.tenantId);
        setAvailableUnits(units);
      } catch { /* silence */ }
    }
  };

  const toggleUnit = (id: string) =>
    setSelectedUnitIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSessionType === 'INTERVENTION' && selectedUnitIds.length === 0) {
      toast('Sélectionnez au moins une centrale pour cette intervention.', 'info');
      return;
    }
    setSaving(true);
    try {
      const result = await db.createVisitSession(user.tenantId, {
        title: newTitle || undefined,
        date: newDate,
        type: 'CDIL',
        sessionType: newSessionType,
        unitIds: newSessionType === 'INTERVENTION' ? selectedUnitIds : undefined,
      });
      await loadSessions();
      const session = await db.getVisitSession(user.tenantId, result.id);
      if (session) openSession(session);
      setShowNewForm(false);
      setNewTitle('');
    } catch (e: any) {
      toast(e.message || 'Erreur lors de la création');
    } finally { setSaving(false); }
  };

  const openSession = (session: VisitSession) => {
    setActiveSession(session);
    setEntries([...session.entries]);
    setView('fill');
  };

  const updateEntry = (idx: number, field: keyof VisitEntry, value: string | ComponentState) => {
    setEntries(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addPhotoToEntry = (idx: number, url: string) => {
    setEntries(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], photos: [...(next[idx].photos || []), url] };
      return next;
    });
  };

  const removePhotoFromEntry = (idx: number, url: string) => {
    setEntries(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], photos: (next[idx].photos || []).filter(p => p !== url) };
      return next;
    });
  };

  const handlePhotoUpload = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length || !activeSession) return;
    setUploadingPhotoIdx(idx);
    try {
      const urls = await Promise.all(
        files.map(f => db.uploadVisitPhoto(user.tenantId, activeSession.id, entries[idx].unitId, f))
      );
      urls.forEach(url => addPhotoToEntry(idx, url));
    } catch (err: any) {
      toast(err.message || 'Erreur lors du téléchargement');
    } finally {
      setUploadingPhotoIdx(null);
      e.target.value = '';
    }
  };

  const handleDeletePhoto = async (idx: number, url: string) => {
    const ok = await confirm({ title: 'Supprimer la photo', message: 'Cette photo sera supprimée définitivement.', confirmLabel: 'Supprimer', variant: 'danger' });
    if (!ok) return;
    try {
      await db.deleteVisitPhoto(url);
      removePhotoFromEntry(idx, url);
    } catch (err: any) {
      toast(err.message || 'Erreur lors de la suppression');
    }
  };

  const handleSave = async () => {
    if (!activeSession) return;
    setSaving(true);
    try {
      await db.saveVisitEntries(user.tenantId, activeSession.id, entries);
      setActiveSession(s => s ? { ...s, entries } : s);
    } catch (e: any) {
      toast(e.message || 'Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const handleComplete = async () => {
    if (!activeSession) return;
    const ok = await confirm({ title: 'Clôturer la visite', message: 'Les états de chaque centrale seront mis à jour. Cette action est irréversible.', confirmLabel: 'Clôturer', variant: 'danger' });
    if (!ok) return;
    setSaving(true);
    try {
      await db.saveVisitEntries(user.tenantId, activeSession.id, entries);
      await db.completeVisitSession(user.tenantId, activeSession.id);
      await loadSessions();
      setView('list');
      setActiveSession(null);
    } catch (e: any) {
      toast(e.message || 'Erreur lors de la clôture');
    } finally { setSaving(false); }
  };

  const handleDeleteDraft = async (sessionId: string) => {
    const ok = await confirm({ title: 'Supprimer le brouillon', message: 'Ce brouillon sera supprimé définitivement.', confirmLabel: 'Supprimer', variant: 'danger' });
    if (!ok) return;
    try {
      await db.deleteDraftVisitSession(user.tenantId, sessionId);
      await loadSessions();
    } catch (e: any) { toast(e.message || 'Erreur'); }
  };

  const drafts = sessions.filter(s => s.status === 'DRAFT');
  const completed = sessions.filter(s => s.status === 'COMPLETED');

  // ── Formulaire de saisie d'une session ──
  if (view === 'fill' && activeSession) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-24 h-full overflow-y-auto no-scrollbar">
        <button onClick={() => { setView('list'); setActiveSession(null); }} className="flex items-center gap-2 text-gray-400 hover:text-dark font-black text-xs uppercase tracking-widest mb-6 transition-colors">
          <ChevronLeft size={16}/> Retour
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${activeSession.sessionType === 'INTERVENTION' ? 'bg-orange-100 text-orange-600' : 'bg-primary/10 text-primary'}`}>
                {activeSession.sessionType === 'INTERVENTION' ? 'Intervention inopinée' : 'Visite périodique'}
              </span>
            </div>
            <h2 className="text-2xl font-black text-dark tracking-tight">{activeSession.title}</h2>
            <p className="text-gray-400 text-sm font-medium mt-1">
              {new Date(activeSession.date).toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
              {' · '}{activeSession.entries.length} centrale{activeSession.entries.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-dark rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Enregistrer
            </button>
            <button onClick={handleComplete} disabled={saving} className="flex items-center gap-2 px-6 py-3 bg-success text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-success/20 hover:scale-105 transition-all disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>} Clôturer
            </button>
          </div>
        </div>

        {/* Légende */}
        <div className="flex gap-3 flex-wrap mb-6">
          {(['ok', '1', '2'] as const).map(s => (
            <span key={s} className={`text-[10px] font-black px-3 py-1.5 rounded-xl border uppercase tracking-widest ${STATE_CLASS[s]}`}>
              {STATE_LABEL[s]}
            </span>
          ))}
        </div>

        {/* Grille de saisie */}
        <div className="bg-white border border-border rounded-[32px] overflow-hidden shadow-sm overflow-x-auto">
          {/* En-tête */}
          <div className="grid grid-cols-[1fr_100px_100px_100px_160px_80px] gap-0 bg-gray-50 border-b border-border min-w-[700px]">
            {['Localisation / Service', 'Buse', 'Crépine', 'Ligne asp.', 'Remarques', 'Photos'].map(h => (
              <div key={h} className="px-4 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{h}</div>
            ))}
          </div>

          {entries.map((entry, idx) => (
            <div key={entry.unitId || idx} className={`grid grid-cols-[1fr_100px_100px_100px_160px_80px] gap-0 border-b border-gray-50 hover:bg-primary/[0.02] transition-colors min-w-[700px] ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
              {/* Localisation */}
              <div className="px-4 py-4">
                <div className="font-black text-dark text-sm leading-none mb-1">{entry.location}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID: {entry.serialNumber}</div>
              </div>

              {/* Buse */}
              <div className="px-3 py-3 flex items-center">
                <select
                  value={String(entry.buse)}
                  onChange={e => updateEntry(idx, 'buse', e.target.value === 'ok' ? 'ok' : Number(e.target.value) as ComponentState)}
                  className={`w-full text-[11px] font-black border rounded-xl px-2 py-2 outline-none cursor-pointer ${STATE_CLASS[String(entry.buse)]}`}
                >
                  <option value="ok">OK</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>

              {/* Crépine */}
              <div className="px-3 py-3 flex items-center">
                <select
                  value={String(entry.crepine)}
                  onChange={e => updateEntry(idx, 'crepine', e.target.value === 'ok' ? 'ok' : Number(e.target.value) as ComponentState)}
                  className={`w-full text-[11px] font-black border rounded-xl px-2 py-2 outline-none cursor-pointer ${STATE_CLASS[String(entry.crepine)]}`}
                >
                  <option value="ok">OK</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>

              {/* Ligne aspiration */}
              <div className="px-3 py-3 flex items-center">
                <select
                  value={String(entry.ligne)}
                  onChange={e => updateEntry(idx, 'ligne', e.target.value === 'ok' ? 'ok' : Number(e.target.value) as ComponentState)}
                  className={`w-full text-[11px] font-black border rounded-xl px-2 py-2 outline-none cursor-pointer ${STATE_CLASS[String(entry.ligne)]}`}
                >
                  <option value="ok">OK</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>

              {/* Remarques */}
              <div className="px-3 py-3 flex items-center">
                <input
                  type="text"
                  value={entry.remarks || ''}
                  onChange={e => updateEntry(idx, 'remarks', e.target.value)}
                  placeholder="Remarques..."
                  className="w-full text-xs font-medium border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-primary bg-white"
                />
              </div>

              {/* Photos */}
              <div className="px-2 py-3 flex items-center justify-center">
                <button
                  onClick={() => setPhotoModal(idx)}
                  className="relative flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 transition-all text-gray-400 hover:text-primary"
                  title="Gérer les photos"
                >
                  {uploadingPhotoIdx === idx
                    ? <Loader2 size={14} className="animate-spin text-primary"/>
                    : <Camera size={14}/>
                  }
                  {(entry.photos?.length || 0) > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-primary text-white rounded-full w-4 h-4 flex items-center justify-center">
                      {entry.photos!.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          ))}

          {entries.length === 0 && (
            <div className="py-16 text-center text-gray-400 font-medium text-sm">
              Aucune unité CDil active à renseigner. Ajoutez des unités dans Gestion → Centrales.
            </div>
          )}
        </div>

        {/* Modale photos */}
        {photoModal !== null && entries[photoModal] && (
          <div className="fixed inset-0 z-[500] bg-black/50 flex items-center justify-center p-4" onClick={() => setPhotoModal(null)}>
            <div className="bg-white rounded-[32px] p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Photos</p>
                  <h3 className="font-black text-dark text-base leading-none">{entries[photoModal].location}</h3>
                </div>
                <button onClick={() => setPhotoModal(null)} className="p-2 text-gray-400 hover:text-dark rounded-xl hover:bg-gray-100 transition-all">
                  <X size={18}/>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                {(entries[photoModal].photos || []).map((url, pi) => (
                  <div key={pi} className="relative aspect-square rounded-2xl overflow-hidden group border border-gray-100">
                    <img src={url} alt={`Photo ${pi + 1}`} className="w-full h-full object-cover"/>
                    <button
                      onClick={() => handleDeletePhoto(photoModal, url)}
                      className="absolute top-1.5 right-1.5 p-1 bg-white/90 text-danger rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <X size={11}/>
                    </button>
                  </div>
                ))}

                {/* Bouton ajout */}
                <label className={`aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${uploadingPhotoIdx === photoModal ? 'border-primary/30 bg-primary/5' : 'border-gray-200 hover:border-primary hover:bg-primary/5'}`}>
                  {uploadingPhotoIdx === photoModal
                    ? <Loader2 size={22} className="animate-spin text-primary"/>
                    : <Camera size={22} className="text-gray-300 mb-1"/>
                  }
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ajouter</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={uploadingPhotoIdx !== null}
                    onChange={e => handlePhotoUpload(photoModal, e)}
                  />
                </label>
              </div>

              <button onClick={() => setPhotoModal(null)} className="w-full py-3 bg-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-200 transition-all">
                Fermer
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-8 py-4 bg-gray-100 text-dark rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Enregistrer le brouillon
          </button>
          <button onClick={handleComplete} disabled={saving} className="flex items-center gap-2 px-8 py-4 bg-success text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-success/20 hover:scale-105 transition-all disabled:opacity-50">
            <CheckCircle size={14}/> Clôturer la visite
          </button>
        </div>
        {dialogNode}
      </div>
    );
  }

  // ── Liste des sessions ──
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-24 h-full overflow-y-auto no-scrollbar">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-black text-dark tracking-tight">Visites Techniques — CDil</h2>
          <p className="text-gray-400 text-sm font-medium mt-1">Suivi des visites des centrales de dilution</p>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all"
        >
          <Plus size={16}/> Nouvelle visite
        </button>
      </div>

      {/* Formulaire nouvelle session */}
      {showNewForm && (
        <form onSubmit={handleCreateSession} className="bg-white border border-primary/20 rounded-[32px] p-8 mb-8 shadow-sm animate-in fade-in slide-in-from-top-2">
          <h3 className="font-black text-sm uppercase tracking-widest text-dark mb-6">Créer une nouvelle session</h3>

          {/* Type de visite */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {([
              { type: 'PERIODIQUE' as const, icon: CalendarDays, label: 'Visite périodique', sub: 'Toutes les centrales' },
              { type: 'INTERVENTION' as const, icon: Zap, label: 'Intervention inopinée', sub: 'Sélection de centrales' },
            ]).map(opt => (
              <button
                key={opt.type}
                type="button"
                onClick={() => { setNewSessionType(opt.type); setSelectedUnitIds([]); }}
                className={`flex flex-col items-start p-5 rounded-2xl border-2 transition-all text-left ${newSessionType === opt.type ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <opt.icon size={20} className={newSessionType === opt.type ? 'text-primary mb-2' : 'text-gray-300 mb-2'}/>
                <span className={`font-black text-xs uppercase tracking-widest ${newSessionType === opt.type ? 'text-primary' : 'text-gray-400'}`}>{opt.label}</span>
                <span className="text-[10px] font-medium text-gray-400 mt-0.5">{opt.sub}</span>
              </button>
            ))}
          </div>

          {/* Sélection unités (intervention seulement) */}
          {newSessionType === 'INTERVENTION' && (
            <div className="mb-6 border border-dashed border-orange-200 bg-orange-50/30 rounded-2xl p-4">
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-3">
                Centrales concernées ({selectedUnitIds.length} sélectionnée{selectedUnitIds.length > 1 ? 's' : ''})
              </p>
              {availableUnits.length === 0 ? (
                <p className="text-xs text-gray-400 font-medium">Aucune unité CDil active.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {availableUnits.map(u => (
                    <label key={u.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedUnitIds.includes(u.id) ? 'bg-orange-100' : 'bg-white hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={selectedUnitIds.includes(u.id)}
                        onChange={() => toggleUnit(u.id)}
                        className="accent-orange-500 w-4 h-4"
                      />
                      <div>
                        <span className="font-black text-dark text-sm">{u.location}</span>
                        <span className="text-[10px] font-bold text-gray-400 ml-2 uppercase">ID: {u.serialNumber}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Titre (optionnel)</label>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder={newSessionType === 'INTERVENTION' ? 'Intervention inopinée…' : `Visite technique ${new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`}
                className="w-full p-4 bg-gray-50 border rounded-2xl text-sm font-bold outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Date de la visite</label>
              <input
                type="date"
                required
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="w-full p-4 bg-gray-50 border rounded-2xl text-sm font-bold outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button type="button" onClick={() => setShowNewForm(false)} className="flex-1 py-4 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500">Annuler</button>
            <button type="submit" disabled={saving} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50">
              {saving ? 'Création...' : 'Créer et saisir'}
            </button>
          </div>
        </form>
      )}

      {/* Onglets */}
      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-border mb-6 w-fit">
        {([['DRAFT', 'En cours', drafts.length], ['COMPLETED', 'Historique', completed.length]] as const).map(([tab, label, count]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}
          >
            {label}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${activeTab === tab ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={32} className="animate-spin text-primary"/></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(activeTab === 'DRAFT' ? drafts : completed).map(session => (
            <div key={session.id} className="bg-white border rounded-[24px] p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-black text-dark text-base leading-tight mb-1">{session.title}</h4>
                  <p className="text-xs font-bold text-gray-400">
                    {new Date(session.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest shrink-0 ${session.status === 'DRAFT' ? 'bg-orange-100 text-orange-600' : 'bg-success/10 text-success'}`}>
                  {session.status === 'DRAFT' ? 'En cours' : 'Terminée'}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-4">
                <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${session.sessionType === 'INTERVENTION' ? 'bg-orange-100 text-orange-600' : 'bg-primary/10 text-primary'}`}>
                  {session.sessionType === 'INTERVENTION' ? 'Intervention' : 'Périodique'}
                </span>
                <span className="text-[10px] font-bold text-gray-300">·</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{session.entries.length} unité{session.entries.length > 1 ? 's' : ''}</span>
                <span className="text-[10px] font-bold text-gray-300">·</span>
                <span className="text-[10px] font-bold text-gray-400">{session.technicianName}</span>
              </div>

              {/* Résumé des états si complétée */}
              {session.status === 'COMPLETED' && (
                <div className="flex gap-2 flex-wrap mb-4">
                  {(['ok', '1', '2'] as const).map(state => {
                    const count = session.entries.filter(e =>
                      String(e.buse) === state || String(e.crepine) === state || String(e.ligne) === state
                    ).length;
                    if (count === 0) return null;
                    return (
                      <span key={state} className={`text-[9px] font-black px-2 py-1 rounded-lg border ${STATE_CLASS[state]}`}>
                        {STATE_LABEL[state]}: {count}
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-border">
                {session.status === 'DRAFT' ? (
                  <>
                    <button onClick={() => openSession(session)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                      <ClipboardList size={14}/> Continuer
                    </button>
                    <button onClick={() => handleDeleteDraft(session.id)} className="p-3 text-danger hover:bg-red-50 rounded-xl transition-all">
                      <Trash2 size={16}/>
                    </button>
                  </>
                ) : (
                  <button onClick={() => exportToCsv(session)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 text-dark hover:bg-primary hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                    <Download size={14}/> Exporter CSV
                  </button>
                )}
              </div>
            </div>
          ))}

          {(activeTab === 'DRAFT' ? drafts : completed).length === 0 && (
            <div className="col-span-full py-20 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[32px] text-center">
              <ClipboardList size={48} className="mx-auto text-gray-300 mb-4 opacity-50"/>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">
                {activeTab === 'DRAFT' ? 'Aucune visite en cours' : 'Aucune visite terminée'}
              </p>
            </div>
          )}
        </div>
      )}
      {dialogNode}
    </div>
  );
};
