import React, { useEffect, useState } from 'react';
import { User, UserRole, Signalement, SignalementStatus, Equipment, Site } from '../types';
import { db } from '../services/db';
import { Plus, ArrowLeft, Send, X, CheckCircle, Clock, AlertTriangle, MessageSquare, Archive, ChevronRight, Loader2 } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

interface SignalementPanelProps {
  user: User;
}

const STATUS_LABEL: Record<SignalementStatus, string> = {
  NEW: 'Nouveau', IN_PROGRESS: 'En cours', RESOLVED: 'Résolu', CLOSED: 'Clôturé', ARCHIVED: 'Archivé',
};
const STATUS_CLASS: Record<SignalementStatus, string> = {
  NEW: 'bg-primary/10 text-primary',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-success/10 text-success',
  CLOSED: 'bg-gray-100 text-gray-500',
  ARCHIVED: 'bg-gray-100 text-gray-400',
};
const ROLE_LABEL: Record<string, string> = {
  TECHNICIAN: 'Technicien', ADMIN: 'Admin', AGENT: 'Agent', CLIENT: 'Client',
};

const FILTERS: { key: SignalementStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Tous' },
  { key: 'NEW', label: 'Nouveaux' },
  { key: 'IN_PROGRESS', label: 'En cours' },
  { key: 'RESOLVED', label: 'Résolus' },
  { key: 'CLOSED', label: 'Clôturés' },
];

