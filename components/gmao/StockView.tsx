// Module stock (option par organisation) : articles, magasins et casiers, mouvements, états pour la comptabilité.
import React, { useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Boxes, ClipboardPen, Copy, Download, FileUp, MapPin, Package,
  Pencil, Plus, Printer, QrCode, Search, Undo2, Archive, Trash2,
} from 'lucide-react';
import {
  OPEN_WORK_ORDER_STATUSES, STOCK_MOVE_LABEL, STOCK_UNITS, StockItem, StockLocation, StockMove, StockMoveType, qrPath,
  tokenFromScan,
} from '../../functions/src/gmao/model';
import { locationLabel, monthBounds, periodRecap, stockSnapshot } from '../../functions/src/gmao/stock';
import { useGmao } from './GmaoContext';
import {
  AssetPicker, Badge, Button, Card, Empty, Field, Input, Kpi, Label, Modal, PageHeader, Segmented, Select, Textarea,
  downloadCsv, fmtDateTime, fmtNum, fmtXpf, fromLocalInput, toLocalInput,
} from './ui';

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const MOVE_CLASS: Record<StockMoveType, string> = {
  ENTREE: 'bg-success/10 text-success', SORTIE: 'bg-primary/10 text-primary', RETOUR: 'bg-teal-50 text-teal-700',
  TRANSFERT: 'bg-blue-50 text-blue-700', AJUSTEMENT: 'bg-amber-50 text-amber-700',
};
const MoveBadge: React.FC<{ t: StockMoveType }> = ({ t }) => <Badge className={MOVE_CLASS[t]}>{STOCK_MOVE_LABEL[t]}</Badge>;
const low = (i: StockItem) => i.minQty != null && i.qty <= i.minQty;
const plural = (unit: string, n: number) => {
  if (Math.abs(n) < 2 || /^(kg|g|l|ml|m|cm|mm)$/i.test(unit) || /[sx]$/i.test(unit)) return unit;
  if (/eu$/i.test(unit)) return `${unit}x`;
  return unit.split(' ').map((w, i) => (i === 0 ? `${w}s` : w)).join(' ');
};
const qtyTxt = (n: number, unit: string) => `${fmtNum(n, 3)} ${plural(unit, n)}`;
const csvNum = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

/** Retrouve un emplacement de stock à partir d'un QR code scanné (URL /q/jeton) ou du jeton seul. */
export function findLocationFromScan(locations: StockLocation[], text: string): StockLocation | undefined {
  const t = String(text || '').trim();
  const token = tokenFromScan(t) || t;
  return locations.find(l => l.qrToken === token && !l.isArchived);
}

function useStockHelpers() {
  const g = useGmao();
  const { items, locations } = g.stock;
  const active = locations.filter(l => !l.isArchived);
  const label = (id?: string | null) => locationLabel(locations.find(l => l.id === id), locations);
  /** Emplacements où l'on range (casiers, et magasins sans casier). */
  const slots = active.filter(l => l.kind === 'CASIER' || !active.some(c => c.parentId === l.id))
    .sort((a, b) => locationLabel(a, locations).localeCompare(locationLabel(b, locations), 'fr', { numeric: true }));
  const itemById = (id?: string | null) => items.find(i => i.id === id);
  return { g, items, locations, active, slots, label, itemById };
}

/** Recherche d'article (référence, désignation, références fournisseurs). */
const ItemPicker: React.FC<{ value: string; onChange: (id: string) => void; onlyInStock?: boolean; autoFocus?: boolean }> = ({ value, onChange, onlyInStock, autoFocus }) => {
  const { items } = useStockHelpers();
  const [q, setQ] = useState('');
  const selected = items.find(i => i.id === value);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = items.filter(i => !i.isArchived && (!onlyInStock || i.qty > 0));
    return (s ? list.filter(i => `${i.code} ${i.name} ${(i.supplierRefs || []).join(' ')} ${i.family || ''}`.toLowerCase().includes(s)) : list)
      .sort((a, b) => a.code.localeCompare(b.code)).slice(0, 40);
  }, [q, items, onlyInStock]);
  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
        <div className="min-w-0 text-sm"><b>{selected.code}</b> · {selected.name}<div className="text-[11px] text-gray-500">En stock : {qtyTxt(selected.qty, selected.unit)}</div></div>
        <button type="button" onClick={() => onChange('')} className="text-xs font-bold text-primary">Changer</button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-2 px-3 border-b border-border">
        <Search size={16} className="text-gray-400" />
        <input autoFocus={autoFocus} value={q} onChange={e => setQ(e.target.value)} placeholder="Référence, désignation, réf. fournisseur…" className="flex-1 py-2.5 text-sm focus:outline-none" />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {results.map(i => (
          <button type="button" key={i.id} onClick={() => { onChange(i.id); setQ(''); }} className="w-full text-left px-3 py-2 hover:bg-primary/5 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0">
            <span className="text-sm min-w-0 truncate"><b>{i.code}</b> · {i.name}</span>
            <span className="text-[11px] text-gray-400 shrink-0">{qtyTxt(i.qty, i.unit)}</span>
          </button>
        ))}
        {!results.length && <div className="px-3 py-4 text-sm text-gray-400">Aucun article trouvé.</div>}
      </div>
    </div>
  );
};

/** Liste des emplacements d'un article où il reste du stock (ou tous les emplacements). */
const SlotSelect: React.FC<{ item?: StockItem; value: string; onChange: (id: string) => void; withStockOnly?: boolean; exclude?: string }> = ({ item, value, onChange, withStockOnly, exclude }) => {
  const { slots, label } = useStockHelpers();
  const options = withStockOnly && item
    ? Object.entries(item.levels || {}).filter(([, q]) => Number(q) > 0).map(([id, q]) => ({ id, txt: `${label(id)} — ${qtyTxt(Number(q), item.unit)}` }))
    : slots.map(l => ({ id: l.id, txt: `${label(l.id)}${item?.levels?.[l.id] ? ` — ${qtyTxt(item.levels[l.id], item.unit)}` : ''}` }));
  return (
    <Select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Choisir…</option>
      {options.filter(o => o.id !== exclude).map(o => <option key={o.id} value={o.id}>{o.txt}</option>)}
    </Select>
  );
};

// ─── Mouvements ──────────────────────────────────────────────────────────────

export type MoveMode = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST';
const MODE_TITLE: Record<MoveMode, string> = { IN: 'Entrée en stock', OUT: 'Sortie de stock', TRANSFER: 'Transfert', ADJUST: 'Ajuster la quantité' };

