import React, { useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  Plus, ChevronRight, ChevronDown, Search, FileText, Upload, Trash2, Printer, Gauge, Wrench, Flag, Pencil,
  Archive, RotateCcw, Boxes, MapPin, X, CheckCircle2, Play, MessageSquare, Phone, CalendarClock, Download, ExternalLink, Copy,
} from 'lucide-react';
import {
  Asset, AssetState, KIND_LABEL, LEVEL_LABEL, METER_LABEL, METER_UNIT, OPEN_WORK_ORDER_STATUSES, STATE_LABEL, qrPath,
  PLANS,
} from '../../functions/src/gmao/model';
import { isPmOverdue, stateCounts } from '../../functions/src/gmao/rules';
import { describeRecurrence } from '../../functions/src/gmao/recurrence';
import { useGmao } from './GmaoContext';
import {
  Badge, Button, Card, Empty, Field, fmtDate, fmtDateTime, fmtNum, fmtShortDate, Info,
  Input, Label, Modal, PageHeader, PerimeterPicker, PriorityBadge, ReqStatusBadge, Segmented, Select, sinceLabel, STATE_DOT,
  StateBadge, Textarea, WoStatusBadge, relativeDays, telHref, downloadCsv,
} from './ui';
import { RequestFormModal } from './RequestsView';
import { CloseModal, RecordModal, WorkOrderFormModal, isLate, useCanExecute } from './WorkOrdersView';

// ─── Formulaire machine ──────────────────────────────────────────────────────