export const SignalementPanel: React.FC<SignalementPanelProps> = ({ user }) => {
  const { toast, prompt, dialogNode } = useDialog();

  const [signalements, setSignalements] = useState<Signalement[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [filter, setFilter] = useState<SignalementStatus | 'ALL'>('ALL');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Signalement | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEqId, setNewEqId] = useState('');
  const [newSiteId, setNewSiteId] = useState('');

  const isCanManage = user.role === UserRole.TECHNICIAN || user.role === UserRole.ADMIN ||
    user.tenantsAccess?.['platform'] === UserRole.ADMIN;

  const loadData = async () => {
    setLoading(true);
    try {
      const [sigs, eqs, sts] = await Promise.all([
        db.getSignalements(user.tenantId),
        db.getEquipments(user.tenantId),
        db.getSites(user.tenantId),
      ]);
      setSignalements(sigs);
      setEquipments(eqs.filter((e: Equipment) => !e.isArchived));
      setSites(sts.filter((s: Site) => s.status !== 'ARCHIVED'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user.tenantId]);

  const filtered = signalements.filter(s => {
    if (s.isArchived && !showArchived) return false;
    if (s.isArchived) return showArchived;
    // For CLIENT: only own signalements (P2 will add full perimeter filter)
    if (user.role === UserRole.CLIENT && s.createdBy !== user.id) return false;
    if (filter === 'ALL') return s.status !== 'ARCHIVED';
    return s.status === filter;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDesc.trim()) return;
    setActionLoading(true);
    try {
      const eq = equipments.find(e => e.id === newEqId);
      const site = sites.find(s => s.id === newSiteId);
      await db.createSignalement(user.tenantId, {
        title: newTitle.trim(),
        description: newDesc.trim(),
        equipmentId: eq?.id,
        equipmentName: eq?.name,
        siteId: site?.id,
        siteName: site?.name,
      }, user);
      toast('Signalement créé', 'success');
      setShowCreate(false);
      setNewTitle(''); setNewDesc(''); setNewEqId(''); setNewSiteId('');
      await loadData();
    } catch (e: any) {
      toast(e.message || 'Erreur', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReply = async () => {
    if (!selected) return;
    const msg = await prompt({
      title: 'Ajouter une réponse',
      message: `Répondre à "${selected.title}"`,
      placeholder: 'Votre message…',
      confirmLabel: 'Envoyer',
      required: true,
    });
    if (!msg) return;
    setActionLoading(true);
    try {
      await db.addReplyToSignalement(user.tenantId, selected.id, msg);
      toast('Réponse ajoutée', 'success');
      await loadData();
      const updated = (await db.getSignalements(user.tenantId)).find(s => s.id === selected.id);
      if (updated) setSelected(updated);
    } catch (e: any) {
      toast(e.message || 'Erreur', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (status: SignalementStatus) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await db.updateSignalementStatus(user.tenantId, selected.id, status);
      toast('Statut mis à jour', 'success');
      await loadData();
      const updated = (await db.getSignalements(user.tenantId)).find(s => s.id === selected.id);
      if (updated) setSelected(updated);
    } catch (e: any) {
      toast(e.message || 'Erreur', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await db.closeSignalement(user.tenantId, selected.id);
      toast('Signalement clôturé', 'success');
      await loadData();
      setSelected(null);
    } catch (e: any) {
      toast(e.message || 'Erreur', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await db.archiveSignalement(user.tenantId, selected.id);
      toast('Signalement archivé', 'success');
      await loadData();
      setSelected(null);
    } catch (e: any) {
      toast(e.message || 'Erreur', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // --- CREATE FORM ---
  if (showCreate) {
    return (
      <div className="p-4 sm:p-8 max-w-xl mx-auto">
        {dialogNode}
        <button onClick={() => setShowCreate(false)} className="flex items-center gap-2 text-gray-400 hover:text-dark transition-all mb-6 text-sm font-bold">
          <ArrowLeft size={16}/> Retour
        </button>
        <h2 className="font-black text-dark text-2xl tracking-tight mb-6">Nouveau signalement</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Titre *</label>
            <input
              autoFocus
              value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder="Résumé en une phrase"
              className="w-full p-4 bg-gray-50 border border-border rounded-2xl text-sm font-medium outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Description *</label>
            <textarea
              rows={4}
              value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="Décrivez le problème en détail…"
              className="w-full p-4 bg-gray-50 border border-border rounded-2xl text-sm font-medium outline-none focus:border-primary resize-none"
            />
          </div>
          {equipments.length > 0 && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Équipement concerné (optionnel)</label>
              <select value={newEqId} onChange={e => setNewEqId(e.target.value)} className="w-full p-4 bg-gray-50 border border-border rounded-2xl text-sm font-medium outline-none focus:border-primary">
                <option value="">— Aucun —</option>
                {equipments.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
              </select>
            </div>
          )}
          {sites.length > 0 && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Site / Chantier (optionnel)</label>
              <select value={newSiteId} onChange={e => setNewSiteId(e.target.value)} className="w-full p-4 bg-gray-50 border border-border rounded-2xl text-sm font-medium outline-none focus:border-primary">
                <option value="">— Aucun —</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-4 bg-gray-100 rounded-2xl text-[10px] font-black uppercase text-gray-500">Annuler</button>
            <button type="submit" disabled={!newTitle.trim() || !newDesc.trim() || actionLoading} className="flex-[2] py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {actionLoading ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
              Envoyer
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- DETAIL VIEW ---
  if (selected) {
    const canChangeStatus = isCanManage && selected.status !== 'CLOSED' && selected.status !== 'ARCHIVED';
    return (
      <div className="p-4 sm:p-8 max-w-2xl mx-auto">
        {dialogNode}
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-gray-400 hover:text-dark transition-all mb-6 text-sm font-bold">
          <ArrowLeft size={16}/> Retour
        </button>

        {/* Header */}
        <div className="bg-white border border-border rounded-[32px] p-6 mb-4 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h2 className="font-black text-dark text-lg tracking-tight leading-snug">{selected.title}</h2>
            <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest shrink-0 ${STATUS_CLASS[selected.status]}`}>
              {STATUS_LABEL[selected.status]}
            </span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{selected.description}</p>
          <div className="flex flex-wrap gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            <span>Par {selected.createdByName} ({ROLE_LABEL[selected.createdByRole] || selected.createdByRole})</span>
            <span>{new Date(selected.createdAt).toLocaleString('fr-FR')}</span>
            {selected.equipmentName && <span>Équip. : {selected.equipmentName}</span>}
            {selected.siteName && <span>Site : {selected.siteName}</span>}
          </div>
        </div>

        {/* Replies thread */}
        <div className="space-y-3 mb-4">
          {selected.replies.length === 0 ? (
            <p className="text-center text-sm text-gray-400 font-medium py-4">Aucun échange pour l'instant.</p>
          ) : selected.replies.map(r => {
            const isSelf = r.authorId === user.id;
            const isStaff = r.authorRole === 'TECHNICIAN' || r.authorRole === 'ADMIN';
            return (
              <div key={r.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-[20px] px-5 py-4 shadow-sm ${isStaff ? 'bg-primary text-white' : 'bg-white border border-border text-dark'}`}>
                  <div className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${isStaff ? 'text-white/70' : 'text-gray-400'}`}>
                    {r.authorName} · {ROLE_LABEL[r.authorRole] || r.authorRole} · {new Date(r.createdAt).toLocaleString('fr-FR')}
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{r.message}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {selected.status !== 'CLOSED' && selected.status !== 'ARCHIVED' && (
            <button
              onClick={handleReply}
              disabled={actionLoading}
              className="w-full py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <MessageSquare size={14}/> Répondre
            </button>
          )}

          {isCanManage && canChangeStatus && (
            <div className="flex gap-2">
              {selected.status === 'NEW' && (
                <button onClick={() => handleStatusChange('IN_PROGRESS')} disabled={actionLoading} className="flex-1 py-3.5 bg-amber-500 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest">
                  Prendre en charge
                </button>
              )}
              {(selected.status === 'IN_PROGRESS') && (
                <button onClick={() => handleStatusChange('RESOLVED')} disabled={actionLoading} className="flex-1 py-3.5 bg-success text-white rounded-2xl text-[9px] font-black uppercase tracking-widest">
                  Marquer résolu
                </button>
              )}
              {(selected.status === 'RESOLVED' || selected.status === 'IN_PROGRESS') && (
                <button onClick={handleClose} disabled={actionLoading} className="flex-1 py-3.5 bg-gray-700 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest">
                  Clôturer
                </button>
              )}
            </div>
          )}

          {isCanManage && selected.status === 'CLOSED' && !selected.isArchived && (
            <button onClick={handleArchive} disabled={actionLoading} className="w-full py-3.5 bg-gray-100 text-gray-500 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
              <Archive size={14}/> Archiver
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <div className="p-4 sm:p-8">
      {dialogNode}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-black text-dark text-2xl tracking-tight">Signalements</h2>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{filtered.length} signalement{filtered.length > 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-white px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl"
        >
          <Plus size={14}/> Nouveau
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f.key ? 'bg-primary text-white' : 'bg-white border border-border text-gray-500 hover:border-primary/40'}`}
          >
            {f.label}
            {f.key !== 'ALL' && (
              <span className="ml-1.5 opacity-70">
                {signalements.filter(s => !s.isArchived && s.status === f.key && (user.role !== UserRole.CLIENT || s.createdBy === user.id)).length}
              </span>
            )}
          </button>
        ))}
        {isCanManage && (
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showArchived ? 'bg-gray-700 text-white' : 'bg-white border border-border text-gray-400'}`}
          >
            Archivés
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="text-primary animate-spin"/></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <AlertTriangle size={40} className="text-gray-200 mx-auto mb-4"/>
          <p className="text-gray-400 font-bold text-sm">Aucun signalement</p>
          <p className="text-gray-300 text-xs font-medium mt-1">
            {filter !== 'ALL' ? 'Essayez un autre filtre' : 'Créez le premier signalement'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full text-left bg-white border rounded-[24px] p-5 shadow-sm hover:border-primary/40 hover:shadow-md transition-all flex items-center gap-4 ${s.isArchived ? 'opacity-50' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ${STATUS_CLASS[s.status]}`}>
                    {STATUS_LABEL[s.status]}
                  </span>
                  {s.equipmentName && (
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest truncate">{s.equipmentName}</span>
                  )}
                </div>
                <h3 className="font-black text-dark text-sm truncate">{s.title}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-gray-400 font-medium">{s.createdByName}</span>
                  <span className="text-[10px] text-gray-300 font-medium">{new Date(s.createdAt).toLocaleDateString('fr-FR')}</span>
                  {s.replies.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-400 font-bold">
                      <MessageSquare size={10}/> {s.replies.length}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0"/>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
