// Jeu de démonstration générique (fictif) : une entreprise de services avec un parc de véhicules,
// des engins de nettoyage et des centrales de dilution installées chez une clinique cliente.
// Utilisé par le mode démo du front et par scripts/seedGmao.mjs (émulateurs).
// Tout passe par handleGmaoAction / handlePublicAction : l'historique est rejoué avec des dates passées.
import { Actor, Ctx, GmaoStore, handleGmaoAction, handlePublicAction, runPreventiveScan } from './core';
import { Asset, COLL, GmaoChecklist, GmaoUser, PmPlan, Typology, WorkOrder, WorkRequest } from './model';

const DAY = 86400000;
const NC_OFFSET_H = 11; // Nouméa, UTC+11, pas d'heure d'été

export interface SeedUsers {
  responsable: GmaoUser;
  techniciens: GmaoUser[];   // 2 attendus
  client: GmaoUser;          // compte client (rattaché à la clinique créée ici)
}

function nc(now: Date, dayOffset: number, hour: number, minute = 0): Date {
  const local = new Date(now.getTime() + NC_OFFSET_H * 3600000);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  return new Date(Date.UTC(y, m, d + dayOffset, hour - NC_OFFSET_H, minute));
}

function workdayOffset(now: Date, n: number): number {
  let offset = 0;
  let count = -1;
  for (;;) {
    const local = new Date(now.getTime() + NC_OFFSET_H * 3600000 + offset * DAY);
    const dow = local.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    if (count === n) return offset;
    offset++;
  }
}

const isWeekend = (d: Date) => { const dow = new Date(d.getTime() + NC_OFFSET_H * 3600000).getUTCDay(); return dow === 0 || dow === 6; };

/**
 * Construit la démo. Le client est créé ici : renvoie son identifiant pour que l'appelant
 * rattache le compte client (users[].clientId en démo, gmaoClientIds en émulateur).
 */