export const AssetFormModal: React.FC<{ onClose: () => void; edit?: Asset; parent?: Asset }> = ({ onClose, edit, parent }) => {
  const g = useGmao();
  const isChild = !!(parent || edit?.parentId);
  const generated = g.settings.assetCodeMode === 'GENERATED';
  const [f, setF] = useState({
    code: edit?.code || '',
    name: edit?.name || '',
    typologyId: edit?.typologyId || '',
    siteId: edit?.siteId || g.sites.find(s => s.status !== 'ARCHIVED')?.id || '',
    clientId: edit?.clientId || '',
    technicianIds: edit?.technicianIds || [],
    location: edit?.location || '',
    brand: edit?.brand || '', model: edit?.model || '',
    serialNumber: edit?.serialNumber || '', registration: edit?.registration || '',
    commissioningDate: edit?.commissioningDate || '',
    contactName: edit?.contactName || '', contactPhone: edit?.contactPhone || '',
    meterType: edit?.meterType || '',
    meterValue: '',
    level: 'SOUS_EQUIPEMENT',
    notes: edit?.notes || '',
    applyTypologyPlans: true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const typology = g.typologies.find(t => t.id === f.typologyId);
  const typPlans = g.pmPlans.filter(p => !p.isArchived && p.typologyId && p.typologyId === f.typologyId);
  const activeCount = g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT').length;
  const full = !edit && !isChild && g.plan && activeCount >= g.plan.maxAssets;

  const pickTypology = (id: string) => {
    const t = g.typologies.find(x => x.id === id);
    setF(p => ({ ...p, typologyId: id, meterType: edit ? p.meterType : (t?.meterType || '') }));
  };

  const submit = async () => {
    setSaving(true);
    const payload: any = { ...f, meterType: f.meterType || null, typologyId: f.typologyId || null, clientId: f.clientId || null };
    let res;
    if (edit) {
      delete payload.meterValue; delete payload.level; delete payload.applyTypologyPlans;
      res = await g.run('ASSET_UPDATE', { id: edit.id, updates: payload }, 'Fiche mise à jour.');
    } else {
      res = await g.run('ASSET_CREATE', { ...payload, code: f.code || undefined, parentId: parent?.id || null }, 'Machine créée.');
      if (res?.attachedPlans?.length) g.toast(`Préventif appliqué : ${res.attachedPlans.join(', ')}.`, 'info');
    }
    setSaving(false);
    if (res) { onClose(); if (!edit && res.id) g.openAsset(res.id); }
  };

  return (
    <Modal title={edit ? `Modifier ${edit.code}` : parent ? `Ajouter sous ${parent.code}` : 'Nouvelle machine'} onClose={onClose} wide footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!!full || (!generated && !f.code.trim() && !edit) || !f.name.trim() || (!isChild && !f.siteId)}>{edit ? 'Enregistrer' : 'Créer'}</Button>
    </>}>
      {full && <div className="rounded-2xl bg-danger/10 text-danger text-sm font-bold p-3">Votre offre {PLANS[g.plan!.tier].label} est limitée à {g.plan!.maxAssets} machines actives : archivez une machine ou passez à l’offre supérieure.</div>}
      {parent && !edit && parent.level === 'EQUIPEMENT' && (
        <Field label="Niveau"><Segmented value={f.level as any} onChange={v => set('level', v)} options={[{ value: 'SOUS_EQUIPEMENT', label: 'Sous-ensemble' }, { value: 'COMPOSANT', label: 'Composant' }]} /></Field>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Code" required={!generated} hint={generated && !edit ? 'Vide : généré automatiquement.' : 'Identifiant propre à votre entreprise.'}>
          <Input value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder={generated ? `${g.settings.assetCodePrefix}-0001` : 'Ex. AL-12'} />
        </Field>
        <Field label="Désignation" required className="sm:col-span-2"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Autolaveuse Kärcher B 40" /></Field>
      </div>
      {!isChild && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Typologie">
              <Select value={f.typologyId} onChange={e => pickTypology(e.target.value)}>
                <option value="">—</option>{g.typologies.filter(t => !t.isArchived || t.id === f.typologyId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Site" required><Select value={f.siteId} onChange={e => set('siteId', e.target.value)}>{g.sites.filter(s => s.status !== 'ARCHIVED' || s.id === f.siteId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Client" hint="Le client verra l’historique de cette machine.">
              <Select value={f.clientId} onChange={e => set('clientId', e.target.value)}>
                <option value="">Aucun (parc interne)</option>{g.clients.filter(c => !c.isArchived || c.id === f.clientId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Techniciens concernés" hint="Seuls ces techniciens verront cette machine dans leur parc et recevront ses alertes.">
            <PerimeterPicker users={g.users} value={f.technicianIds} onChange={v => set('technicianIds', v)} />
          </Field>
        </>
      )}
      <Field label="Localisation précise"><Input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Local ménage RDC, parking…" /></Field>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label="Marque"><Input value={f.brand} onChange={e => set('brand', e.target.value)} /></Field>
        <Field label="Modèle"><Input value={f.model} onChange={e => set('model', e.target.value)} /></Field>
        <Field label="N° de série"><Input value={f.serialNumber} onChange={e => set('serialNumber', e.target.value)} /></Field>
        <Field label="Immatriculation"><Input value={f.registration} onChange={e => set('registration', e.target.value)} /></Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Mise en service"><Input type="date" value={f.commissioningDate} onChange={e => set('commissioningDate', e.target.value)} /></Field>
        <Field label="Compteur"><Select value={f.meterType} onChange={e => set('meterType', e.target.value)}><option value="">Aucun</option><option value="KM">{METER_LABEL.KM}</option><option value="HEURES">{METER_LABEL.HEURES}</option></Select></Field>
        {!edit && f.meterType && <Field label="Valeur actuelle"><Input type="number" min={0} value={f.meterValue} onChange={e => set('meterValue', e.target.value)} /></Field>}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Référent / utilisateur" hint="Personne à appeler (RDV garage, accès…)."><Input value={f.contactName} onChange={e => set('contactName', e.target.value)} /></Field>
        <Field label="Téléphone"><Input type="tel" value={f.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      {!edit && typPlans.length > 0 && (
        <label className="flex items-start gap-2 text-sm font-semibold text-dark rounded-2xl bg-teal-50 p-3">
          <input type="checkbox" checked={f.applyTypologyPlans} onChange={e => set('applyTypologyPlans', e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#EE6E0A]" />
          <span>Appliquer le préventif de la typologie {typology?.name} : {typPlans.map(p => p.name).join(', ')}</span>
        </label>
      )}
    </Modal>
  );
};

// ─── Changement d'état / relevé ──────────────────────────────────────────────

export const StateModal: React.FC<{ asset: Asset; onClose: () => void }> = ({ asset, onClose }) => {
  const { run } = useGmao();
  const [state, setState] = useState<AssetState>(asset.state);
  const [reason, setReason] = useState(asset.stateReason || '');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const res = await run('ASSET_SET_STATE', { id: asset.id, state, reason }, 'État mis à jour.');
    setSaving(false);
    if (res) onClose();
  };
  return (
    <Modal title={`État de ${asset.code}`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={state !== 'OPERATIONNEL' && !reason.trim()}>Enregistrer</Button>
    </>}>
      <Segmented value={state} onChange={setState} options={(['OPERATIONNEL', 'DEGRADE', 'INDISPONIBLE'] as AssetState[]).map(s => ({ value: s, label: STATE_LABEL[s] }))} />
      {state !== 'OPERATIONNEL' && <Field label="Motif" required><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. : attente pièce, panne moteur…" /></Field>}
    </Modal>
  );
};

export const MeterModal: React.FC<{ asset: Asset; onClose: () => void }> = ({ asset, onClose }) => {
  const { run, toast } = useGmao();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const unit = asset.meterType ? METER_UNIT[asset.meterType] : '';
  const submit = async () => {
    setSaving(true);
    const res = await run('METER_ADD', { id: asset.id, value }, 'Relevé enregistré.');
    setSaving(false);
    if (res) {
      if (res.generatedWorkOrders?.length) toast(`Échéance préventive atteinte : ${res.generatedWorkOrders.join(', ')}.`, 'info');
      onClose();
    }
  };
  return (
    <Modal title={`Relevé ${asset.meterType === 'KM' ? 'kilométrique' : 'horamètre'} · ${asset.code}`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!value}>Enregistrer</Button>
    </>}>
      <Field label={`Valeur (${unit})`} hint={`Dernier relevé : ${fmtNum(asset.meterValue)} ${unit} · ${fmtDateTime(asset.meterUpdatedAt)}`}>
        <Input autoFocus type="number" inputMode="numeric" min={asset.meterValue || 0} value={value} onChange={e => setValue(e.target.value)} />
      </Field>
    </Modal>
  );
};

// ─── QR codes ────────────────────────────────────────────────────────────────

export const qrUrl = (origin: string, a: Asset, demo: boolean) => `${origin}${qrPath(a.qrToken)}${demo ? '?demo' : ''}`;

const Label1: React.FC<{ a: Asset; url: string; org: string; small?: boolean }> = ({ a, url, org, small }) => (
  <div className={`border-2 border-dark rounded-2xl text-center bg-white flex flex-col items-center justify-center ${small ? 'p-2' : 'p-4'}`}>
    <div className={`${small ? 'text-[8px]' : 'text-[10px]'} font-black uppercase tracking-widest text-gray-500`}>{org}</div>
    <QRCode value={url} size={small ? 110 : 180} className="my-1.5" />
    <div className={`${small ? 'text-base' : 'text-2xl'} font-black tracking-tight leading-none`}>{a.code}</div>
    <div className={`${small ? 'text-[9px]' : 'text-xs'} font-semibold leading-tight mt-0.5 line-clamp-1`}>{a.name}</div>
    <div className={`${small ? 'text-[8px]' : 'text-[10px]'} text-gray-500 mt-0.5`}>Un problème ? Scannez pour le signaler</div>
  </div>
);

const QrModal: React.FC<{ asset: Asset; onClose: () => void }> = ({ asset, onClose }) => {
  const g = useGmao();
  const url = qrUrl(g.backend.publicOrigin(), asset, g.backend.mode === 'demo');
  return (
    <Modal title="Étiquette QR" subtitle="Téléphone ordinaire : formulaire de signalement. Appli Miki : fiche de la machine." onClose={onClose} footer={<>
      <Button variant="ghost" icon={<Copy size={16} />} onClick={() => { navigator.clipboard?.writeText(url); g.toast('Lien copié.', 'success'); }}>Copier le lien</Button>
      <Button icon={<Printer size={16} />} onClick={() => window.print()}>Imprimer</Button>
    </>}>
      <div id="qr-print" className="mx-auto w-[260px]"><Label1 a={asset} url={url} org={g.tenantName} /></div>
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-xs font-bold text-primary"><ExternalLink size={12} />Ouvrir le formulaire public</a>
      <style>{`@media print { body * { visibility: hidden; } #qr-print, #qr-print * { visibility: visible; } #qr-print { position: fixed; left: 20px; top: 20px; } }`}</style>
    </Modal>
  );
};

/** Planche A4 d'étiquettes (3 × 7) pour tout un parc. */
export const QrSheetModal: React.FC<{ assets: Asset[]; onClose: () => void }> = ({ assets, onClose }) => {
  const g = useGmao();
  const origin = g.backend.publicOrigin();
  return (
    <Modal wide title={`Étiquettes QR (${assets.length})`} subtitle="Planche A4, 21 étiquettes par page. Imprimez sur papier adhésif ou plastifiez." onClose={onClose} footer={<Button icon={<Printer size={16} />} onClick={() => window.print()}>Imprimer</Button>}>
      <div id="qr-sheet" className="grid grid-cols-3 gap-2">
        {assets.map(a => <Label1 key={a.id} a={a} url={qrUrl(origin, a, g.backend.mode === 'demo')} org={g.tenantName} small />)}
      </div>
      <style>{`@media print {
        @page { size: A4; margin: 8mm; }
        body * { visibility: hidden; }
        #qr-sheet, #qr-sheet * { visibility: visible; }
        #qr-sheet { position: absolute; left: 0; top: 0; width: 194mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
        #qr-sheet > div { height: 38mm; break-inside: avoid; }
      }`}</style>
    </Modal>
  );
};

// ─── Import CSV ──────────────────────────────────────────────────────────────

const IMPORT_COLUMNS: [string, string][] = [
  ['code', 'Code'], ['name', 'Désignation'], ['typology', 'Typologie'], ['site', 'Site'], ['client', 'Client'],
  ['brand', 'Marque'], ['model', 'Modèle'], ['serialNumber', 'N° de série'], ['registration', 'Immatriculation'],
  ['location', 'Localisation'], ['meterValue', 'Compteur'], ['contactName', 'Référent'], ['contactPhone', 'Téléphone'],
];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function parseCsv(text: string): any[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (l: string) => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === sep && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const header = split(lines[0]).map(norm);
  const keyOf = (h: string) => IMPORT_COLUMNS.find(([k, label]) => norm(label) === h || norm(k) === h || (k === 'name' && ['designation', 'nom', 'libelle'].includes(h)) || (k === 'serialNumber' && ['serie', 'numerodeserie', 'nserie'].includes(h)) || (k === 'meterValue' && ['km', 'kilometrage', 'heures'].includes(h)))?.[0];
  const keys = header.map(keyOf);
  return lines.slice(1).map(l => {
    const cells = split(l);
    const row: any = {};
    keys.forEach((k, i) => { if (k && cells[i]) row[k] = k === 'meterValue' ? Number(cells[i].replace(/\s/g, '').replace(',', '.')) || undefined : cells[i]; });
    return row;
  }).filter(r => Object.keys(r).length);
}

const ImportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const g = useGmao();
  const [rows, setRows] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [techIds, setTechIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = async (file?: File) => {
    if (!file) return;
    setErrors([]);
    setRows(parseCsv(await file.text()));
  };
  const template = () => downloadCsv('modele-import-parc.csv', IMPORT_COLUMNS.map(c => c[1]), [[g.settings.assetCodeMode === 'MANUAL' ? 'AL-01' : '', 'Autolaveuse Kärcher B 40', 'Autolaveuse', g.sites[0]?.name || 'Dépôt', '', 'Kärcher', 'B 40', '', '', 'Local matériel', '', '', '']]);
  const submit = async () => {
    setBusy(true);
    const res = await g.run('ASSET_IMPORT', { rows, technicianIds: techIds });
    setBusy(false);
    if (!res) return;
    if (res.errors?.length) { setErrors(res.errors); return; }
    g.toast(`${res.created} machine(s) importée(s).`, 'success');
    onClose();
  };
  return (
    <Modal wide title="Importer un parc" subtitle="Fichier CSV (Excel : Enregistrer sous… CSV). Les typologies et sites inconnus sont créés." onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={busy} disabled={!rows.length} icon={<Upload size={16} />}>Importer {rows.length || ''} machine(s)</Button>
    </>}>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>Choisir le fichier</Button>
        <Button variant="ghost" icon={<Download size={16} />} onClick={template}>Télécharger le modèle</Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => load(e.target.files?.[0])} />
      </div>
      <p className="text-xs text-gray-500">Colonnes reconnues : {IMPORT_COLUMNS.map(c => c[1]).join(' · ')}. {g.settings.assetCodeMode === 'GENERATED' ? 'Code vide : généré automatiquement.' : 'Le code est obligatoire (codes de votre entreprise).'}</p>
      <Field label="Techniciens concernés par ces machines"><PerimeterPicker users={g.users} value={techIds} onChange={setTechIds} /></Field>
      {rows.length > 0 && (
        <div className="max-h-64 overflow-auto rounded-2xl border border-border">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-border"><th className="px-3 py-2">Code</th><th className="px-3 py-2">Désignation</th><th className="px-3 py-2">Typologie</th><th className="px-3 py-2">Site</th><th className="px-3 py-2">Client</th></tr></thead>
            <tbody>{rows.slice(0, 100).map((r, i) => <tr key={i} className="border-b border-gray-50"><td className="px-3 py-1.5 font-bold">{r.code || '—'}</td><td className="px-3 py-1.5">{r.name}</td><td className="px-3 py-1.5">{r.typology}</td><td className="px-3 py-1.5">{r.site}</td><td className="px-3 py-1.5">{r.client}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {errors.length > 0 && <div className="rounded-2xl bg-danger/10 text-danger text-sm p-3 space-y-1">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
    </Modal>
  );
};

// ─── Fiche machine ───────────────────────────────────────────────────────────

export const AssetDetailModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const g = useGmao();
  const canExecute = useCanExecute();
  const asset = g.assetById(id);
  const [sub, setSub] = useState<null | { t: 'state' | 'meter' | 'edit' | 'child' | 'qr' | 'request' | 'remark' | 'wo' | 'record' } | { t: 'close'; woId: string }>(null);
  const [tab, setTab] = useState<'historique' | 'preventif' | 'docs' | 'infos' | 'composants' | 'releves'>('historique');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const data = useMemo(() => {
    if (!asset) return null;
    const descendants = (pid: string): Asset[] => g.assets.filter(a => a.parentId === pid && !a.isArchived).flatMap(c => [c, ...descendants(c.id)]);
    const family = [asset.id, ...descendants(asset.id).map(a => a.id)];
    const wos = g.workOrders.filter(w => family.includes(w.assetId)).sort((a, b) => (b.closedAt || b.createdAt).localeCompare(a.closedAt || a.createdAt));
    const reqs = g.requests.filter(r => family.includes(r.assetId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const meters = g.events.filter(e => e.assetId === asset.id && e.type === 'METER').sort((a, b) => b.at.localeCompare(a.at));
    const plans = g.pmPlans.filter(p => !p.isArchived && p.assetIds.includes(asset.id));
    const parentChain: Asset[] = [];
    let p = g.assetById(asset.parentId);
    while (p) { parentChain.unshift(p); p = g.assetById(p.parentId); }
    const openWos = wos.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const closed = wos.filter(w => w.status === 'CLOTURE');
    return { children: g.assets.filter(a => a.parentId === asset.id && !a.isArchived), wos, openWos, closed, reqs, meters, plans, parentChain };
  }, [asset, g.assets, g.workOrders, g.requests, g.events, g.pmPlans]);

  if (!asset || !data) return null;
  const staff = g.isResp || g.isTech;
  const mine = g.mine(asset);
  const unit = asset.meterType ? METER_UNIT[asset.meterType] : '';
  const last = data.closed[0];
  const pendingReqs = data.reqs.filter(r => r.status === 'A_TRAITER');

  const uploadDoc = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await g.backend.upload(`assets/${asset.id}`, file);
        await g.run('ASSET_ADD_DOCUMENT', { id: asset.id, name: file.name, url });
      }
      g.toast('Document ajouté.', 'success');
    } catch (e: any) {
      g.toast(e?.message || "Échec de l'envoi du document.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removeDoc = async (docId: string, name: string) => {
    if (await g.confirm({ title: 'Retirer le document', message: `Retirer « ${name} » de la fiche ?`, variant: 'danger', confirmLabel: 'Retirer' })) await g.run('ASSET_REMOVE_DOCUMENT', { id: asset.id, documentId: docId });
  };
  const archive = async () => {
    const ok = asset.isArchived
      ? await g.confirm({ title: `Réactiver ${asset.code}`, message: 'La machine revient dans le parc actif (elle compte de nouveau dans votre offre).', confirmLabel: 'Réactiver' })
      : await g.confirm({ title: `Archiver ${asset.code}`, message: 'La machine sort du parc actif et ne compte plus dans votre offre. L’historique est conservé.', variant: 'danger', confirmLabel: 'Archiver' });
    if (ok) {
      const r = await g.run(asset.isArchived ? 'ASSET_RESTORE' : 'ASSET_ARCHIVE', { id: asset.id }, asset.isArchived ? 'Machine réactivée.' : 'Machine archivée.');
      if (r && !asset.isArchived) onClose();
    }
  };
  const start = async (woId: string) => {
    const wo = g.workOrders.find(w => w.id === woId);
    if (wo?.safetyCheckRequired && g.settings.safetyChecklistId) { g.openWorkOrder(woId); return; }
    await g.run('WO_START', { id: woId }, 'Intervention démarrée.');
  };

  const tabs = [
    { value: 'historique' as const, label: `Historique (${data.closed.length})` },
    ...(staff ? [{ value: 'preventif' as const, label: `Préventif (${data.plans.length})` }] : []),
    ...(asset.meterType ? [{ value: 'releves' as const, label: 'Relevés' }] : []),
    { value: 'docs' as const, label: `Documents (${asset.documents?.length || 0})` },
    { value: 'infos' as const, label: 'Infos' },
    ...(g.settings.assetHierarchy && asset.level !== 'COMPOSANT' && staff ? [{ value: 'composants' as const, label: `Composants (${data.children.length})` }] : []),
  ];

  return (
    <>
      <Modal wide title={`${asset.code} · ${asset.name}`} onClose={onClose} subtitle={
        <span className="flex flex-wrap items-center gap-1 text-xs">
          <MapPin size={12} />{g.siteName(asset.siteId)}{asset.location ? ` · ${asset.location}` : ''}{asset.typologyId ? ` · ${g.typologyName(asset.typologyId)}` : ''}{asset.clientId && !g.isClient ? ` · ${g.clientName(asset.clientId)}` : ''}
          {data.parentChain.map(p => <span key={p.id}> › <button className="text-primary font-bold" onClick={() => g.openAsset(p.id)}>{p.code}</button></span>)}
          {asset.level !== 'EQUIPEMENT' && <> · {LEVEL_LABEL[asset.level]}</>}
        </span>
      }>
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={asset.state} />
          {asset.state !== 'OPERATIONNEL' && <span className="text-sm text-gray-600">{asset.stateReason} <span className="text-gray-400">· depuis {sinceLabel(asset.stateSince)}</span></span>}
          {asset.isArchived && <Badge className="bg-gray-200 text-gray-600">Archivée</Badge>}
          {g.isTech && !mine && <Badge className="bg-gray-100 text-gray-500">Hors de votre parc</Badge>}
        </div>

        {/* Synthèse : dernière et prochaine maintenance */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Card className="p-4">
            <Label>Dernière maintenance</Label>
            {last ? <button onClick={() => g.openWorkOrder(last.id)} className="text-left mt-1 block">
              <div className="text-lg font-black text-dark">{fmtDate(last.actualEnd || last.closedAt)}</div>
              <div className="text-sm text-gray-600">{KIND_LABEL[last.kind]} · {last.title}</div>
            </button> : <div className="text-sm text-gray-400 mt-1">Aucune intervention enregistrée.</div>}
          </Card>
          <Card className={`p-4 ${asset.nextPm?.overdue ? 'border-danger/40 bg-danger/5' : ''}`}>
            <Label>Prochaine maintenance prévue</Label>
            {asset.nextPm ? <div className="mt-1">
              <div className={`text-lg font-black ${asset.nextPm.overdue ? 'text-danger' : 'text-dark'}`}>{asset.nextPm.dueAt ? `${fmtDate(asset.nextPm.dueAt)} (${relativeDays(asset.nextPm.dueAt)})` : `à ${fmtNum(asset.nextPm.dueMeter)} ${unit}`}</div>
              <div className="text-sm text-gray-600">{asset.nextPm.planName}{asset.nextPm.overdue ? ' · en retard' : ''}{asset.nextPm.dueMeter != null && asset.meterValue != null ? ` · actuel ${fmtNum(asset.meterValue)} ${unit}` : ''}</div>
            </div> : <div className="text-sm text-gray-400 mt-1">Pas de maintenance programmée.</div>}
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {staff && mine && !asset.isArchived && <Button small variant="success" icon={<CheckCircle2 size={14} />} onClick={() => setSub({ t: 'record' })}>Intervention réalisée</Button>}
          {staff && mine && asset.meterType && <Button small variant="secondary" icon={<Gauge size={14} />} onClick={() => setSub({ t: 'meter' })}>Relevé {unit}</Button>}
          {staff && mine && <Button small variant="secondary" onClick={() => setSub({ t: 'state' })}>Changer l'état</Button>}
          <Button small variant={g.isClient ? 'primary' : 'secondary'} icon={<Flag size={14} />} onClick={() => setSub({ t: 'request' })}>Signaler un problème</Button>
          {g.isClient && <Button small variant="secondary" icon={<MessageSquare size={14} />} onClick={() => setSub({ t: 'remark' })}>Laisser une remarque</Button>}
          {staff && mine && <Button small variant="secondary" icon={<Wrench size={14} />} onClick={() => setSub({ t: 'wo' })}>Programmer</Button>}
          {staff && <Button small variant="ghost" icon={<Printer size={14} />} onClick={() => setSub({ t: 'qr' })}>QR code</Button>}
          {g.isResp && <Button small variant="ghost" icon={<Pencil size={14} />} onClick={() => setSub({ t: 'edit' })}>Modifier</Button>}
        </div>

        {(asset.contactName || asset.contactPhone) && staff && (
          <div className="rounded-2xl bg-blue-50 text-blue-800 text-sm px-4 py-3 flex flex-wrap items-center gap-2">
            <Phone size={16} /><span>Référent : <b>{asset.contactName || '—'}</b></span>
            {asset.contactPhone && <a href={telHref(asset.contactPhone)} className="ml-auto font-black underline">Appeler {asset.contactPhone}</a>}
          </div>
        )}

        {/* À faire sur cette machine */}
        {(data.openWos.length > 0 || pendingReqs.length > 0) && (
          <div>
            <Label className="mb-2">{g.isClient ? 'En cours' : 'À faire sur cette machine'}</Label>
            <div className="space-y-2">
              {pendingReqs.map(r => (
                <button key={r.id} onClick={() => g.openRequest(r.id)} className="w-full text-left rounded-2xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm flex items-center gap-2">
                  <Flag size={14} className="text-danger shrink-0" />
                  <span className="flex-1 min-w-0 truncate"><b>{r.number}</b> · {r.description}</span>
                  <ReqStatusBadge s={r.status} />
                </button>
              ))}
              {data.openWos.map(w => {
                const exec = canExecute(w);
                return (
                  <div key={w.id} className={`rounded-2xl border px-3 py-2.5 flex flex-wrap items-center gap-2 ${isLate(w) ? 'border-danger/30' : 'border-border'}`}>
                    <PriorityBadge p={w.priority} />
                    <button onClick={() => g.openWorkOrder(w.id)} className="flex-1 min-w-[160px] text-left">
                      <div className="text-sm font-bold text-dark">{w.title}</div>
                      <div className={`text-[11px] ${isLate(w) ? 'text-danger font-bold' : 'text-gray-400'}`}>{KIND_LABEL[w.kind]} · {w.number} · échéance {fmtDate(w.dueDate)} ({relativeDays(w.dueDate)}){w.plannedStart ? ` · prévue ${fmtDateTime(w.plannedStart)}` : ''}{w.assigneeNames.length ? ` · ${w.assigneeNames.join(', ')}` : ''}</div>
                    </button>
                    <WoStatusBadge s={w.status} />
                    {exec && !g.isClient && w.status !== 'EN_COURS' && <Button small variant="secondary" icon={<Play size={12} />} onClick={() => start(w.id)}>Démarrer</Button>}
                    {exec && !g.isClient && <Button small variant="success" icon={<CheckCircle2 size={12} />} onClick={() => setSub({ t: 'close', woId: w.id })}>Fait</Button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Segmented value={tab} onChange={setTab} options={tabs} />

        {tab === 'historique' && (
          <div className="space-y-1.5">
            {data.closed.slice(0, 60).map(w => (
              <button key={w.id} onClick={() => g.openWorkOrder(w.id)} className="w-full text-left rounded-xl border border-border px-3 py-2 hover:border-primary/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-gray-500 w-20 shrink-0">{fmtDate(w.actualEnd || w.closedAt)}</span>
                  <Badge className={w.kind === 'PREVENTIF' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-600'}>{KIND_LABEL[w.kind]}</Badge>
                  <span className="text-sm font-bold text-dark truncate flex-1">{w.title}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{w.resourceType === 'EXTERNE' ? w.externalProvider : w.closedByName}</span>
                </div>
                {w.report && <div className="text-xs text-gray-500 mt-1 line-clamp-2 pl-[88px]">{w.report}</div>}
              </button>
            ))}
            {!data.closed.length && <Empty>Aucune intervention réalisée pour l’instant.</Empty>}
            {data.reqs.filter(r => r.status !== 'A_TRAITER').length > 0 && (
              <div className="pt-3">
                <Label className="mb-2">Signalements et remarques</Label>
                {data.reqs.filter(r => r.status !== 'A_TRAITER').slice(0, 20).map(r => (
                  <button key={r.id} onClick={() => g.openRequest(r.id)} className="w-full text-left text-sm py-1.5 flex items-center gap-2 border-b border-gray-50">
                    <span className="text-xs text-gray-400 w-20 shrink-0">{fmtShortDate(r.createdAt)}</span>
                    <span className="flex-1 truncate">{r.description}</span><ReqStatusBadge s={r.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'preventif' && (
          <div className="space-y-2">
            {data.plans.map(p => {
              const e = p.schedule[asset.id];
              const overdue = isPmOverdue(p, e, asset, new Date());
              return (
                <div key={p.id} className="rounded-xl border border-border px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <b>{p.name}{!p.isActive && <span className="text-gray-400 font-normal"> (désactivée)</span>}</b>
                    <span className={`text-xs ${overdue ? 'text-danger font-bold' : 'text-gray-500'}`}>
                      {e?.ended ? 'terminée' : p.trigger === 'CALENDAIRE' ? `prochaine : ${fmtDate(e?.nextDueAt)} (${relativeDays(e?.nextDueAt)})` : `prochaine à ${fmtNum(e?.nextDueMeter)} ${unit}`}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{p.trigger === 'CALENDAIRE' && p.recurrence ? describeRecurrence(p.recurrence, e?.startDate) : `Tous les ${fmtNum(p.meterInterval)} ${unit}`}{e?.lastDoneAt ? ` · dernière : ${fmtDate(e.lastDoneAt)}` : ''}</div>
                </div>
              );
            })}
            {!data.plans.length && <Empty>Aucune maintenance programmée sur cette machine.</Empty>}
          </div>
        )}

        {tab === 'releves' && (
          <div className="max-h-64 overflow-y-auto text-sm space-y-1">
            {data.meters.map(e => (
              <div key={e.id} className="flex justify-between gap-2 border-b border-gray-50 py-1.5">
                <b>{fmtNum(e.value)} {unit}</b><span className="text-gray-400 text-xs">{fmtDateTime(e.at)} · {e.byName}</span>
              </div>
            ))}
            {!data.meters.length && <Empty>Aucun relevé.</Empty>}
          </div>
        )}

        {tab === 'docs' && (
          <div className="space-y-2">
            {(asset.documents || []).map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5">
                <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-bold text-dark hover:text-primary min-w-0"><FileText size={16} className="text-primary shrink-0" /><span className="truncate">{d.name}</span></a>
                <span className="flex items-center gap-2 shrink-0 text-[11px] text-gray-400">{fmtShortDate(d.uploadedAt)}
                  {g.isResp && <button onClick={() => removeDoc(d.id, d.name)} className="text-gray-400 hover:text-danger" aria-label="Retirer"><Trash2 size={14} /></button>}
                </span>
              </div>
            ))}
            {!asset.documents?.length && <Empty>Aucun document (notices, certificats, contrats…).</Empty>}
            {g.isResp && <>
              <Button small variant="secondary" loading={uploading} icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Ajouter un document</Button>
              <input ref={fileRef} type="file" multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" className="hidden" onChange={e => uploadDoc(e.target.files)} />
            </>}
          </div>
        )}

        {tab === 'infos' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Info label="Code">{asset.code}</Info>
            <Info label="Typologie">{asset.typologyId ? g.typologyName(asset.typologyId) : ''}</Info>
            <Info label="Client">{asset.clientId ? g.clientName(asset.clientId) : 'Parc interne'}</Info>
            <Info label="Marque / modèle">{[asset.brand, asset.model].filter(Boolean).join(' ')}</Info>
            <Info label="N° série">{asset.serialNumber}</Info>
            <Info label="Immatriculation">{asset.registration}</Info>
            <Info label="Mise en service">{asset.commissioningDate ? fmtDate(asset.commissioningDate) : ''}</Info>
            {asset.meterType && <Info label="Compteur">{fmtNum(asset.meterValue)} {unit} <span className="text-gray-400 text-xs">({fmtShortDate(asset.meterUpdatedAt)})</span></Info>}
            {staff && <Info label="Techniciens">{asset.technicianIds?.length ? asset.technicianIds.map(id => g.users.find(u => u.id === id)?.name || '—').join(', ') : 'Tous'}</Info>}
            {asset.notes && <div className="col-span-full text-sm text-gray-600 whitespace-pre-wrap">{asset.notes}</div>}
          </div>
        )}

        {tab === 'composants' && (
          <div className="space-y-2">
            {data.children.map(c => (
              <button key={c.id} onClick={() => g.openAsset(c.id)} className="w-full text-left rounded-xl border border-border px-3 py-2.5 flex items-center justify-between gap-2 hover:border-primary/40">
                <span className="text-sm"><b>{c.code}</b> · {c.name} <span className="text-gray-400">· {LEVEL_LABEL[c.level]}</span></span>
                <StateBadge state={c.state} />
              </button>
            ))}
            {!data.children.length && <Empty>Aucun sous-ensemble ni composant.</Empty>}
            {g.isResp && <Button small variant="secondary" icon={<Plus size={14} />} onClick={() => setSub({ t: 'child' })}>Ajouter un sous-ensemble / composant</Button>}
          </div>
        )}

        {g.isResp && (
          <div className="pt-2 border-t border-border">
            <Button small variant="ghost" icon={asset.isArchived ? <RotateCcw size={14} /> : <Archive size={14} />} onClick={archive}>{asset.isArchived ? 'Réactiver' : 'Archiver'}</Button>
          </div>
        )}
      </Modal>
      {sub?.t === 'state' && <StateModal asset={asset} onClose={() => setSub(null)} />}
      {sub?.t === 'meter' && <MeterModal asset={asset} onClose={() => setSub(null)} />}
      {sub?.t === 'edit' && <AssetFormModal edit={asset} onClose={() => setSub(null)} />}
      {sub?.t === 'child' && <AssetFormModal parent={asset} onClose={() => setSub(null)} />}
      {sub?.t === 'qr' && <QrModal asset={asset} onClose={() => setSub(null)} />}
      {sub?.t === 'request' && <RequestFormModal assetId={asset.id} onClose={() => setSub(null)} />}
      {sub?.t === 'remark' && <RequestFormModal assetId={asset.id} kind="REMARQUE" onClose={() => setSub(null)} />}
      {sub?.t === 'wo' && <WorkOrderFormModal assetId={asset.id} onClose={() => setSub(null)} />}
      {sub?.t === 'record' && <RecordModal asset={asset} onClose={() => setSub(null)} />}
      {sub?.t === 'close' && (() => { const w = g.workOrders.find(x => x.id === (sub as any).woId); return w ? <CloseModal wo={w} onClose={() => setSub(null)} /> : null; })()}
    </>
  );
};

// ─── Vue parc ────────────────────────────────────────────────────────────────

export const AssetsView: React.FC = () => {
  const g = useGmao();
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState<'ALL' | AssetState>('ALL');
  const [typology, setTypology] = useState('');
  const [client, setClient] = useState('');
  const [mineOnly, setMineOnly] = useState(g.isTech);
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<null | 'create' | 'import' | 'qr'>(null);
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpenNodes(p => ({ ...p, [k]: !(p[k] ?? true) }));

  const hierarchy = g.settings.assetHierarchy;
  const search = q.trim().toLowerCase();
  const visible = g.assets.filter(a => (showArchived ? a.isArchived : !a.isArchived) && (hierarchy || a.level === 'EQUIPEMENT' || showArchived));
  const matches = (a: Asset) => (!search || `${a.code} ${a.name} ${a.registration || ''} ${a.brand || ''} ${a.serialNumber || ''} ${a.location || ''}`.toLowerCase().includes(search))
    && (stateFilter === 'ALL' || a.state === stateFilter)
    && (!typology || a.typologyId === typology)
    && (!client || (client === '__none' ? !a.clientId : a.clientId === client))
    && (!mineOnly || g.mine(a));
  const childrenOf = (id: string) => visible.filter(a => a.parentId === id);
  const subtreeMatches = (a: Asset): boolean => matches(a) || childrenOf(a.id).some(subtreeMatches);
  const roots = visible.filter(a => !a.parentId || showArchived);
  const filtering = !!search || stateFilter !== 'ALL';
  const shown = roots.filter(subtreeMatches);
  const active = g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT');

  const renderAsset = (a: Asset, depth: number): React.ReactNode => {
    if (!subtreeMatches(a)) return null;
    const kids = showArchived || !hierarchy ? [] : childrenOf(a.id);
    const isOpen = filtering || (openNodes[a.id] ?? false);
    const openWo = g.workOrders.filter(w => w.assetId === a.id && OPEN_WORK_ORDER_STATUSES.includes(w.status));
    return (
      <div key={a.id}>
        <div className="flex items-center gap-1 py-1.5 pr-2 hover:bg-gray-50 rounded-xl" style={{ paddingLeft: depth * 18 + 4 }}>
          {hierarchy && <button onClick={() => kids.length && setOpenNodes(p => ({ ...p, [a.id]: !isOpen }))} className={`w-6 h-6 flex items-center justify-center text-gray-400 ${kids.length ? '' : 'invisible'}`} aria-label="Déplier">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>}
          <button onClick={() => g.openAsset(a.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
            <span className={`w-2 h-2 rounded-full shrink-0 ${STATE_DOT[a.state]}`} title={STATE_LABEL[a.state]} />
            <span className="text-sm font-black text-dark shrink-0">{a.code}</span>
            <span className="text-sm text-gray-600 truncate">{a.name}</span>
            {a.clientId && !g.isClient && <span className="hidden md:inline text-[11px] text-gray-400 truncate">· {g.clientName(a.clientId)}</span>}
          </button>
          {a.nextPm && <span className={`hidden sm:inline text-[11px] font-bold ${a.nextPm.overdue ? 'text-danger' : 'text-gray-400'}`} title={a.nextPm.planName}><CalendarClock size={11} className="inline mr-0.5" />{a.nextPm.dueAt ? relativeDays(a.nextPm.dueAt) : `${fmtNum(a.nextPm.dueMeter)} ${a.meterType ? METER_UNIT[a.meterType] : ''}`}</span>}
          {openWo.length > 0 && <Badge className={openWo.some(isLate) ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'} title="Interventions ouvertes"><Wrench size={10} />{openWo.length}</Badge>}
          {a.meterType && <span className="hidden lg:inline text-[11px] text-gray-400 w-24 text-right">{fmtNum(a.meterValue)} {METER_UNIT[a.meterType]}</span>}
        </div>
        {isOpen && kids.map(k => renderAsset(k, depth + 1))}
      </div>
    );
  };

  const sites = g.sites.filter(s => roots.some(a => a.siteId === s.id));
  const typIds = Array.from(new Set(roots.map(a => a.typologyId || '')));

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title={g.isClient ? 'Vos machines' : 'Parc'}
        subtitle={`${active.length} machine(s) active(s)${g.plan && g.isResp ? ` sur ${g.plan.maxAssets} (offre ${PLANS[g.plan.tier].label})` : ''}`}
        actions={g.isResp ? <>
          <Button variant="secondary" icon={<Printer size={16} />} onClick={() => setModal('qr')} disabled={!shown.length}>QR codes</Button>
          <Button variant="secondary" icon={<Upload size={16} />} onClick={() => setModal('import')}>Importer</Button>
          <Button icon={<Plus size={16} />} onClick={() => setModal('create')} disabled={!g.sites.length}>Nouvelle machine</Button>
        </> : g.isTech ? <Button variant="secondary" icon={<Printer size={16} />} onClick={() => setModal('qr')} disabled={!shown.length}>QR codes</Button> : undefined}
      />
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex items-center gap-2 bg-white border border-border rounded-2xl px-3 flex-1 min-w-[220px]">
          <Search size={16} className="text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Code, désignation, immatriculation, n° de série…" className="flex-1 py-2.5 text-sm focus:outline-none bg-transparent" />
          {q && <button onClick={() => setQ('')} aria-label="Effacer"><X size={14} className="text-gray-400" /></button>}
        </div>
        <Segmented value={stateFilter} onChange={setStateFilter} options={[{ value: 'ALL', label: 'Toutes' }, { value: 'INDISPONIBLE', label: 'À l’arrêt' }, { value: 'DEGRADE', label: 'Dégradées' }]} />
        {g.typologies.length > 0 && <div className="w-44"><Select value={typology} onChange={e => setTypology(e.target.value)}><option value="">Toutes typologies</option>{g.typologies.filter(t => !t.isArchived).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>}
        {!g.isClient && g.clients.length > 0 && <div className="w-44"><Select value={client} onChange={e => setClient(e.target.value)}><option value="">Tous les clients</option><option value="__none">Parc interne</option>{g.clients.filter(c => !c.isArchived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>}
        {g.isTech && <Segmented value={mineOnly ? 'mine' : 'all'} onChange={v => setMineOnly(v === 'mine')} options={[{ value: 'mine', label: 'Mon parc' }, { value: 'all', label: 'Tout le parc' }]} />}
        {g.isResp && <Button small variant="ghost" onClick={() => setShowArchived(v => !v)}>{showArchived ? 'Parc actif' : 'Archivées'}</Button>}
      </div>

      {g.isResp && !g.sites.length && <Card className="p-6 text-sm text-gray-500">Commencez par créer un site dans <button className="text-primary font-bold" onClick={() => g.navigate('reglages')}>Réglages</button>.</Card>}
      {!shown.length && g.sites.length > 0 && <Card><Empty>{g.assets.length ? 'Aucune machine ne correspond.' : 'Aucune machine. Créez-en une ou importez votre parc.'}</Empty></Card>}

      <div className="space-y-4">
        {sites.map(site => {
          const siteRoots = shown.filter(a => a.siteId === site.id);
          if (!siteRoots.length) return null;
          const equipments = siteRoots.filter(a => a.level === 'EQUIPEMENT');
          const counts = stateCounts(equipments);
          return (
            <Card key={site.id} className="overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2"><Boxes size={18} className="text-primary" /><h2 className="text-lg font-black text-dark">{site.name}</h2><span className="text-sm text-gray-400">{equipments.length} machine(s)</span></div>
                <div className="flex gap-3 text-xs font-bold">
                  {counts.INDISPONIBLE > 0 && <span className="text-danger">{counts.INDISPONIBLE} à l’arrêt</span>}
                  {counts.DEGRADE > 0 && <span className="text-orange-500">{counts.DEGRADE} dégradée(s)</span>}
                  {!counts.INDISPONIBLE && !counts.DEGRADE && <span className="text-success">Tout est opérationnel</span>}
                </div>
              </div>
              <div className="p-2">
                {typIds.map(tid => {
                  const key = `${site.id}:${tid}`;
                  const list = siteRoots.filter(a => (a.typologyId || '') === tid);
                  if (!list.length) return null;
                  const isOpen = filtering || (openNodes[key] ?? true);
                  return (
                    <div key={key}>
                      <button onClick={() => toggle(key)} className="w-full flex items-center gap-1 py-2 px-1 text-left hover:bg-gray-50 rounded-xl">
                        <span className="w-6 h-6 flex items-center justify-center text-gray-400">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                        <span className="text-xs font-black uppercase tracking-widest text-gray-500">{tid ? g.typologyName(tid) : 'Sans typologie'}</span>
                        <span className="text-xs text-gray-400 ml-1">({list.length})</span>
                      </button>
                      {isOpen && list.map(a => renderAsset(a, 1))}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
      {modal === 'create' && <AssetFormModal onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportModal onClose={() => setModal(null)} />}
      {modal === 'qr' && <QrSheetModal assets={shown.filter(a => a.level === 'EQUIPEMENT' || hierarchy)} onClose={() => setModal(null)} />}
    </div>
  );
};