export const MoveModal: React.FC<{ mode: MoveMode; itemId?: string; locationId?: string; workOrderId?: string; onClose: () => void }> = ({ mode, itemId: initialItem, locationId, workOrderId, onClose }) => {
  const { g, itemById, label } = useStockHelpers();
  const [f, setF] = useState({
    itemId: initialItem || '', locationId: locationId || '', toLocationId: '', qty: '', unitCost: '', reference: '',
    at: toLocalInput(new Date().toISOString()), forWorkOrderId: '', workOrderId: workOrderId || '', assetId: '', reason: '', countedQty: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const item = itemById(f.itemId);
  const here = item?.levels?.[f.locationId] || 0;
  const openWos = g.workOrders.filter(w => OPEN_WORK_ORDER_STATUSES.includes(w.status) && (g.isResp || w.assigneeIds.includes(g.me.id)))
    .sort((a, b) => b.number.localeCompare(a.number));
  const linkedWo = g.workOrders.find(w => w.id === f.workOrderId);

  const submit = async () => {
    setSaving(true);
    let res: any = null;
    if (mode === 'IN') res = await g.run('STOCK_IN', { itemId: f.itemId, locationId: f.locationId, qty: f.qty, unitCost: f.unitCost, reference: f.reference, at: fromLocalInput(f.at), forWorkOrderId: f.forWorkOrderId || undefined, reason: f.reason }, f.forWorkOrderId ? 'Pièce reçue et sortie pour l’intervention.' : 'Entrée enregistrée.');
    if (mode === 'OUT') res = await g.run('STOCK_OUT', { itemId: f.itemId, locationId: f.locationId, qty: f.qty, workOrderId: f.workOrderId || undefined, assetId: f.workOrderId ? undefined : (f.assetId || undefined), reason: f.reason }, 'Sortie enregistrée.');
    if (mode === 'TRANSFER') res = await g.run('STOCK_TRANSFER', { itemId: f.itemId, locationId: f.locationId, toLocationId: f.toLocationId, qty: f.qty, reason: f.reason }, 'Transfert enregistré.');
    if (mode === 'ADJUST') res = await g.run('STOCK_ADJUST', { itemId: f.itemId, locationId: f.locationId, countedQty: f.countedQty, reason: f.reason }, 'Quantité ajustée.');
    setSaving(false);
    if (res) onClose();
  };
  const ready = !!f.itemId && !!f.locationId && (mode === 'ADJUST' ? f.countedQty !== '' && !!f.reason.trim() : !!f.qty)
    && (mode !== 'IN' || f.unitCost !== '') && (mode !== 'TRANSFER' || !!f.toLocationId)
    && (mode !== 'OUT' || !!(f.workOrderId || f.assetId || f.reason.trim()));

  return (
    <Modal title={MODE_TITLE[mode]} subtitle={linkedWo ? `${linkedWo.number} · ${linkedWo.assetCode}` : undefined} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!ready}>Enregistrer</Button>
    </>}>
      <Field label="Article" required><ItemPicker value={f.itemId} onChange={v => { set('itemId', v); if (mode !== 'IN' && !locationId) set('locationId', ''); }} onlyInStock={mode === 'OUT' || mode === 'TRANSFER'} autoFocus={!initialItem} /></Field>
      <Field label={mode === 'IN' ? 'Ranger dans' : mode === 'TRANSFER' ? 'Depuis' : 'Emplacement'} required>
        <SlotSelect item={item} value={f.locationId} onChange={v => set('locationId', v)} withStockOnly={mode === 'OUT' || mode === 'TRANSFER'} />
      </Field>
      {mode === 'TRANSFER' && <Field label="Vers" required><SlotSelect item={item} value={f.toLocationId} onChange={v => set('toLocationId', v)} exclude={f.locationId} /></Field>}
      {mode === 'ADJUST' ? (
        <>
          <Field label="Quantité comptée" required hint={item && f.locationId ? `Quantité enregistrée : ${qtyTxt(here, item.unit)}` : undefined}>
            <Input type="number" inputMode="decimal" min={0} step="any" value={f.countedQty} onChange={e => set('countedQty', e.target.value)} />
          </Field>
          <Field label="Motif" required><Input value={f.reason} onChange={e => set('reason', e.target.value)} placeholder="Ex. : inventaire du casier, casse, sortie non saisie" /></Field>
        </>
      ) : (
        <Field label={`Quantité${item ? ` (${item.unit})` : ''}`} required hint={mode !== 'IN' && item && f.locationId ? `Disponible ici : ${qtyTxt(here, item.unit)}` : undefined}>
          <Input type="number" inputMode="decimal" min={0} step="any" value={f.qty} onChange={e => set('qty', e.target.value)} />
        </Field>
      )}
      {mode === 'IN' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix unitaire HT (XPF)" required hint="Prix de la facture : il alimente le prix moyen pondéré."><Input type="number" inputMode="decimal" min={0} step="any" value={f.unitCost} onChange={e => set('unitCost', e.target.value)} /></Field>
            <Field label="Date de réception"><Input type="datetime-local" value={f.at} onChange={e => set('at', e.target.value)} /></Field>
          </div>
          <Field label="Référence" hint="Bon de livraison, facture, numéro de commande Yooz…"><Input value={f.reference} onChange={e => set('reference', e.target.value)} /></Field>
          <Field label="Reçue pour une intervention" hint="La pièce entre en stock puis sort aussitôt vers l’intervention : elle reste tracée et valorisée.">
            <Select value={f.forWorkOrderId} onChange={e => set('forWorkOrderId', e.target.value)}>
              <option value="">Non, elle reste en stock</option>
              {openWos.map(w => <option key={w.id} value={w.id}>{w.number} · {w.assetCode} · {w.title}</option>)}
            </Select>
          </Field>
        </>
      )}
      {mode === 'OUT' && !workOrderId && (
        <>
          <Field label="Intervention">
            <Select value={f.workOrderId} onChange={e => set('workOrderId', e.target.value)}>
              <option value="">Aucune</option>
              {openWos.map(w => <option key={w.id} value={w.id}>{w.number} · {w.assetCode} · {w.title}</option>)}
            </Select>
          </Field>
          {!f.workOrderId && <Field label="Machine"><AssetPicker assets={g.assets} value={f.assetId} onChange={v => set('assetId', v)} siteName={g.siteName} /></Field>}
        </>
      )}
      {(mode === 'OUT' || mode === 'TRANSFER') && <Field label="Motif" hint={mode === 'OUT' ? 'Obligatoire sans intervention ni machine (ex. : appoint atelier).' : undefined}><Input value={f.reason} onChange={e => set('reason', e.target.value)} /></Field>}
      {mode === 'IN' && f.locationId && <p className="text-xs text-gray-400">Rangée dans : {label(f.locationId)}</p>}
    </Modal>
  );
};

const ReturnModal: React.FC<{ move: StockMove; onClose: () => void }> = ({ move, onClose }) => {
  const { g } = useStockHelpers();
  const left = Math.round((move.qty - (move.returnedQty || 0)) * 1000) / 1000;
  const [qty, setQty] = useState(String(left));
  const [locationId, setLocationId] = useState(move.locationId);
  const [saving, setSaving] = useState(false);
  const item = g.stock.items.find(i => i.id === move.itemId);
  const submit = async () => {
    setSaving(true);
    const res = await g.run('STOCK_RETURN', { sourceMoveId: move.id, qty, locationId }, 'Retour enregistré.');
    setSaving(false);
    if (res) onClose();
  };
  return (
    <Modal title="Retour en stock" subtitle={`${move.number} · ${move.itemCode} · ${move.itemName}`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!qty}>Enregistrer le retour</Button>
    </>}>
      <p className="text-sm text-gray-600">Sortie de {qtyTxt(move.qty, move.unit)}{move.workOrderNumber ? ` pour ${move.workOrderNumber}` : ''} : {qtyTxt(left, move.unit)} peuvent revenir en stock, au prix de la sortie.</p>
      <Field label={`Quantité retournée (${move.unit})`} required><Input type="number" inputMode="decimal" min={0} max={left} step="any" value={qty} onChange={e => setQty(e.target.value)} /></Field>
      <Field label="Ranger dans"><SlotSelect item={item} value={locationId} onChange={setLocationId} /></Field>
    </Modal>
  );
};

