import React, { useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  Plus, ChevronRight, ChevronDown, Search, FileText, Upload, Trash2, Printer, Gauge, Wrench, Flag, Pencil,
  Archive, RotateCcw, Boxes, MapPin, X,
} from 'lucide-react';
import {
  Asset, AssetState, COMPANIES, COMPONENT_CATEGORIES, FAMILIES, LEVEL_LABEL, METER_UNIT, OPEN_WORK_ORDER_STATUSES,
  STATE_LABEL,
} from '../../functions/src/gmao/model';
import { availabilityRate, stateCounts, workOrderCost } from '../../functions/src/gmao/rules';
import { useGmao } from './GmaoContext';
import {
  Badge, Button, Card, Empty, Field, familyLabel, fmtDate, fmtDateTime, fmtNum, fmtPct, fmtShortDate, fmtXpf, Info,
  Input, Label, Modal, PageHeader, PriorityBadge, ReqStatusBadge, Segmented, Select, sinceLabel, STATE_DOT,
  StateBadge, Textarea, WoStatusBadge, relativeDays,
} from './ui';
import { RequestFormModal } from './RequestsView';
import { WorkOrderFormModal } from './WorkOrdersView';

// ─── Formulaire équipement ───────────────────────────────────────────────────

export const AssetFormModal: React.FC<{ onClose: () => void; edit?: Asset; parent?: Asset }> = ({ onClose, edit, parent }) => {
  const { sites, run, openAsset } = useGmao();
  const isChild = !!(parent || edit?.parentId);
  const [f, setF] = useState({
    code: edit?.code || (parent ? `${parent.code}-` : ''),
    name: edit?.name || '',
    family: edit?.family || 'EN',
    siteId: edit?.siteId || sites.find(s => s.status !== 'ARCHIVED')?.id || '',
    company: edit?.company || 'CSP',
    location: edit?.location || '',
    brand: edit?.brand || '', model: edit?.model || '',
    serialNumber: edit?.serialNumber || '', registration: edit?.registration || '',
    commissioningDate: edit?.commissioningDate || '',
    meterType: edit?.meterType || '',
    meterValue: '',
    componentCategory: edit?.componentCategory || '',
    level: 'SOUS_EQUIPEMENT',
    notes: edit?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const submit = async () => {
    setSaving(true);
    const payload: any = { ...f, meterType: f.meterType || null, componentCategory: f.componentCategory || null };
    let res;
    if (edit) {
      delete payload.meterValue; delete payload.level;
      res = await run('ASSET_UPDATE', { id: edit.id, updates: payload }, 'Fiche mise à jour.');
    } else {
      res = await run('ASSET_CREATE', { ...payload, parentId: parent?.id || null }, 'Équipement créé.');
    }
    setSaving(false);
    if (res) { onClose(); if (!edit && res.id) openAsset(res.id); }
  };

  return (
    <Modal title={edit ? `Modifier ${edit.code}` : parent ? `Ajouter sous ${parent.code}` : 'Nouvel équipement'} onClose={onClose} wide footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!f.code.trim() || !f.name.trim() || (!isChild && !f.siteId)}>{edit ? 'Enregistrer' : 'Créer'}</Button>
    </>}>
      {parent && !edit && parent.level === 'EQUIPEMENT' && (
        <Field label="Niveau">
          <Segmented value={f.level as any} onChange={v => set('level', v)} options={[{ value: 'SOUS_EQUIPEMENT', label: 'Sous-équipement' }, { value: 'COMPOSANT', label: 'Composant' }]} />
        </Field>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Code" required hint="Ex. EN486"><Input value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} /></Field>
        <Field label="Désignation" required className="sm:col-span-2"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Chargeuse Liebherr L550" /></Field>
      </div>
      {!isChild ? (
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Type d'équipement"><Select value={f.family} onChange={e => set('family', e.target.value)}>{FAMILIES.map(x => <option key={x.code} value={x.code}>{x.code} · {x.label}</option>)}</Select></Field>
          <Field label="Site" required><Select value={f.siteId} onChange={e => set('siteId', e.target.value)}>{sites.filter(s => s.status !== 'ARCHIVED').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Société propriétaire"><Select value={f.company} onChange={e => set('company', e.target.value)}>{COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}</Select></Field>
        </div>
      ) : (
        <Field label="Catégorie">
          <Select value={f.componentCategory} onChange={e => set('componentCategory', e.target.value)}>
            <option value="">—</option>{COMPONENT_CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Localisation précise"><Input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Plateforme de tri, alvéole…" /></Field>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label="Marque"><Input value={f.brand} onChange={e => set('brand', e.target.value)} /></Field>
        <Field label="Modèle"><Input value={f.model} onChange={e => set('model', e.target.value)} /></Field>
        <Field label="N° de série"><Input value={f.serialNumber} onChange={e => set('serialNumber', e.target.value)} /></Field>
        <Field label="Immatriculation"><Input value={f.registration} onChange={e => set('registration', e.target.value)} /></Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Mise en service"><Input type="date" value={f.commissioningDate} onChange={e => set('commissioningDate', e.target.value)} /></Field>
        <Field label="Compteur"><Select value={f.meterType} onChange={e => set('meterType', e.target.value)}><option value="">Aucun</option><option value="HEURES">Horamètre (h)</option><option value="KM">Odomètre (km)</option></Select></Field>
        {!edit && f.meterType && <Field label="Valeur actuelle"><Input type="number" min={0} value={f.meterValue} onChange={e => set('meterValue', e.target.value)} /></Field>}
      </div>
      <Field label="Notes"><Textarea value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
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
      {state !== 'OPERATIONNEL' && <Field label="Raison d'indisponibilité" required><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. : attente pièce, panne moteur…" /></Field>}
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
      if (res.generatedWorkOrders?.length) toast(`Échéance préventive atteinte : ${res.generatedWorkOrders.join(', ')} créé(s).`, 'info');
      onClose();
    }
  };
  return (
    <Modal title={`Relevé ${asset.meterType === 'KM' ? 'odomètre' : 'horamètre'} · ${asset.code}`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!value}>Enregistrer</Button>
    </>}>
      <Field label={`Valeur (${unit})`} hint={`Dernier relevé : ${fmtNum(asset.meterValue)} ${unit} · ${fmtDateTime(asset.meterUpdatedAt)}`}>
        <Input autoFocus type="number" inputMode="numeric" min={asset.meterValue || 0} value={value} onChange={e => setValue(e.target.value)} />
      </Field>
    </Modal>
  );
};

// ─── Étiquette QR ────────────────────────────────────────────────────────────

const QrModal: React.FC<{ asset: Asset; onClose: () => void }> = ({ asset, onClose }) => {
  const { siteName } = useGmao();
  return (
    <Modal title="Étiquette QR" subtitle="Collez-la sur l'équipement : le scan ouvre directement sa fiche." onClose={onClose} footer={<Button icon={<Printer size={16} />} onClick={() => window.print()}>Imprimer</Button>}>
      <div id="qr-label" className="mx-auto w-[260px] border-2 border-dark rounded-2xl p-4 text-center bg-white">
        <QRCode value={asset.qrCode} size={180} className="mx-auto" />
        <div className="text-2xl font-black mt-3 tracking-tight">{asset.code}</div>
        <div className="text-xs font-semibold">{asset.name}</div>
        <div className="text-[10px] text-gray-500 mt-1">{siteName(asset.siteId)} · {asset.company}</div>
      </div>
      <style>{`@media print { body * { visibility: hidden; } #qr-label, #qr-label * { visibility: visible; } #qr-label { position: fixed; left: 20px; top: 20px; } }`}</style>
    </Modal>
  );
};

// ─── Fiche équipement ────────────────────────────────────────────────────────

export const AssetDetailModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const g = useGmao();
  const asset = g.assetById(id);
  const [sub, setSub] = useState<null | 'state' | 'meter' | 'edit' | 'child' | 'qr' | 'request' | 'wo'>(null);
  const [tab, setTab] = useState<'activite' | 'composants' | 'docs' | 'preventif'>('activite');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const data = useMemo(() => {
    if (!asset) return null;
    const descendants = (pid: string): Asset[] => g.assets.filter(a => a.parentId === pid && !a.isArchived).flatMap(c => [c, ...descendants(c.id)]);
    const family = [asset.id, ...descendants(asset.id).map(a => a.id)];
    const wos = g.workOrders.filter(w => family.includes(w.assetId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const reqs = g.requests.filter(r => family.includes(r.assetId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const evs = g.events.filter(e => e.assetId === asset.id).sort((a, b) => b.at.localeCompare(a.at));
    const plans = g.pmPlans.filter(p => !p.isArchived && p.assetIds.includes(asset.id));
    const end = Date.now(), start = end - 365 * 86400000;
    const closed = wos.filter(w => w.status === 'CLOTURE' && w.closedAt && new Date(w.closedAt).getTime() >= start);
    const breakdowns = closed.filter(w => w.kind === 'CORRECTIF' && w.assetId === asset.id);
    const avail = availabilityRate(asset, g.events, start, end);
    const uptimeH = avail != null ? (avail * (end - Math.max(start, new Date(asset.createdAt).getTime()))) / 3600000 : null;
    const mtbf = breakdowns.length && uptimeH != null ? uptimeH / breakdowns.length : null;
    const repairs = breakdowns.filter(w => w.actualStart && w.actualEnd);
    const mttr = repairs.length ? repairs.reduce((s, w) => s + (new Date(w.actualEnd!).getTime() - new Date(w.actualStart!).getTime()) / 3600000, 0) / repairs.length : null;
    const cost = closed.reduce((s, w) => s + workOrderCost(w, g.settings.hourlyRate).total, 0);
    const parentChain: Asset[] = [];
    let p = g.assetById(asset.parentId);
    while (p) { parentChain.unshift(p); p = g.assetById(p.parentId); }
    return { children: g.assets.filter(a => a.parentId === asset.id && !a.isArchived), wos, reqs, evs, plans, avail, mtbf, mttr, cost, parentChain };
  }, [asset, g.assets, g.workOrders, g.requests, g.events, g.pmPlans, g.settings.hourlyRate]);

  if (!asset || !data) return null;

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
    if (await g.confirm({ title: 'Retirer le document', message: `Retirer « ${name} » de la fiche ?`, variant: 'danger', confirmLabel: 'Retirer' })) {
      await g.run('ASSET_REMOVE_DOCUMENT', { id: asset.id, documentId: docId });
    }
  };
  const archive = async () => {
    const ok = asset.isArchived
      ? await g.confirm({ title: `Réactiver ${asset.code}`, message: "L'équipement revient dans le parc actif.", confirmLabel: 'Réactiver' })
      : await g.confirm({ title: `Archiver ${asset.code}`, message: "L'équipement disparaît du parc actif. L'historique est conservé.", variant: 'danger', confirmLabel: 'Archiver' });
    if (ok) {
      const r = await g.run(asset.isArchived ? 'ASSET_RESTORE' : 'ASSET_ARCHIVE', { id: asset.id }, asset.isArchived ? 'Équipement réactivé.' : 'Équipement archivé.');
      if (r && !asset.isArchived) onClose();
    }
  };

  const openWo = data.wos.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status));
  const unit = asset.meterType ? METER_UNIT[asset.meterType] : '';

  return (
    <>
      <Modal wide title={`${asset.code} · ${asset.name}`} onClose={onClose} subtitle={
        <span className="flex flex-wrap items-center gap-1 text-xs">
          <MapPin size={12} />{g.siteName(asset.siteId)} · {familyLabel(asset.family)}
          {data.parentChain.map(p => <span key={p.id}> › <button className="text-primary font-bold" onClick={() => g.openAsset(p.id)}>{p.code}</button></span>)}
          {asset.level !== 'EQUIPEMENT' && <> · {LEVEL_LABEL[asset.level]}</>}
        </span>
      }>
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={asset.state} />
          {asset.state !== 'OPERATIONNEL' && <span className="text-sm text-gray-600">{asset.stateReason} <span className="text-gray-400">· depuis {sinceLabel(asset.stateSince)}</span></span>}
          {asset.isArchived && <Badge className="bg-gray-200 text-gray-600">Archivé</Badge>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button small icon={<Flag size={14} />} onClick={() => setSub('request')}>Signaler un problème</Button>
          {(g.isResp || g.isTech) && <Button small variant="secondary" onClick={() => setSub('state')}>Changer l'état</Button>}
          {(g.isResp || g.isTech) && asset.meterType && <Button small variant="secondary" icon={<Gauge size={14} />} onClick={() => setSub('meter')}>Relevé {unit}</Button>}
          {g.isResp && <Button small variant="secondary" icon={<Wrench size={14} />} onClick={() => setSub('wo')}>Nouveau BT</Button>}
          <Button small variant="secondary" icon={<Printer size={14} />} onClick={() => setSub('qr')}>QR code</Button>
          {g.isResp && <Button small variant="ghost" icon={<Pencil size={14} />} onClick={() => setSub('edit')}>Modifier</Button>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3"><Label>Disponibilité 12 mois</Label><div className="text-xl font-black mt-1">{fmtPct(data.avail)}</div></Card>
          <Card className="p-3"><Label>MTBF</Label><div className="text-xl font-black mt-1">{data.mtbf != null ? `${fmtNum(data.mtbf)} h` : '—'}</div></Card>
          <Card className="p-3"><Label>MTTR</Label><div className="text-xl font-black mt-1">{data.mttr != null ? `${fmtNum(data.mttr, 1)} h` : '—'}</div></Card>
          <Card className="p-3"><Label>Coût 12 mois</Label><div className="text-xl font-black mt-1">{fmtXpf(data.cost)}</div></Card>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Info label="Société">{asset.company}</Info>
          <Info label="Marque / modèle">{[asset.brand, asset.model].filter(Boolean).join(' ')}</Info>
          <Info label="N° série">{asset.serialNumber}</Info>
          <Info label="Immatriculation">{asset.registration}</Info>
          <Info label="Localisation">{asset.location}</Info>
          <Info label="Mise en service">{asset.commissioningDate ? fmtDate(asset.commissioningDate) : ''}</Info>
          {asset.meterType && <Info label="Compteur">{fmtNum(asset.meterValue)} {unit} <span className="text-gray-400 text-xs">({fmtShortDate(asset.meterUpdatedAt)})</span></Info>}
          {asset.componentCategory && <Info label="Catégorie">{COMPONENT_CATEGORIES.find(c => c.code === asset.componentCategory)?.label}</Info>}
        </div>
        {asset.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap">{asset.notes}</p>}

        <Segmented value={tab} onChange={setTab} options={[
          { value: 'activite', label: `Interventions (${data.wos.length})` },
          ...(asset.level !== 'COMPOSANT' ? [{ value: 'composants' as const, label: `Composants (${data.children.length})` }] : []),
          { value: 'docs', label: `Documents (${asset.documents?.length || 0})` },
          { value: 'preventif', label: `Préventif (${data.plans.length})` },
        ]} />

        {tab === 'activite' && (
          <div className="space-y-4">
            {openWo.length > 0 && <div><Label className="mb-2">En cours</Label>{openWo.map(w => <WoRow key={w.id} w={w} />)}</div>}
            {data.reqs.filter(r => r.status === 'A_APPROUVER').map(r => (
              <button key={r.id} onClick={() => g.openRequest(r.id)} className="w-full text-left rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm flex items-center justify-between gap-2">
                <span><b>{r.number}</b> · {r.description}</span><ReqStatusBadge s={r.status} />
              </button>
            ))}
            <div>
              <Label className="mb-2">Historique</Label>
              {data.wos.filter(w => !OPEN_WORK_ORDER_STATUSES.includes(w.status)).slice(0, 30).map(w => <WoRow key={w.id} w={w} />)}
              {!data.wos.length && <Empty>Aucune intervention enregistrée.</Empty>}
            </div>
            {data.evs.length > 0 && (
              <div>
                <Label className="mb-2">États et relevés</Label>
                <div className="max-h-48 overflow-y-auto text-sm space-y-1">
                  {data.evs.slice(0, 40).map(e => (
                    <div key={e.id} className="flex justify-between gap-2 border-b border-gray-50 py-1">
                      <span>{e.type === 'STATE' ? <><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${STATE_DOT[e.toState!]}`} />{STATE_LABEL[e.toState!]}{e.reason ? ` — ${e.reason}` : ''}</> : <>Relevé : <b>{fmtNum(e.value)} {unit}</b></>}</span>
                      <span className="text-gray-400 text-xs shrink-0">{fmtDateTime(e.at)} · {e.byName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'composants' && (
          <div className="space-y-2">
            {data.children.map(c => (
              <button key={c.id} onClick={() => g.openAsset(c.id)} className="w-full text-left rounded-xl border border-border px-3 py-2.5 flex items-center justify-between gap-2 hover:border-primary/40">
                <span className="text-sm"><b>{c.code}</b> · {c.name} <span className="text-gray-400">· {LEVEL_LABEL[c.level]}{c.componentCategory ? ` · ${COMPONENT_CATEGORIES.find(x => x.code === c.componentCategory)?.label}` : ''}</span></span>
                <StateBadge state={c.state} />
              </button>
            ))}
            {!data.children.length && <Empty>Aucun sous-équipement ni composant.</Empty>}
            {g.isResp && <Button small variant="secondary" icon={<Plus size={14} />} onClick={() => setSub('child')}>Ajouter un sous-équipement / composant</Button>}
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
            {!asset.documents?.length && <Empty>Aucun document. Ajoutez les manuels constructeur, schémas, certificats…</Empty>}
            {g.isResp && <>
              <Button small variant="secondary" loading={uploading} icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>Ajouter un document</Button>
              <input ref={fileRef} type="file" multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" className="hidden" onChange={e => uploadDoc(e.target.files)} />
              {g.backend.mode === 'demo' && <p className="text-[11px] text-gray-400">Mode démo : les documents ne sont conservés que pendant la session.</p>}
            </>}
          </div>
        )}

        {tab === 'preventif' && (
          <div className="space-y-2">
            {data.plans.map(p => {
              const e = p.schedule[asset.id];
              return (
                <div key={p.id} className="rounded-xl border border-border px-3 py-2.5 flex items-center justify-between gap-2 text-sm">
                  <span><b>{p.name}</b>{!p.isActive && <span className="text-gray-400"> (désactivée)</span>}</span>
                  <span className="text-gray-500 text-xs">{p.trigger === 'CALENDAIRE' ? `prochaine : ${fmtDate(e?.nextDueAt)} (${relativeDays(e?.nextDueAt)})` : `prochaine à ${fmtNum(e?.nextDueMeter)} ${unit}`}</span>
                </div>
              );
            })}
            {!data.plans.length && <Empty>Aucune gamme préventive sur cet équipement.</Empty>}
          </div>
        )}

        {g.isResp && (
          <div className="pt-2 border-t border-border">
            <Button small variant="ghost" icon={asset.isArchived ? <RotateCcw size={14} /> : <Archive size={14} />} onClick={archive}>{asset.isArchived ? 'Réactiver' : 'Archiver'}</Button>
          </div>
        )}
      </Modal>
      {sub === 'state' && <StateModal asset={asset} onClose={() => setSub(null)} />}
      {sub === 'meter' && <MeterModal asset={asset} onClose={() => setSub(null)} />}
      {sub === 'edit' && <AssetFormModal edit={asset} onClose={() => setSub(null)} />}
      {sub === 'child' && <AssetFormModal parent={asset} onClose={() => setSub(null)} />}
      {sub === 'qr' && <QrModal asset={asset} onClose={() => setSub(null)} />}
      {sub === 'request' && <RequestFormModal assetId={asset.id} onClose={() => setSub(null)} />}
      {sub === 'wo' && <WorkOrderFormModal assetId={asset.id} onClose={() => setSub(null)} />}
    </>
  );
};

const WoRow: React.FC<{ w: any }> = ({ w }) => {
  const { openWorkOrder } = useGmao();
  return (
    <button onClick={() => openWorkOrder(w.id)} className="w-full text-left rounded-xl border border-border px-3 py-2 mb-1.5 flex items-center gap-2 hover:border-primary/40">
      <PriorityBadge p={w.priority} />
      <span className="flex-1 min-w-0 text-sm truncate"><b>{w.assetCode}</b> · {w.title}</span>
      <span className="text-[11px] text-gray-400 shrink-0">{fmtShortDate(w.closedAt || w.plannedStart || w.createdAt)}</span>
      <WoStatusBadge s={w.status} />
    </button>
  );
};

// ─── Vue parc (arborescence) ─────────────────────────────────────────────────

export const AssetsView: React.FC = () => {
  const g = useGmao();
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState<'ALL' | AssetState>('ALL');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpenNodes(p => ({ ...p, [k]: !(p[k] ?? false) }));

  const visible = g.assets.filter(a => showArchived ? a.isArchived : !a.isArchived);
  const search = q.trim().toLowerCase();
  const matches = (a: Asset) => (!search || `${a.code} ${a.name} ${a.registration || ''} ${a.brand || ''}`.toLowerCase().includes(search)) && (stateFilter === 'ALL' || a.state === stateFilter);
  const childrenOf = (id: string) => visible.filter(a => a.parentId === id);
  const subtreeMatches = (a: Asset): boolean => matches(a) || childrenOf(a.id).some(subtreeMatches);
  const roots = visible.filter(a => !a.parentId || showArchived);
  const filtering = !!search || stateFilter !== 'ALL';

  const renderAsset = (a: Asset, depth: number): React.ReactNode => {
    if (!subtreeMatches(a)) return null;
    const kids = showArchived ? [] : childrenOf(a.id);
    const isOpen = filtering || openNodes[a.id];
    const openWo = g.workOrders.filter(w => w.assetId === a.id && OPEN_WORK_ORDER_STATUSES.includes(w.status)).length;
    return (
      <div key={a.id}>
        <div className="flex items-center gap-1 py-1.5 pr-2 hover:bg-gray-50 rounded-xl" style={{ paddingLeft: depth * 18 + 4 }}>
          <button onClick={() => kids.length && toggle(a.id)} className={`w-6 h-6 flex items-center justify-center text-gray-400 ${kids.length ? '' : 'invisible'}`} aria-label="Déplier">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <button onClick={() => g.openAsset(a.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
            <span className={`w-2 h-2 rounded-full shrink-0 ${STATE_DOT[a.state]}`} title={STATE_LABEL[a.state]} />
            <span className="text-sm font-black text-dark shrink-0">{a.code}</span>
            <span className="text-sm text-gray-600 truncate">{a.name}</span>
            {a.state !== 'OPERATIONNEL' && <span className="hidden md:inline text-[11px] text-gray-400 truncate">— {a.stateReason}</span>}
          </button>
          {openWo > 0 && <Badge className="bg-primary/10 text-primary" title="Bons de travail ouverts"><Wrench size={10} />{openWo}</Badge>}
          {a.meterType && <span className="hidden sm:inline text-[11px] text-gray-400 w-24 text-right">{fmtNum(a.meterValue)} {METER_UNIT[a.meterType]}</span>}
        </div>
        {isOpen && kids.map(k => renderAsset(k, depth + 1))}
      </div>
    );
  };

  const sitesWithAssets = g.sites.filter(s => roots.some(a => a.siteId === s.id) || s.status !== 'ARCHIVED');

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Parc"
        subtitle={`${g.assets.filter(a => !a.isArchived && a.level === 'EQUIPEMENT').length} équipements · ${g.assets.filter(a => !a.isArchived && a.level !== 'EQUIPEMENT').length} sous-équipements et composants`}
        actions={g.isResp ? <Button icon={<Plus size={16} />} onClick={() => setCreating(true)} disabled={!g.sites.length}>Nouvel équipement</Button> : undefined}
      />
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex items-center gap-2 bg-white border border-border rounded-2xl px-3 flex-1 min-w-[220px]">
          <Search size={16} className="text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un code, une désignation, une immatriculation…" className="flex-1 py-2.5 text-sm focus:outline-none bg-transparent" />
          {q && <button onClick={() => setQ('')} aria-label="Effacer"><X size={14} className="text-gray-400" /></button>}
        </div>
        <Segmented value={stateFilter} onChange={setStateFilter} options={[{ value: 'ALL', label: 'Tous' }, { value: 'INDISPONIBLE', label: 'Indisponibles' }, { value: 'DEGRADE', label: 'Dégradés' }, { value: 'OPERATIONNEL', label: 'Opérationnels' }]} />
        {g.isResp && <Button small variant="ghost" onClick={() => setShowArchived(v => !v)}>{showArchived ? 'Parc actif' : 'Archivés'}</Button>}
      </div>

      {!g.sites.length && <Card className="p-6 text-sm text-gray-500">Commencez par créer vos sites dans <button className="text-primary font-bold" onClick={() => g.navigate('reglages')}>Réglages</button>.</Card>}

      <div className="space-y-4">
        {sitesWithAssets.map(site => {
          const siteRoots = roots.filter(a => a.siteId === site.id);
          const equipments = siteRoots.filter(a => a.level === 'EQUIPEMENT');
          const counts = stateCounts(equipments);
          const total = equipments.length || 1;
          const families = FAMILIES.filter(f => siteRoots.some(a => a.family === f.code));
          if (!siteRoots.some(subtreeMatches) && filtering) return null;
          return (
            <Card key={site.id} className="overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><Boxes size={18} className="text-primary" /><h2 className="text-lg font-black text-dark">{site.name}</h2><span className="text-sm text-gray-400">{equipments.length} équipements</span></div>
                  <div className="flex gap-3 text-xs font-bold">
                    <span className="text-success">{Math.round(counts.OPERATIONNEL / total * 100)} % opérationnels</span>
                    <span className="text-orange-500">{Math.round(counts.DEGRADE / total * 100)} % dégradés</span>
                    <span className="text-danger">{Math.round(counts.INDISPONIBLE / total * 100)} % indisponibles</span>
                  </div>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mt-3">
                  <div className="bg-success" style={{ width: `${counts.OPERATIONNEL / total * 100}%` }} />
                  <div className="bg-orange-400" style={{ width: `${counts.DEGRADE / total * 100}%` }} />
                  <div className="bg-danger" style={{ width: `${counts.INDISPONIBLE / total * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {families.map(f => <Badge key={f.code} className="bg-gray-100 text-gray-600">{f.code} · {siteRoots.filter(a => a.family === f.code && a.level === 'EQUIPEMENT').length}</Badge>)}
                </div>
              </div>
              <div className="p-2">
                {families.map(f => {
                  const key = `${site.id}:${f.code}`;
                  const list = siteRoots.filter(a => a.family === f.code && (showArchived || !a.parentId));
                  if (!list.some(subtreeMatches)) return null;
                  const isOpen = filtering || openNodes[key];
                  return (
                    <div key={key}>
                      <button onClick={() => toggle(key)} className="w-full flex items-center gap-1 py-2 px-1 text-left hover:bg-gray-50 rounded-xl">
                        <span className="w-6 h-6 flex items-center justify-center text-gray-400">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                        <span className="text-xs font-black uppercase tracking-widest text-gray-500">{f.label}</span>
                        <span className="text-xs text-gray-400 ml-1">({list.length})</span>
                        <span className="ml-auto flex gap-1 pr-2">
                          {(['INDISPONIBLE', 'DEGRADE'] as AssetState[]).map(s => {
                            const n = list.filter(a => a.state === s).length;
                            return n ? <Badge key={s} className={s === 'INDISPONIBLE' ? 'bg-danger/10 text-danger' : 'bg-orange-100 text-orange-600'}>{n}</Badge> : null;
                          })}
                        </span>
                      </button>
                      {isOpen && list.map(a => renderAsset(a, 1))}
                    </div>
                  );
                })}
                {!siteRoots.length && <Empty>Aucun équipement sur ce site.</Empty>}
              </div>
            </Card>
          );
        })}
      </div>
      {creating && <AssetFormModal onClose={() => setCreating(false)} />}
    </div>
  );
};
