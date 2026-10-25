import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QrCode, Search, X, Flag, CameraOff } from 'lucide-react';
import { useGmao } from './GmaoContext';
import { Button, Card, Empty, Label, PageHeader, PriorityBadge, StateBadge, fmtTime, WoStatusBadge } from './ui';
import { RequestFormModal } from './RequestsView';
import { Asset, OPEN_WORK_ORDER_STATUSES, tokenFromScan } from '../../functions/src/gmao/model';

/** Retrouve la machine à partir du contenu d'un QR code : URL Miki (/q/jeton) ou code machine. */
export function findAssetFromScan(assets: Asset[], text: string): Asset | undefined {
  const t = String(text || '').trim();
  const token = tokenFromScan(t);
  if (token) return assets.find(a => a.qrToken === token);
  return assets.find(a => a.qrToken === t) || assets.find(a => a.code.toUpperCase() === t.toUpperCase());
}

/** Écran terrain : scanner le QR d'une machine (ou chercher son code) pour ouvrir sa fiche. */
export const TerrainView: React.FC = () => {
  const g = useGmao();
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState('');
  const [q, setQ] = useState('');
  const [declare, setDeclare] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handled = useRef(false);

  const stop = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) { try { if (s.isScanning) await s.stop(); s.clear(); } catch { /* déjà arrêté */ } }
    setScanning(false);
  };

  useEffect(() => {
    if (!scanning) return;
    handled.current = false;
    const scanner = new Html5Qrcode('gmao-qr-reader');
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => { const s = Math.min(w, h) * 0.7; return { width: s, height: s }; } },
      text => {
        if (handled.current) return;
        const asset = findAssetFromScan(g.assets, text);
        if (asset) {
          handled.current = true;
          stop();
          g.openAsset(asset.id);
        } else {
          g.toast(g.isClient ? 'Cette machine ne fait pas partie de votre parc.' : 'QR code inconnu dans le parc.', 'info');
        }
      },
      () => { /* pas de QR dans l'image */ },
    ).catch(() => { setCamError("Caméra indisponible : autorisez l'accès ou recherchez la machine par son code."); setScanning(false); });
    return () => { stop(); };
  }, [scanning]);

  const results = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    const exact = findAssetFromScan(g.assets, s);
    if (exact) return [exact];
    const low = s.toLowerCase();
    return g.assets.filter(a => !a.isArchived && `${a.code} ${a.name} ${a.registration || ''} ${a.serialNumber || ''}`.toLowerCase().includes(low)).slice(0, 12);
  }, [q, g.assets]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const myToday = g.workOrders
    .filter(w => w.assigneeIds.includes(g.me.id) && OPEN_WORK_ORDER_STATUSES.includes(w.status) && w.plannedStart && new Date(w.plannedStart) < tomorrow && new Date(w.plannedEnd || w.plannedStart) >= today)
    .sort((a, b) => (a.plannedStart || '').localeCompare(b.plannedStart || ''));

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title="Scanner" subtitle={g.isClient ? 'Scannez le QR code d’une machine pour voir son suivi ou signaler un problème.' : 'Scannez le QR code collé sur la machine : ce qu’il y a à faire s’affiche.'} />

      <Card className="p-4 mb-4">
        {scanning ? (
          <div>
            <div id="gmao-qr-reader" className="rounded-2xl overflow-hidden bg-black aspect-square" />
            <Button variant="secondary" className="w-full mt-3" icon={<X size={16} />} onClick={stop}>Arrêter</Button>
          </div>
        ) : (
          <button onClick={() => { setCamError(''); setScanning(true); }} className="w-full rounded-2xl bg-primary text-white py-8 flex flex-col items-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.99] transition-transform">
            <QrCode size={48} />
            <span className="text-lg font-black">Scanner une machine</span>
          </button>
        )}
        {camError && <p className="text-sm text-orange-600 mt-3 flex gap-2"><CameraOff size={16} className="shrink-0" />{camError}</p>}
        <div className="flex items-center gap-2 border border-border rounded-2xl px-3 mt-3">
          <Search size={16} className="text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="… ou tapez un code, une immatriculation" className="flex-1 py-3 text-sm focus:outline-none" />
        </div>
        {results.length > 0 && (
          <div className="mt-2 divide-y divide-border">
            {results.map(a => (
              <button key={a.id} onClick={() => g.openAsset(a.id)} className="w-full text-left py-2.5 flex items-center justify-between gap-2">
                <span className="text-sm"><b>{a.code}</b> · {a.name} <span className="text-gray-400 text-xs">{g.siteName(a.siteId)}</span></span>
                <StateBadge state={a.state} />
              </button>
            ))}
          </div>
        )}
      </Card>

      <Button variant="secondary" className="w-full mb-4" icon={<Flag size={16} />} onClick={() => setDeclare(true)}>Signaler un problème sans scanner</Button>

      {(g.isTech || g.isResp) && (
        <Card className="p-4">
          <Label className="mb-2">Mes interventions du jour</Label>
          {myToday.length ? myToday.map(w => (
            <button key={w.id} onClick={() => g.openWorkOrder(w.id)} className="w-full text-left py-2.5 border-b border-border last:border-0 flex items-center gap-2">
              <span className="text-xs font-black text-gray-500 w-12">{fmtTime(w.plannedStart)}</span>
              <PriorityBadge p={w.priority} />
              <span className="flex-1 text-sm truncate"><b>{w.assetCode}</b> {w.title}</span>
              <WoStatusBadge s={w.status} />
            </button>
          )) : <Empty>Rien de planifié pour vous aujourd'hui.</Empty>}
        </Card>
      )}
      {declare && <RequestFormModal onClose={() => setDeclare(false)} />}
    </div>
  );
};