const MoveRow: React.FC<{ m: StockMove; showValue: boolean; onReturn?: (m: StockMove) => void }> = ({ m, showValue, onReturn }) => {
  const g = useGmao();
  const left = m.type === 'SORTIE' ? m.qty - (m.returnedQty || 0) : 0;
  const sign = m.type === 'SORTIE' ? '−' : m.type === 'TRANSFERT' ? '' : m.delta < 0 ? '−' : '+';
  return (
    <div className="px-4 py-3 border-b border-gray-50 last:border-0 flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="w-36 shrink-0 text-xs text-gray-500">{fmtDateTime(m.at)}<div className="text-[10px] text-gray-400">{m.number}</div></div>
      <MoveBadge t={m.type} />
      <div className="flex-1 min-w-[200px] text-sm">
        <b>{m.itemCode}</b> · {m.itemName}
        <div className="text-[11px] text-gray-500">
          {m.type === 'TRANSFERT' ? `${m.locationName} → ${m.toLocationName}` : m.locationName}
          {m.workOrderId && <> · <button onClick={() => g.openWorkOrder(m.workOrderId!)} className="text-primary font-bold">{m.workOrderNumber}</button></>}
          {!m.workOrderId && m.assetCode && <> · {m.assetCode}</>}
          {m.reference && <> · {m.reference}</>}
          {m.reason && <> · {m.reason}</>}
          {' · '}{m.byName}
        </div>
      </div>
      <div className="text-sm font-black text-dark text-right w-28">{sign}{qtyTxt(m.type === 'AJUSTEMENT' ? Math.abs(m.delta) : m.qty, m.unit)}{m.returnedQty ? <div className="text-[10px] font-bold text-teal-700">dont {fmtNum(m.returnedQty, 3)} rendu(s)</div> : null}</div>
      {showValue && <div className="text-xs text-gray-500 text-right w-28">{fmtXpf(m.value)}</div>}
      {onReturn && left > 0 && (g.isResp || m.byId === g.me.id) && <Button small variant="secondary" icon={<Undo2 size={14} />} onClick={() => onReturn(m)}>Retour</Button>}
    </div>
  );
};

// ─── Articles ────────────────────────────────────────────────────────────────