export async function seedDemo(store: GmaoStore, users: SeedUsers, now = new Date(), onClientCreated?: (clientId: string) => Promise<void> | void): Promise<{ clientId: string }> {
  const resp: Actor = { id: users.responsable.id, name: users.responsable.name, role: 'RESPONSABLE' };
  const [t1, t2] = users.techniciens.map(t => ({ id: t.id, name: t.name, role: 'TECHNICIEN' as const }));
  const tom = t1, yann = t2 || t1;

  const run = async (actor: Actor, when: Date, action: string, payload: any) => {
    const ctx: Ctx = { store, actor, now: when, effects: [] };
    return handleGmaoAction(ctx, action, payload);
  };
  const pub = async (when: Date, payload: any) => {
    const ctx: Ctx = { store, actor: { id: 'public', name: payload.name, role: 'CLIENT' }, now: when, effects: [] };
    return handlePublicAction(ctx, 'REPORT', { elapsedMs: 20000, ...payload });
  };
  const at = (days: number, hour = 8, minute = 0) => nc(now, days, hour, minute);
  const START = -150;

  // ── Organisation ──
  await run(resp, at(START - 5), 'SETTINGS_SAVE', { assetCodeMode: 'GENERATED', assetCodePrefix: 'MAC', requireApproval: false, publicReports: true });
  const depot = (await run(resp, at(START - 5), 'SITE_SAVE', { name: 'Dépôt de Ducos', address: 'Rue Papin, Ducos' })).id;
  const cliniqueSite = (await run(resp, at(START - 5), 'SITE_SAVE', { name: 'Clinique du Lagon', address: 'Nouville, Nouméa' })).id;
  const clinique = (await run(resp, at(START - 5), 'CLIENT_SAVE', { name: 'Clinique du Lagon', contactName: 'David R. (pharmacie)', email: 'pharmacie@clinique-lagon.example', phone: '27 00 00' })).id;
  if (onClientCreated) await onClientCreated(clinique);
  const client: Actor = { id: users.client.id, name: users.client.name, role: 'CLIENT', clientId: clinique };

  for (const kitId of ['VEHICULES', 'NETTOYAGE', 'CENTRALES']) await run(resp, at(START - 5), 'KIT_APPLY', { kitId });
  const typ = async (name: string) => (await store.list<Typology>(COLL.typologies)).find(t => t.name === name)!.id;
  const VL = await typ('Véhicule léger'), UT = await typ('Utilitaire'), AL = await typ('Autolaveuse'), MB = await typ('Monobrosse'), INJ = await typ('Injecteur-extracteur'), CD = await typ('Centrale de dilution');

  // ── Parc ──
  const mk = async (p: any) => (await run(resp, at(START), 'ASSET_CREATE', p)).id as string;
  const yaris = await mk({ name: 'Toyota Yaris', typologyId: VL, siteId: depot, brand: 'Toyota', model: 'Yaris', registration: 'NC-412-AB', meterValue: 41200, technicianIds: [tom.id], contactName: 'Jean W. (chef d’équipe)', contactPhone: '77 12 34' });
  const duster = await mk({ name: 'Dacia Duster', typologyId: VL, siteId: depot, brand: 'Dacia', model: 'Duster', registration: 'NC-588-CD', meterValue: 86800, technicianIds: [tom.id], contactName: 'Sandrine K. (exploitation)', contactPhone: '78 45 61' });
  const kangoo = await mk({ name: 'Renault Kangoo', typologyId: UT, siteId: depot, brand: 'Renault', model: 'Kangoo', registration: 'NC-731-EF', meterValue: 119000, technicianIds: [tom.id], contactName: 'Paul T. (chauffeur)', contactPhone: '79 98 76' });
  const partner = await mk({ name: 'Peugeot Partner', typologyId: UT, siteId: depot, brand: 'Peugeot', model: 'Partner', registration: 'NC-905-GH', meterValue: 52000, technicianIds: [tom.id], contactName: 'Jean W. (chef d’équipe)', contactPhone: '77 12 34' });
  const al1 = await mk({ name: 'Autolaveuse Kärcher B 40', typologyId: AL, siteId: depot, brand: 'Kärcher', model: 'B 40', serialNumber: 'KB40-2291', technicianIds: [yann.id], location: 'Local matériel' });
  const al2 = await mk({ name: 'Autolaveuse Nilfisk SC 450', typologyId: AL, siteId: depot, brand: 'Nilfisk', model: 'SC 450', technicianIds: [yann.id], location: 'Local matériel' });
  const al3 = await mk({ name: 'Autolaveuse Kärcher BD 50', typologyId: AL, siteId: cliniqueSite, clientId: clinique, brand: 'Kärcher', model: 'BD 50', location: 'Local ménage RDC', technicianIds: [] });
  const mb1 = await mk({ name: 'Monobrosse Taski Ergodisc', typologyId: MB, siteId: depot, brand: 'Taski', model: 'Ergodisc', technicianIds: [yann.id], location: 'Local matériel' });
  const mb2 = await mk({ name: 'Monobrosse Numatic', typologyId: MB, siteId: cliniqueSite, clientId: clinique, brand: 'Numatic', technicianIds: [yann.id], location: 'Local ménage étage 1' });
  await mk({ name: 'Injecteur-extracteur Santoemma', typologyId: INJ, siteId: depot, brand: 'Santoemma', technicianIds: [yann.id] });
  const cdBloc = await mk({ name: 'Centrale bloc opératoire', typologyId: CD, siteId: cliniqueSite, clientId: clinique, location: 'Bloc, local technique', technicianIds: [tom.id], serialNumber: 'CD-1182' });
  const cdCuisine = await mk({ name: 'Centrale cuisine', typologyId: CD, siteId: cliniqueSite, clientId: clinique, location: 'Cuisine centrale', technicianIds: [tom.id], serialNumber: 'CD-1183' });
  await mk({ name: 'Centrale buanderie', typologyId: CD, siteId: cliniqueSite, clientId: clinique, location: 'Buanderie', technicianIds: [tom.id], serialNumber: 'CD-1190' });
  await mk({ name: 'Centrale étage 2', typologyId: CD, siteId: cliniqueSite, clientId: clinique, location: 'Office étage 2', technicianIds: [tom.id], serialNumber: 'CD-1201' });

  const answersFor = async (checklistId: string | null | undefined, asset?: Asset) => {
    if (!checklistId) return undefined;
    const chk = await store.get<GmaoChecklist>(COLL.checklists, checklistId);
    const a: Record<string, { value: any }> = {};
    chk?.items.forEach(i => {
      if (i.type === 'BOOLEAN') a[i.id] = { value: true };
      else if (i.type === 'CHOICE') a[i.id] = { value: i.options![Math.random() < 0.8 ? 0 : 1] };
      else if (i.type === 'NUMBER') a[i.id] = { value: asset?.meterValue || 1 };
      else if (i.type === 'TEXT') a[i.id] = { value: i.required ? 'RAS' : '' };
    });
    return a;
  };

  const complete = async (woId: string, tech: Actor, start: Date, hours: number, report: string, extra: any = {}) => {
    const wo = (await store.get<WorkOrder>(COLL.workOrders, woId))!;
    const asset = (await store.get<Asset>(COLL.assets, wo.assetId))!;
    const end = new Date(start.getTime() + hours * 3600000);
    if (wo.status === 'A_PLANIFIER' && !extra.noPlan) {
      await run(resp, new Date(start.getTime() - 20 * 3600000), 'WO_PLAN', { id: woId, assigneeIds: [tech.id], plannedStart: start.toISOString(), plannedEnd: end.toISOString(), resourceType: extra.resourceType, externalProvider: extra.externalProvider });
    }
    const closer = extra.resourceType === 'EXTERNE' ? resp : tech;
    await run(closer, new Date(end.getTime() + 10 * 60000), 'WO_CLOSE', {
      id: woId, report, actualStart: start.toISOString(), actualEnd: end.toISOString(),
      checklistAnswers: await answersFor(wo.checklistId, asset), assetStateAfter: 'OPERATIONNEL',
      meterAtClose: asset.meterType ? asset.meterValue : undefined, ...extra,
    });
  };

  // ── Historique : 150 jours rejoués jour par jour ──
  const kmPerDay: Record<string, number> = { [yaris]: 55, [duster]: 80, [kangoo]: 100, [partner]: 45 };
  const skipUntilNow = new Set<string>();
  for (let d = START; d <= 0; d++) {
    const day = at(d);
    if (!isWeekend(day) && new Date(day.getTime() + NC_OFFSET_H * 3600000).getUTCDay() === 1) {
      for (const [id, perDay] of Object.entries(kmPerDay)) {
        const asset = (await store.get<Asset>(COLL.assets, id))!;
        await run(tom, at(d, 7, 15), 'METER_ADD', { id, value: Math.round((asset.meterValue || 0) + perDay * 7 * (0.85 + Math.random() * 0.3)) });
      }
    }
    await runPreventiveScan({ store, actor: { id: 'system', name: 'Planification automatique', role: 'RESPONSABLE' }, now: at(d, 5), effects: [] });
    if (d > -3 || isWeekend(day)) continue;
    const open = (await store.list<WorkOrder>(COLL.workOrders))
      .filter(w => w.kind === 'PREVENTIF' && w.status === 'A_PLANIFIER' && new Date(w.createdAt).getTime() <= at(d - 4).getTime());
    for (const w of open) {
      // Laissés ouverts volontairement : le contrôle mensuel du Duster (en retard depuis plus d'un mois, sans doublon)
      // et la vidange du Kangoo (alerte kilométrique en cours, référent à appeler).
      if (w.assetId === duster && w.title === 'Contrôle mensuel' && new Date(w.createdAt).getTime() > at(-50).getTime()) { skipUntilNow.add(w.id); continue; }
      if (w.assetId === kangoo && w.title.startsWith('Vidange') && new Date(w.createdAt).getTime() > at(-45).getTime()) { skipUntilNow.add(w.id); continue; }
      if (new Date(w.createdAt).getTime() > at(-10).getTime()) continue;
      const tech = w.assigneeIds[0] === yann.id ? yann : tom;
      const report = w.title.startsWith('Vidange') ? 'Vidange réalisée au garage partenaire, filtre remplacé.' : w.title.startsWith('Inversion') ? 'Bavettes inversées, raclette contrôlée.' : 'Réalisé selon la gamme. RAS.';
      await complete(w.id, tech, at(d, 13), w.estimatedHours || 1, report, w.title.startsWith('Vidange') ? { resourceType: 'EXTERNE', externalProvider: 'Garage partenaire' } : {});
    }
  }

  // ── Curatif clôturé ──
  {
    const r = await run(client, at(-62, 9, 30), 'REQUEST_CREATE', { assetId: cdCuisine, description: 'Fuite au niveau du raccord de la centrale, flaque au sol le matin.', declaredState: 'DEGRADE' });
    await complete(r.workOrderId, tom, at(-61, 8), 1, 'Raccord d’aspiration remplacé, essai de dosage OK.', { noPlan: false });
  }
  {
    const r = await pub(at(-40, 10, 5), { token: (await store.get<Asset>(COLL.assets, al1))!.qrToken, name: 'Marie (agent d’entretien)', description: 'La raclette laisse des traces d’eau derrière la machine.', declaredState: 'DEGRADE' });
    const req = (await store.list<WorkRequest>(COLL.requests)).find(x => x.number === r.number)!;
    const ap = await run(yann, at(-40, 13), 'REQUEST_APPROVE', { id: req.id, title: 'Raclette : traces d’eau', takeIt: true });
    await complete(ap.workOrderId, yann, at(-39, 9), 0.75, 'Bavette arrière usée, remplacée. Plus de traces.', { noPlan: true });
  }
  {
    const r = await pub(at(-21, 22, 40), { token: (await store.get<Asset>(COLL.assets, mb1))!.qrToken, name: 'Kevin', description: 'test test test test' });
    const req = (await store.list<WorkRequest>(COLL.requests)).find(x => x.number === r.number)!;
    await run(yann, at(-20, 7, 30), 'REQUEST_CANCEL', { id: req.id, reason: 'Faux signalement (essai du QR code).', falseReport: true });
  }
  {
    const r = await run(client, at(-15, 11), 'REQUEST_CREATE', { kind: 'REMARQUE', assetId: cdBloc, description: 'Merci de prévenir l’accueil du bloc avant chaque passage.' });
    await run(tom, at(-15, 14), 'REQUEST_ACK', { id: r.id, note: 'Noté, nous appellerons le 27 00 01 avant chaque visite.' });
  }

  // ── Situation actuelle ──
  const wd = (n: number) => workdayOffset(now, n);
  await pub(at(-1, 16, 20), { token: (await store.get<Asset>(COLL.assets, mb2))!.qrToken, name: 'Sonia (ASH étage 1)', contact: '76 33 21', description: 'Le câble est abîmé près de la prise, on voit les fils.', safety: true, declaredState: 'INDISPONIBLE' });
  await run(client, at(0, 7, 40), 'REQUEST_CREATE', { kind: 'REMARQUE', assetId: al3, description: 'L’autolaveuse a été rangée sans vider le réservoir d’eau sale.' });
  {
    const r = await run(resp, at(-6, 9), 'REQUEST_CREATE', { assetId: al2, description: 'Brosse qui ne tourne plus par moments.', declaredState: 'DEGRADE', assigneeIds: [yann.id] });
    await run(yann, at(-5, 8), 'WO_START', { id: r.workOrderId });
    await run(yann, at(-5, 10), 'WO_HOLD', { id: r.workOrderId, reason: 'Courroie d’entraînement commandée chez le fournisseur (livraison sous 10 jours).' });
  }
  const planNew = async (assetId: string, title: string, tech: Actor, workday: number, h1: number, h2: number, extra: any = {}) => {
    const wo = await run(resp, at(-2, 10), 'WO_CREATE', { assetId, title, priority: extra.priority || 'P3', interventionType: extra.interventionType || 'Mécanique', estimatedHours: h2 - h1, assigneeIds: [tech.id] });
    await run(resp, at(-2, 11), 'WO_PLAN', { id: wo.id, assigneeIds: [tech.id], plannedStart: at(wd(workday), h1).toISOString(), plannedEnd: at(wd(workday), h2).toISOString() });
  };
  await planNew(partner, 'Remplacer les balais d’essuie-glace', tom, 1, 8, 9, { interventionType: 'Mécanique' });
  await planNew(al3, 'Contrôle batterie (autonomie en baisse)', yann, 2, 13, 14, { interventionType: 'Électrique', priority: 'P2' });
  const openPm = (await store.list<WorkOrder>(COLL.workOrders)).filter(w => w.kind === 'PREVENTIF' && w.status === 'A_PLANIFIER' && !skipUntilNow.has(w.id)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (openPm[0]) {
    const tech = openPm[0].assigneeIds[0] === yann.id ? yann : tom;
    await run(resp, at(-1, 10), 'WO_PLAN', { id: openPm[0].id, assigneeIds: [tech.id], plannedStart: at(wd(3), 8).toISOString(), plannedEnd: at(wd(3), 9).toISOString() });
  }
  const task = async (p: any) => run(resp, at(-2, 9), 'TASK_SAVE', p);
  await task({ title: 'Point maintenance hebdomadaire', kind: 'REUNION', assigneeIds: [tom.id, yann.id, resp.id], start: at(wd(0), 7).toISOString(), end: at(wd(0), 7, 30).toISOString() });
  await task({ title: 'Tournée des centrales (contrôle visuel)', kind: 'TACHE', assigneeIds: [tom.id], siteId: cliniqueSite, start: at(wd(0), 8).toISOString(), end: at(wd(0), 10).toISOString() });
  await task({ title: 'Inventaire des consommables (bavettes, brosses)', kind: 'TACHE', assigneeIds: [yann.id], siteId: depot, start: at(wd(1), 13).toISOString(), end: at(wd(1), 15).toISOString() });
  await task({ title: 'Congé', kind: 'CONGE', assigneeIds: [yann.id], start: at(wd(4), 6).toISOString(), end: at(wd(4), 17).toISOString() });
  return { clientId: clinique };
}

/** Utilisé par les tests : liste des gammes d'une machine. */
export async function plansOf(store: GmaoStore, assetId: string) {
  return (await store.list<PmPlan>(COLL.pmPlans)).filter(p => p.assetIds.includes(assetId));
}