const ItemFormModal: React.FC<{ edit?: StockItem; onClose: (id?: string) => void }> = ({ edit, onClose }) => {
  const { g, items } = useStockHelpers();
  const [f, setF] = useState({
    code: edit?.code || '', name: edit?.name || '', family: edit?.family || '', unit: edit?.unit || 'pièce',
    supplierRefs: (edit?.supplierRefs || []).join(', '), minQty: edit?.minQty != null ? String(edit.minQty) : '', notes: edit?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const families = Array.from(new Set(items.map(i => i.family).filter(Boolean))) as string[];
  const submit = async () => {
    setSaving(true);
    const res = await g.run('STOCK_ITEM_SAVE', { id: edit?.id, ...f }, edit ? 'Article modifié.' : 'Article créé.');
    setSaving(false);
    if (res) onClose(res.id);
  };
  return (
    <Modal title={edit ? `Modifier ${edit.code}` : 'Nouvel article'} onClose={() => onClose()} footer={<>
      <Button variant="ghost" onClick={() => onClose()}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!f.code.trim() || !f.name.trim()}>{edit ? 'Enregistrer' : 'Créer'}</Button>
    </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Référence interne" required><Input value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="FLT-HUI-CAT" /></Field>
        <Field label="Unité">
          <Input list="stock-units" value={f.unit} onChange={e => set('unit', e.target.value)} />
          <datalist id="stock-units">{STOCK_UNITS.map(u => <option key={u} value={u} />)}</datalist>
        </Field>
      </div>
      <Field label="Désignation" required><Input value={f.name} onChange={e => set('name', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Famille">
          <Input list="stock-families" value={f.family} onChange={e => set('family', e.target.value)} placeholder="Filtration, Hydraulique…" />
          <datalist id="stock-families">{families.map(x => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="Seuil de réapprovisionnement" hint="Alerte quand le stock descend à ce niveau."><Input type="number" inputMode="decimal" min={0} step="any" value={f.minQty} onChange={e => set('minQty', e.target.value)} /></Field>
      </div>
      <Field label="Références fournisseurs" hint="Séparées par des virgules : un même article peut avoir plusieurs références selon le fournisseur."><Input value={f.supplierRefs} onChange={e => set('supplierRefs', e.target.value)} /></Field>
      <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  );
};

const ItemDetailModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { g, itemById, label } = useStockHelpers();
  const item = itemById(id);
  const [sub, setSub] = useState<{ t: 'move'; mode: MoveMode; loc?: string } | { t: 'edit' } | { t: 'return'; m: StockMove } | null>(null);
  if (!item) return null;
  const moves = g.stock.moves.filter(m => m.itemId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const levels = Object.entries(item.levels || {}).filter(([, q]) => q !== 0).sort((a, b) => label(a[0]).localeCompare(label(b[0]), 'fr', { numeric: true }));
  const archive = async () => {
    if (item.isArchived) { await g.run('STOCK_ITEM_ARCHIVE', { id, restore: true }, 'Article réactivé.'); return; }
    if (await g.confirm({ title: 'Archiver cet article ?', message: 'Il n’apparaîtra plus dans les listes. L’historique des mouvements est conservé.', confirmLabel: 'Archiver' })) {
      const r = await g.run('STOCK_ITEM_ARCHIVE', { id }, 'Article archivé.');
      if (r) onClose();
    }
  };
  const footer = g.isResp ? (
    <>
      <Button variant="ghost" small icon={<Archive size={14} />} onClick={archive}>{item.isArchived ? 'Réactiver' : 'Archiver'}</Button>
      <Button variant="secondary" small icon={<Pencil size={14} />} onClick={() => setSub({ t: 'edit' })}>Modifier</Button>
      <Button small icon={<ArrowDownToLine size={14} />} onClick={() => setSub({ t: 'move', mode: 'IN' })}>Entrée</Button>
    </>
  ) : undefined;
  return (
    <>
      <Modal wide title={`${item.code} · ${item.name}`} subtitle={[item.family, item.unit].filter(Boolean).join(' · ')} onClose={onClose} footer={footer}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="En stock" value={fmtNum(item.qty, 3)} sub={item.unit} tone={low(item) ? 'warning' : 'default'} />
          <Kpi label="Seuil" value={item.minQty != null ? fmtNum(item.minQty, 3) : '—'} sub={low(item) ? 'À réapprovisionner' : undefined} tone={low(item) ? 'warning' : 'default'} />
          {g.isResp && <Kpi label="Prix moyen" value={fmtNum(item.avgCost, 0)} sub="XPF (PMP)" />}
          {g.isResp && <Kpi label="Valeur" value={fmtNum(Math.round(item.qty * item.avgCost), 0)} sub="XPF" />}
        </div>
        {!!item.supplierRefs?.length && <div className="text-sm"><Label className="mb-1">Références fournisseurs</Label>{item.supplierRefs.join(' · ')}</div>}
        {item.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.notes}</p>}
        <div>
          <Label className="mb-2">Emplacements</Label>
          <Card>
            {levels.length === 0 ? <Empty>Aucune quantité en stock.</Empty> : levels.map(([loc, q]) => (
              <div key={loc} className="px-4 py-3 border-b border-gray-50 last:border-0 flex flex-wrap items-center gap-2">
                <MapPin size={14} className="text-gray-400" />
                <button onClick={() => g.openStockLocation(loc)} className="text-sm font-bold text-dark hover:text-primary flex-1 text-left">{label(loc)}</button>
                <span className="text-sm font-black">{qtyTxt(q, item.unit)}</span>
                {g.stock.canTake && <Button small variant="secondary" icon={<ArrowUpFromLine size={14} />} onClick={() => setSub({ t: 'move', mode: 'OUT', loc })}>Sortir</Button>}
                {g.isResp && <Button small variant="ghost" icon={<ArrowLeftRight size={14} />} onClick={() => setSub({ t: 'move', mode: 'TRANSFER', loc })}>Transférer</Button>}
                {g.isResp && <Button small variant="ghost" icon={<ClipboardPen size={14} />} onClick={() => setSub({ t: 'move', mode: 'ADJUST', loc })}>Ajuster</Button>}
              </div>
            ))}
          </Card>
        </div>
        <div>
          <Label className="mb-2">Derniers mouvements</Label>
          <Card>{moves.length === 0 ? <Empty>Aucun mouvement.</Empty> : moves.slice(0, 30).map(m => <MoveRow key={m.id} m={m} showValue={g.isResp} onReturn={g.stock.canTake ? (x => setSub({ t: 'return', m: x })) : undefined} />)}</Card>
        </div>
      </Modal>
      {sub?.t === 'move' && <MoveModal mode={sub.mode} itemId={id} locationId={sub.loc} onClose={() => setSub(null)} />}
      {sub?.t === 'edit' && <ItemFormModal edit={item} onClose={() => setSub(null)} />}
      {sub?.t === 'return' && <ReturnModal move={sub.m} onClose={() => setSub(null)} />}
    </>
  );
};

// ─── Emplacements ────────────────────────────────────────────────────────────

const LocationFormModal: React.FC<{ kind: 'MAGASIN' | 'CASIER'; parentId?: string; edit?: StockLocation; onClose: () => void }> = ({ kind, parentId, edit, onClose }) => {
  const g = useGmao();
  const [name, setName] = useState(edit?.name || '');
  const [siteId, setSiteId] = useState(edit?.siteId || '');
  const [bulk, setBulk] = useState('');
  const [saving, setSaving] = useState(false);
  const parent = g.stock.locations.find(l => l.id === parentId);
  const submit = async () => {
    setSaving(true);
    const names = !edit && kind === 'CASIER' && bulk.trim() ? bulk.split(/[\n,;]/).map(s => s.trim()).filter(Boolean) : [name];
    let ok = true;
    for (const n of names) {
      const r = await g.run('STOCK_LOCATION_SAVE', { id: edit?.id, kind, name: n, parentId, siteId: siteId || null });
      if (!r) { ok = false; break; }
    }
    setSaving(false);
    if (ok) { g.toast(names.length > 1 ? `${names.length} casiers créés.` : 'Emplacement enregistré.', 'success'); onClose(); }
  };
  return (
    <Modal title={edit ? `Modifier ${edit.name}` : kind === 'MAGASIN' ? 'Nouveau magasin' : `Nouveau casier${parent ? ` · ${parent.name}` : ''}`} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button onClick={submit} loading={saving} disabled={!name.trim() && !bulk.trim()}>Enregistrer</Button>
    </>}>
      <Field label={kind === 'MAGASIN' ? 'Nom du magasin' : 'Nom du casier'} required hint={kind === 'MAGASIN' ? 'Ex. : Conteneur Ducos, Conteneur Gadji, Dock.' : 'Ex. : A3, Étagère 2 niveau 1.'}>
        <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
      </Field>
      {kind === 'MAGASIN' && (
        <Field label="Site">
          <Select value={siteId} onChange={e => setSiteId(e.target.value)}><option value="">—</option>{g.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Field>
      )}
      {kind === 'CASIER' && !edit && (
        <Field label="Ou plusieurs casiers d’un coup" hint="Un nom par ligne ou séparés par des virgules (ex. : A1, A2, A3, B1, B2).">
          <Textarea rows={3} value={bulk} onChange={e => setBulk(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
};

const stockQrUrl = (origin: string, l: StockLocation, demo: boolean) => `${origin}${qrPath(l.qrToken)}${demo ? '?demo' : ''}`;

const BinLabel: React.FC<{ l: StockLocation; url: string; org: string; parent?: string; small?: boolean }> = ({ l, url, org, parent, small }) => (
  <div className={`border-2 border-dashed border-dark rounded-2xl text-center bg-white flex flex-col items-center justify-center ${small ? 'p-2' : 'p-4'}`}>
    <div className={`${small ? 'text-[8px]' : 'text-[10px]'} font-black uppercase tracking-widest text-gray-500`}>{org} · Stock</div>
    <QRCode value={url} size={small ? 100 : 170} className="my-1.5" />
    {parent && <div className={`${small ? 'text-[9px]' : 'text-xs'} font-semibold text-gray-500 leading-none`}>{parent}</div>}
    <div className={`${small ? 'text-base' : 'text-2xl'} font-black tracking-tight leading-tight`}>{l.kind === 'CASIER' ? `Casier ${l.name}` : l.name}</div>
    <div className={`${small ? 'text-[8px]' : 'text-[10px]'} text-gray-500 mt-0.5`}>Réservé au personnel · appli Miki</div>
  </div>
);

const LocationQrModal: React.FC<{ locations: StockLocation[]; onClose: () => void }> = ({ locations, onClose }) => {
  const g = useGmao();
  const origin = g.backend.publicOrigin();
  const parentName = (l: StockLocation) => g.stock.locations.find(x => x.id === l.parentId)?.name;
  const single = locations.length === 1 ? locations[0] : null;
  return (
    <Modal wide={!single} title={single ? 'Étiquette du casier' : `Étiquettes de stock (${locations.length})`} subtitle="À coller sur le casier : un scan depuis l’appli Miki affiche son contenu et permet de sortir une pièce." onClose={onClose} footer={<>
      {single && <Button variant="ghost" icon={<Copy size={16} />} onClick={() => { navigator.clipboard?.writeText(stockQrUrl(origin, single, g.backend.mode === 'demo')); g.toast('Lien copié.', 'success'); }}>Copier le lien</Button>}
      <Button icon={<Printer size={16} />} onClick={() => window.print()}>Imprimer</Button>
    </>}>
      <div id="stock-qr-sheet" className={single ? 'mx-auto w-[260px]' : 'grid grid-cols-3 gap-2'}>
        {locations.map(l => <BinLabel key={l.id} l={l} url={stockQrUrl(origin, l, g.backend.mode === 'demo')} org={g.tenantName} parent={parentName(l)} small={!single} />)}
      </div>
      <style>{`@media print {
        @page { size: A4; margin: 8mm; }
        body * { visibility: hidden; }
        #stock-qr-sheet, #stock-qr-sheet * { visibility: visible; }
        #stock-qr-sheet { position: absolute; left: 0; top: 0; ${single ? 'width: 70mm;' : 'width: 194mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm;'} }
        #stock-qr-sheet > div { height: ${single ? 'auto' : '38mm'}; break-inside: avoid; }
      }`}</style>
    </Modal>
  );
};

/** Fiche d'un casier (ouverte depuis le scanner ou la liste) : contenu théorique et sorties rapides. */
export const LocationDetailModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { g, label, active } = useStockHelpers();
  const loc = g.stock.locations.find(l => l.id === id);
  const [sub, setSub] = useState<{ t: 'move'; mode: MoveMode; item?: string } | { t: 'qr' } | { t: 'edit' } | { t: 'bin' } | null>(null);
  if (!loc) return null;
  const children = active.filter(l => l.parentId === loc.id);
  const ids = new Set([loc.id, ...children.map(c => c.id)]);
  const lines = g.stock.items.filter(i => !i.isArchived).flatMap(i => Object.entries(i.levels || {}).filter(([l, q]) => ids.has(l) && q !== 0).map(([l, q]) => ({ item: i, loc: l, qty: q })))
    .sort((a, b) => label(a.loc).localeCompare(label(b.loc), 'fr', { numeric: true }) || a.item.code.localeCompare(b.item.code));
  const value = lines.reduce((s, x) => s + x.qty * x.item.avgCost, 0);
  const archive = async () => {
    if (await g.confirm({ title: `Archiver ${loc.name} ?`, message: 'Possible seulement s’il est vide.', confirmLabel: 'Archiver' })) {
      const r = await g.run('STOCK_LOCATION_ARCHIVE', { id: loc.id }, 'Emplacement archivé.');
      if (r) onClose();
    }
  };
  return (
    <>
      <Modal wide title={label(loc.id)} subtitle={`${loc.kind === 'CASIER' ? 'Casier' : 'Magasin'} · ${lines.length} ligne(s)${g.isResp ? ` · ${fmtXpf(value)}` : ''}`} onClose={onClose} footer={<>
        {g.isResp && <Button variant="ghost" small icon={<Trash2 size={14} />} onClick={archive}>Archiver</Button>}
        {g.isResp && <Button variant="secondary" small icon={<Pencil size={14} />} onClick={() => setSub({ t: 'edit' })}>Renommer</Button>}
        {g.isResp && loc.kind === 'MAGASIN' && <Button variant="secondary" small icon={<Plus size={14} />} onClick={() => setSub({ t: 'bin' })}>Casier</Button>}
        <Button variant="secondary" small icon={<QrCode size={14} />} onClick={() => setSub({ t: 'qr' })}>QR code</Button>
        {g.isResp && <Button small icon={<ArrowDownToLine size={14} />} onClick={() => setSub({ t: 'move', mode: 'IN' })}>Entrée</Button>}
      </>}>
        {lines.length === 0 ? <Empty>Rien n’est enregistré à cet emplacement.</Empty> : (
          <Card>
            {lines.map(x => (
              <div key={`${x.item.id}-${x.loc}`} className="px-4 py-3 border-b border-gray-50 last:border-0 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[180px] text-sm">
                  <b>{x.item.code}</b> · {x.item.name}
                  {x.loc !== loc.id && <div className="text-[11px] text-gray-500">{label(x.loc)}</div>}
                </div>
                <span className={`text-sm font-black ${low(x.item) ? 'text-orange-500' : 'text-dark'}`}>{qtyTxt(x.qty, x.item.unit)}</span>
                {g.stock.canTake && <Button small variant="secondary" icon={<ArrowUpFromLine size={14} />} onClick={() => setSub({ t: 'move', mode: 'OUT', item: x.item.id })}>Sortir</Button>}
                {g.isResp && <Button small variant="ghost" icon={<ClipboardPen size={14} />} onClick={() => setSub({ t: 'move', mode: 'ADJUST', item: x.item.id })}>Compter</Button>}
              </div>
            ))}
          </Card>
        )}
      </Modal>
      {sub?.t === 'move' && <MoveModal mode={sub.mode} itemId={sub.item} locationId={sub.item ? lines.find(x => x.item.id === sub.item)?.loc : (loc.kind === 'CASIER' || !children.length ? loc.id : undefined)} onClose={() => setSub(null)} />}
      {sub?.t === 'qr' && <LocationQrModal locations={[loc]} onClose={() => setSub(null)} />}
      {sub?.t === 'edit' && <LocationFormModal kind={loc.kind} parentId={loc.parentId || undefined} edit={loc} onClose={() => setSub(null)} />}
      {sub?.t === 'bin' && <LocationFormModal kind="CASIER" parentId={loc.id} onClose={() => setSub(null)} />}
    </>
  );
};

// ─── Pièces sur une intervention ─────────────────────────────────────────────

export interface PartDraft { itemId: string; locationId: string; qty: string }

/** Saisie des pièces utilisées à la clôture d'une intervention. */
export const PartsPicker: React.FC<{ value: PartDraft[]; onChange: (v: PartDraft[]) => void }> = ({ value, onChange }) => {
  const { g, itemById } = useStockHelpers();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<PartDraft>({ itemId: '', locationId: '', qty: '1' });
  if (!g.stock.canTake) return null;
  const item = itemById(draft.itemId);
  const add = () => { onChange([...value, draft]); setDraft({ itemId: '', locationId: '', qty: '1' }); setAdding(false); };
  return (
    <div>
      <Label className="mb-2">Pièces utilisées (sorties du stock)</Label>
      {value.length > 0 && (
        <Card className="mb-2">
          {value.map((p, i) => {
            const it = itemById(p.itemId);
            return (
              <div key={i} className="px-4 py-2.5 border-b border-gray-50 last:border-0 flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate"><b>{it?.code}</b> · {it?.name}</span>
                <span className="font-black">{p.qty} {it?.unit}</span>
                <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-gray-400 hover:text-danger" aria-label="Retirer"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </Card>
      )}
      {adding ? (
        <div className="rounded-2xl border border-border p-3 space-y-3">
          <ItemPicker value={draft.itemId} onChange={v => { const it = itemById(v); const locs = Object.entries(it?.levels || {}).filter(([, q]) => q > 0); setDraft({ ...draft, itemId: v, locationId: locs.length === 1 ? locs[0][0] : '' }); }} onlyInStock autoFocus />
          {item && (
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <SlotSelect item={item} value={draft.locationId} onChange={v => setDraft({ ...draft, locationId: v })} withStockOnly />
              <Input type="number" inputMode="decimal" min={0} step="any" value={draft.qty} onChange={e => setDraft({ ...draft, qty: e.target.value })} aria-label="Quantité" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button small variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
            <Button small onClick={add} disabled={!draft.itemId || !draft.locationId || !(Number(draft.qty) > 0)}>Ajouter</Button>
          </div>
        </div>
      ) : (
        <Button small variant="secondary" icon={<Package size={14} />} onClick={() => setAdding(true)}>Ajouter une pièce</Button>
      )}
    </div>
  );
};

export const partsPayload = (parts: PartDraft[]) => (parts.length ? parts.map(p => ({ itemId: p.itemId, locationId: p.locationId, qty: p.qty })) : undefined);

/** Pièces liées à une intervention (fiche intervention). */
export const WorkOrderParts: React.FC<{ woId: string; open: boolean }> = ({ woId, open }) => {
  const g = useGmao();
  const [sub, setSub] = useState<{ t: 'out' } | { t: 'return'; m: StockMove } | null>(null);
  if (!g.stock.enabled || g.isClient) return null;
  const moves = g.stock.moves.filter(m => m.workOrderId === woId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!moves.length && !g.stock.canTake) return null;
  const cost = moves.reduce((s, m) => s + (m.type === 'SORTIE' ? m.value : m.type === 'RETOUR' ? -m.value : 0), 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>Pièces{g.isResp && moves.length ? ` · ${fmtXpf(cost)}` : ''}</Label>
        {g.stock.canTake && (open || g.isResp) && <Button small variant="secondary" icon={<ArrowUpFromLine size={14} />} onClick={() => setSub({ t: 'out' })}>Sortir une pièce</Button>}
      </div>
      {moves.length > 0 ? <Card>{moves.filter(m => m.type !== 'ENTREE').map(m => <MoveRow key={m.id} m={m} showValue={g.isResp} onReturn={g.stock.canTake ? (x => setSub({ t: 'return', m: x })) : undefined} />)}</Card>
        : <p className="text-sm text-gray-400">Aucune pièce sortie du stock pour cette intervention.</p>}
      {sub?.t === 'out' && <MoveModal mode="OUT" workOrderId={woId} onClose={() => setSub(null)} />}
      {sub?.t === 'return' && <ReturnModal move={sub.m} onClose={() => setSub(null)} />}
    </div>
  );
};

// ─── Import (référentiel + stock d'ouverture) ────────────────────────────────

const IMPORT_COLUMNS: [string, string, string[]][] = [
  ['code', 'Référence', ['reference', 'ref', 'code', 'referenceinterne']],
  ['name', 'Désignation', ['designation', 'libelle', 'nom', 'article']],
  ['family', 'Famille', ['famille', 'categorie', 'type']],
  ['unit', 'Unité', ['unite', 'u']],
  ['supplierRefs', 'Réf. fournisseurs', ['reffournisseurs', 'referencesfournisseurs', 'reffournisseur', 'referencefournisseur']],
  ['minQty', 'Seuil', ['seuil', 'stockmini', 'mini', 'stockminimum']],
  ['store', 'Magasin', ['magasin', 'lieu', 'conteneur', 'site']],
  ['bin', 'Casier', ['casier', 'emplacement', 'etagere']],
  ['qty', 'Quantité', ['quantite', 'qte', 'stock']],
  ['unitCost', 'Prix unitaire', ['prixunitaire', 'pu', 'prix', 'cout', 'coutunitaire', 'valeurunitaire']],
];
const normH = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function parseStockCsv(text: string): any[] {
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
  const keys = split(lines[0]).map(h => IMPORT_COLUMNS.find(([k, label, alias]) => normH(label) === normH(h) || normH(k) === normH(h) || alias.includes(normH(h)))?.[0]);
  return lines.slice(1).map(l => {
    const cells = split(l);
    const row: any = {};
    keys.forEach((k, i) => { if (k && cells[i] !== undefined && cells[i] !== '') row[k] = cells[i]; });
    return row;
  }).filter(r => Object.keys(r).length);
}

const ImportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const g = useGmao();
  const [rows, setRows] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const template = () => downloadCsv('modele-import-stock.csv', IMPORT_COLUMNS.map(c => c[1]), [
    ['FLT-HUI-CAT', 'Filtre à huile moteur Caterpillar', 'Filtration', 'pièce', '1R-0739, LF16015', '3', 'Conteneur Gadji', 'G1', '5', '4800'],
    ['HUI-15W40', 'Huile moteur 15W40', 'Lubrifiants', 'litre', '', '100', 'Dock Ducos', '', '416', '690'],
  ]);
  const submit = async () => {
    setBusy(true);
    const res = await g.run('STOCK_IMPORT', { rows });
    setBusy(false);
    if (!res) return;
    if (res.errors?.length) { setErrors(res.errors); return; }
    g.toast(`${res.created} article(s) créé(s), ${res.locations} emplacement(s), ${res.moves} ligne(s) de stock d’ouverture.`, 'success');
    onClose();
  };
  const total = rows.reduce((s, r) => s + (Number(String(r.qty || 0).replace(/\s/g, '').replace(',', '.')) || 0) * (Number(String(r.unitCost || 0).replace(/\s/g, '').replace(',', '.')) || 0), 0);
  return (
    <Modal wide title="Importer le stock" subtitle="Référentiel des articles et stock d’ouverture, depuis l’Excel existant enregistré en CSV." onClose={onClose} footer={<>
      <Button variant="ghost" icon={<Download size={16} />} onClick={template}>Modèle CSV</Button>
      <Button onClick={submit} loading={busy} disabled={!rows.length}>Importer {rows.length || ''} ligne(s)</Button>
    </>}>
      <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
        <li>Une ligne par article et par emplacement (le même article peut apparaître dans plusieurs casiers).</li>
        <li>Magasins et casiers absents sont créés. Un article déjà connu (même référence) n’est pas modifié : seule sa quantité est ajoutée.</li>
        <li>Chaque quantité devient une entrée « stock d’ouverture », valorisée au prix unitaire indiqué.</li>
        <li>Une seule erreur bloque tout l’import : rien n’est enregistré à moitié.</li>
      </ul>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { setErrors([]); setRows(parseStockCsv(await f.text())); } }} />
      <Button variant="secondary" icon={<FileUp size={16} />} onClick={() => fileRef.current?.click()}>Choisir le fichier CSV</Button>
      {rows.length > 0 && <p className="text-sm"><b>{rows.length}</b> ligne(s) lue(s){total ? ` · valeur ${fmtXpf(total)}` : ''}.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 text-left">{IMPORT_COLUMNS.map(c => <th key={c[0]} className="px-2 py-1.5 font-black text-gray-500">{c[1]}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i} className="border-t border-gray-50">{IMPORT_COLUMNS.map(c => <td key={c[0]} className="px-2 py-1.5">{r[c[0]] ?? ''}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {errors.length > 0 && <div className="rounded-2xl bg-danger/5 text-danger text-sm p-3 space-y-0.5">{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
    </Modal>
  );
};

// ─── États pour la comptabilité ──────────────────────────────────────────────

const AccountingPanel: React.FC = () => {
  const { g, items } = useStockHelpers();
  const offset = g.settings.utcOffsetMinutes;
  const today = new Date(Date.now() + offset * 60000).toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const moves = g.stock.moves;
  const endOfDay = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + 1) - offset * 60000).toISOString(); };
  const [y, mo] = month.split('-').map(Number);
  const bounds = monthBounds(y, mo, offset);
  const recap = useMemo(() => periodRecap(moves, items, bounds.start, bounds.end), [moves, items, month]);
  const tot = recap.reduce((s, l) => ({
    open: s.open + l.openValue, in: s.in + l.inValue, out: s.out + l.outValue, ret: s.ret + l.returnValue, adj: s.adj + l.adjustValue, close: s.close + l.closeValue, gap: s.gap + l.valuationGap,
  }), { open: 0, in: 0, out: 0, ret: 0, adj: 0, close: 0, gap: 0 });
  const itemOf = (id: string) => items.find(i => i.id === id);
  const locParts = (id: string) => {
    const l = g.stock.locations.find(x => x.id === id);
    if (!l) return ['', ''];
    if (l.kind === 'CASIER') return [g.stock.locations.find(x => x.id === l.parentId)?.name || '', l.name];
    return [l.name, ''];
  };

  const exportSnapshot = () => {
    const snap = stockSnapshot(moves, endOfDay(date));
    const rows: any[][] = [];
    let total = 0;
    for (const s of [...snap.values()].sort((a, b) => (itemOf(a.itemId)?.code || '').localeCompare(itemOf(b.itemId)?.code || ''))) {
      const it = itemOf(s.itemId);
      for (const [loc, q] of Object.entries(s.byLocation)) {
        const v = Math.round(q * s.avgCost);
        total += v;
        rows.push([it?.code, it?.name, it?.family || '', it?.unit, ...locParts(loc), csvNum(q), csvNum(s.avgCost), v]);
      }
    }
    rows.push(['TOTAL', '', '', '', '', '', '', '', total]);
    downloadCsv(`stock-valorise-${date}.csv`, ['Référence', 'Désignation', 'Famille', 'Unité', 'Magasin', 'Casier', 'Quantité', 'PMP (XPF)', 'Valeur (XPF)'], rows);
  };
  const exportRecap = () => {
    const rows = recap.map(l => [l.code, l.name, l.family, l.unit, csvNum(l.openQty), l.openValue, csvNum(l.inQty), l.inValue, csvNum(l.outQty), l.outValue, csvNum(l.returnQty), l.returnValue, csvNum(l.adjustQty), l.adjustValue, csvNum(l.closeQty), l.closeValue, l.valuationGap]);
    rows.push(['TOTAL', '', '', '', '', tot.open, '', tot.in, '', tot.out, '', tot.ret, '', tot.adj, '', tot.close, tot.gap]);
    downloadCsv(`stock-recapitulatif-${month}.csv`, ['Référence', 'Désignation', 'Famille', 'Unité', 'Qté début', 'Valeur début', 'Qté entrées', 'Valeur entrées', 'Qté sorties', 'Valeur sorties', 'Qté retours', 'Valeur retours', 'Ajustements qté', 'Ajustements valeur', 'Qté fin', 'Valeur fin', 'Écart de valorisation'], rows);
  };
  const exportJournal = () => {
    const list = moves.filter(m => m.at >= bounds.start && m.at < bounds.end).sort((a, b) => a.at.localeCompare(b.at) || a.number.localeCompare(b.number));
    downloadCsv(`stock-mouvements-${month}.csv`, ['Date', 'N°', 'Type', 'Référence', 'Désignation', 'Quantité', 'Unité', 'Emplacement', 'Destination', 'Prix unitaire', 'Valeur (XPF)', 'Intervention', 'Machine', 'Pièce justificative', 'Motif', 'Saisi par', 'Saisi le'],
      list.map(m => [fmtDateTime(m.at), m.number, STOCK_MOVE_LABEL[m.type], m.itemCode, m.itemName, csvNum(m.type === 'AJUSTEMENT' ? m.delta : m.type === 'SORTIE' ? -m.qty : m.qty), m.unit, m.locationName, m.toLocationName || '', csvNum(m.unitCost), m.type === 'SORTIE' ? -m.value : m.value, m.workOrderNumber || '', m.assetCode || '', m.reference || '', m.reason || '', m.byName, fmtDateTime(m.createdAt)]));
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 space-y-3">
        <Label>Stock valorisé à date</Label>
        <p className="text-sm text-gray-600">Quantités par emplacement et valeur au prix moyen pondéré, à la fin de la journée choisie.</p>
        <div className="flex gap-2 items-end">
          <Field label="Date" className="flex-1"><Input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} /></Field>
          <Button icon={<Download size={16} />} onClick={exportSnapshot}>CSV</Button>
        </div>
      </Card>
      <Card className="p-5 space-y-3">
        <Label>Récapitulatif mensuel des entrées et sorties</Label>
        <div className="flex gap-2 items-end">
          <Field label="Mois" className="flex-1"><Input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)} /></Field>
          <Button icon={<Download size={16} />} onClick={exportRecap}>Récapitulatif</Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={exportJournal}>Journal</Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div><Label>Stock début</Label><b>{fmtXpf(tot.open)}</b></div>
          <div><Label>+ Entrées</Label><b>{fmtXpf(tot.in)}</b></div>
          <div><Label>− Sorties</Label><b>{fmtXpf(tot.out)}</b></div>
          <div><Label>+ Retours</Label><b>{fmtXpf(tot.ret)}</b></div>
          <div><Label>± Ajustements</Label><b>{fmtXpf(tot.adj)}</b></div>
          <div><Label>= Stock fin</Label><b>{fmtXpf(tot.close)}</b></div>
        </div>
        {tot.gap !== 0 && <p className="text-[11px] text-gray-400">Écart d’arrondi du prix moyen pondéré : {fmtXpf(tot.gap)}.</p>}
      </Card>
      <ImportCard />
      <Card className="p-5 space-y-2 text-sm text-gray-600">
        <Label>Méthode</Label>
        <p>Valorisation au <b>prix moyen pondéré</b> : recalculé à chaque entrée (prix de la facture) ; les sorties partent au prix moyen du moment ; un retour revient au prix de sa sortie.</p>
        <p>Les mouvements ne se modifient pas : une erreur se corrige par un retour, un transfert ou un ajustement motivé, tous tracés.</p>
        <p className="text-[11px] text-gray-400">{moves.length} mouvement(s) enregistré(s) depuis la mise en service.</p>
      </Card>
    </div>
  );
};

const ImportCard: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-5 space-y-3">
      <Label>Reprise de l’existant</Label>
      <p className="text-sm text-gray-600">Importer le référentiel des pièces et les quantités en stock (stock d’ouverture) depuis le fichier Excel actuel.</p>
      <Button variant="secondary" icon={<FileUp size={16} />} onClick={() => setOpen(true)}>Importer un fichier</Button>
      {open && <ImportModal onClose={() => setOpen(false)} />}
    </Card>
  );
};

// ─── Vue principale ──────────────────────────────────────────────────────────

type Tab = 'articles' | 'emplacements' | 'mouvements' | 'compta';

export const StockView: React.FC = () => {
  const { g, items, active, label } = useStockHelpers();
  const [tab, setTab] = useState<Tab>('articles');
  const [q, setQ] = useState('');
  const [family, setFamily] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [moveFilter, setMoveFilter] = useState<'ALL' | StockMoveType>('ALL');
  const [modal, setModal] = useState<{ t: 'item'; id: string } | { t: 'newItem' } | { t: 'move'; mode: MoveMode } | { t: 'loc'; kind: 'MAGASIN' | 'CASIER'; parentId?: string } | { t: 'qr'; ids: string[] } | { t: 'return'; m: StockMove } | null>(null);

  const visible = items.filter(i => showArchived ? i.isArchived : !i.isArchived);
  const families = Array.from(new Set(visible.map(i => i.family).filter(Boolean))) as string[];
  const filtered = visible.filter(i => (!family || i.family === family) && (!onlyLow || low(i)) && (!q.trim() || `${i.code} ${i.name} ${(i.supplierRefs || []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => a.code.localeCompare(b.code));
  const value = items.filter(i => !i.isArchived).reduce((s, i) => s + i.qty * i.avgCost, 0);
  const lowCount = items.filter(i => !i.isArchived && low(i)).length;
  const monthStart = new Date(Date.now() - 30 * 86400000).toISOString();
  const recentMoves = g.stock.moves.filter(m => m.createdAt >= monthStart);
  const shownMoves = g.stock.moves.filter(m => (moveFilter === 'ALL' || m.type === moveFilter) && (g.isResp || m.byId === g.me.id || !!m.workOrderId))
    .filter(m => !q.trim() || `${m.itemCode} ${m.itemName} ${m.workOrderNumber || ''} ${m.assetCode || ''} ${m.reference || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  const magasins = active.filter(l => l.kind === 'MAGASIN').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const lineCount = (locId: string) => items.filter(i => (i.levels?.[locId] || 0) > 0).length;
  const locValue = (locId: string) => items.reduce((s, i) => s + (i.levels?.[locId] || 0) * i.avgCost, 0);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'articles', label: 'Articles' }, { value: 'emplacements', label: 'Emplacements' }, { value: 'mouvements', label: 'Mouvements' },
    ...(g.isResp ? [{ value: 'compta' as Tab, label: 'Comptabilité' }] : []),
  ];

  return (
    <div>
      <PageHeader title="Stock" subtitle={`${items.filter(i => !i.isArchived).length} article(s) · ${magasins.length} magasin(s)`} actions={<>
        {g.stock.canTake && <Button variant="secondary" icon={<ArrowUpFromLine size={16} />} onClick={() => setModal({ t: 'move', mode: 'OUT' })}>Sortie</Button>}
        {g.isResp && <Button variant="secondary" icon={<ArrowDownToLine size={16} />} onClick={() => setModal({ t: 'move', mode: 'IN' })}>Entrée</Button>}
        {g.isResp && <Button icon={<Plus size={16} />} onClick={() => setModal({ t: 'newItem' })}>Nouvel article</Button>}
      </>} />

      <div className={`grid grid-cols-2 ${g.isResp ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 mb-5`}>
        {g.isResp && <Kpi label="Valeur du stock" value={fmtNum(Math.round(value), 0)} sub="XPF, au prix moyen pondéré" />}
        <Kpi label="À réapprovisionner" value={lowCount} sub="au seuil ou en dessous" tone={lowCount ? 'warning' : 'success'} onClick={() => { setTab('articles'); setOnlyLow(true); }} />
        <Kpi label="Mouvements (30 j)" value={recentMoves.length} sub={`${recentMoves.filter(m => m.type === 'SORTIE').length} sortie(s)`} onClick={() => setTab('mouvements')} />
        <Kpi label="Emplacements" value={active.length} sub={`${active.filter(l => l.kind === 'CASIER').length} casier(s)`} onClick={() => setTab('emplacements')} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Segmented value={tab} onChange={setTab} options={tabs} />
        {(tab === 'articles' || tab === 'mouvements') && (
          <div className="flex items-center gap-2 bg-white border border-border rounded-2xl px-3 flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={tab === 'articles' ? 'Référence, désignation, réf. fournisseur…' : 'Article, intervention, machine…'} className="flex-1 py-2 text-sm focus:outline-none bg-transparent" />
          </div>
        )}
      </div>

      {tab === 'articles' && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <Select value={family} onChange={e => setFamily(e.target.value)} className="!py-1.5 !text-xs"><option value="">Toutes les familles</option>{families.map(f => <option key={f} value={f}>{f}</option>)}</Select>
            <button onClick={() => setOnlyLow(!onlyLow)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${onlyLow ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-border'}`}>À réapprovisionner</button>
            {g.isResp && <button onClick={() => setShowArchived(!showArchived)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${showArchived ? 'bg-dark text-white border-dark' : 'bg-white text-gray-600 border-border'}`}>Archivés</button>}
          </div>
          <Card>
            {filtered.length === 0 ? <Empty>{items.length ? 'Aucun article ne correspond.' : 'Aucun article : créez-les ou importez le fichier existant (onglet Comptabilité).'}</Empty> : filtered.map(i => (
              <button key={i.id} onClick={() => setModal({ t: 'item', id: i.id })} className="w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm"><b>{i.code}</b> · {i.name}</div>
                  <div className="text-[11px] text-gray-500">{[i.family, Object.keys(i.levels || {}).filter(k => (i.levels[k] || 0) > 0).map(k => label(k)).join(', ')].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                {low(i) && <Badge className="bg-orange-50 text-orange-600">Seuil {fmtNum(i.minQty, 3)}</Badge>}
                <div className={`text-sm font-black w-28 text-right ${low(i) ? 'text-orange-500' : 'text-dark'}`}>{qtyTxt(i.qty, i.unit)}</div>
                {g.isResp && <div className="text-xs text-gray-500 w-28 text-right">{fmtXpf(i.qty * i.avgCost)}</div>}
              </button>
            ))}
          </Card>
        </>
      )}

      {tab === 'emplacements' && (
        <div className="space-y-4">
          {g.isResp && (
            <div className="flex flex-wrap gap-2">
              <Button small icon={<Plus size={14} />} onClick={() => setModal({ t: 'loc', kind: 'MAGASIN' })}>Magasin</Button>
              {active.length > 0 && <Button small variant="secondary" icon={<Printer size={14} />} onClick={() => setModal({ t: 'qr', ids: active.filter(l => l.kind === 'CASIER' || !active.some(c => c.parentId === l.id)).map(l => l.id) })}>Étiquettes QR</Button>}
            </div>
          )}
          {magasins.length === 0 ? <Card><Empty>Aucun magasin. Créez-en un (conteneur, local, véhicule atelier…) puis ses casiers.</Empty></Card> : magasins.map(m => {
            const bins = active.filter(l => l.parentId === m.id).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
            return (
              <Card key={m.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <button onClick={() => g.openStockLocation(m.id)} className="text-left">
                    <div className="text-base font-black text-dark flex items-center gap-2"><Boxes size={18} className="text-primary" />{m.name}</div>
                    <div className="text-[11px] text-gray-500">{bins.length} casier(s){m.siteId ? ` · ${g.siteName(m.siteId)}` : ''}{g.isResp ? ` · ${fmtXpf(locValue(m.id) + bins.reduce((s, b) => s + locValue(b.id), 0))}` : ''}</div>
                  </button>
                  {g.isResp && <Button small variant="secondary" icon={<Plus size={14} />} onClick={() => setModal({ t: 'loc', kind: 'CASIER', parentId: m.id })}>Casier</Button>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {lineCount(m.id) > 0 && (
                    <button onClick={() => g.openStockLocation(m.id)} className="rounded-2xl border border-border p-3 text-left hover:border-primary/40">
                      <div className="text-sm font-black">Hors casier</div><div className="text-[11px] text-gray-500">{lineCount(m.id)} réf.</div>
                    </button>
                  )}
                  {bins.map(b => (
                    <button key={b.id} onClick={() => g.openStockLocation(b.id)} className="rounded-2xl border border-border p-3 text-left hover:border-primary/40">
                      <div className="text-sm font-black">{b.name}</div><div className="text-[11px] text-gray-500">{lineCount(b.id)} réf.</div>
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'mouvements' && (
        <>
          <div className="mb-3">
            <Segmented value={moveFilter} onChange={setMoveFilter} options={[{ value: 'ALL', label: 'Tous' }, ...(Object.keys(STOCK_MOVE_LABEL) as StockMoveType[]).map(t => ({ value: t, label: STOCK_MOVE_LABEL[t] }))]} />
          </div>
          <Card>{shownMoves.length === 0 ? <Empty>Aucun mouvement.</Empty> : shownMoves.map(m => <MoveRow key={m.id} m={m} showValue={g.isResp} onReturn={g.stock.canTake ? (x => setModal({ t: 'return', m: x })) : undefined} />)}</Card>
        </>
      )}

      {tab === 'compta' && g.isResp && <AccountingPanel />}

      {modal?.t === 'item' && <ItemDetailModal id={modal.id} onClose={() => setModal(null)} />}
      {modal?.t === 'newItem' && <ItemFormModal onClose={id => setModal(id ? { t: 'item', id } : null)} />}
      {modal?.t === 'move' && <MoveModal mode={modal.mode} onClose={() => setModal(null)} />}
      {modal?.t === 'loc' && <LocationFormModal kind={modal.kind} parentId={modal.parentId} onClose={() => setModal(null)} />}
      {modal?.t === 'qr' && <LocationQrModal locations={active.filter(l => modal.ids.includes(l.id))} onClose={() => setModal(null)} />}
      {modal?.t === 'return' && <ReturnModal move={modal.m} onClose={() => setModal(null)} />}
    </div>
  );
};

