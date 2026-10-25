# MIKI — Documentation Projet

> **Branche `gmao`** : GMAO multi-entreprises, vendue en offres Starter / Pro / Ultra / Sur mesure. Issue de la branche
> `csp` (GMAO sur mesure CSP), rendue générique : tout ce qui diffère d'un client à l'autre est un **réglage** ou un
> **kit de démarrage**, jamais un développement spécifique. L'ancienne interface Miki (emprunts, CDil) reste active pour
> les organisations sans le module GMAO. Le reste du document décrit ce socle Miki hérité de `vivian`.

## GMAO multi-entreprises (branche `gmao`)

### Démarrer
```bash
# Démo sans Firebase (logique complète dans le navigateur, données fictives en localStorage)
npm run dev            # puis http://localhost:3000/?demo
# Tests de la logique métier (sans émulateur)
cd functions && npm test
# Émulateurs (Java requis) : terminal 1
cd functions && npm run build && cd .. && firebase emulators:start
# terminal 2 : données
node scripts/seedGmao.mjs   # organisations « demo » et « wdp », mot de passe password123
npm run dev                 # http://localhost:3000
```
Comptes : `resp@demo.test` (responsable), `tom@demo.test` / `yann@demo.test` (techniciens), `lea@demo.test` (cliente
Clinique du Lagon), `responsable@wdp.test` et `technicien@wdp.test` (organisation vierge), `admin@miki.nc` (plateforme).
Les émulateurs écoutent sur `0.0.0.0` et le front se connecte à l'hôte de la page : un téléphone du réseau local
(`http://<IP du PC>:3000`) peut tester le QR code et le formulaire public.

### Rôles et comptes
| Rôle Miki (tenantsAccess) | Rôle GMAO | Droits |
|---|---|---|
| ADMIN / TECHNICIAN | Responsable maintenance | Tout : parc, clients, planning, préventif, réglages, comptes. Compte principal de l'organisation |
| AGENT | Technicien | Son parc (périmètre), son planning, réalise les interventions, relevés, états, signalements |
| CLIENT + `gmaoClientIds[tenantId]` | Client | Ses machines uniquement : historique, suivi des maintenances, signalements, remarques |
| (aucun compte) | Public | Formulaire de signalement via le QR code (nom obligatoire) |

### Offres et quotas (`functions/src/gmao/model.ts` → `PLANS`)
Starter 1 technicien / 20 machines / 1 client · Pro 3 / 60 / 5 · Ultra 6 / 200 / 10 · Sur mesure (limites libres).
Champ `plan` du document tenant. Contrôlés **côté serveur** : machines actives de niveau « machine » (`ASSET_CREATE`,
`ASSET_IMPORT`, `ASSET_RESTORE`), clients actifs (`CLIENT_SAVE`), comptes techniciens et responsables (`manageUser`,
`checkGmaoSeats`). Les machines et clients archivés ne comptent pas. Un « client » est une organisation (plusieurs comptes).
Console plateforme : `GmaoAdminPanel` (création d'organisation avec offre + kits + responsable, changement d'offre).

### Architecture
| Fichier | Rôle |
|---|---|
| `functions/src/gmao/model.ts` | Types, offres, réglages par défaut, collections. **Partagé front / back.** |
| `functions/src/gmao/recurrence.ts` | Récurrences type Google Agenda (jour/semaine/mois/an, jours de semaine, « 2e mardi », fin après N fois ou à une date). Dates civiles dans le fuseau de l'organisation |
| `functions/src/gmao/rules.ts` | Priorité suggérée, échéances préventives (sans rattrapage), disponibilité, périmètre |
| `functions/src/gmao/core.ts` | `handleGmaoAction` (comptes connectés) et `handlePublicAction` (QR public) : toutes les mutations, permissions, périmètres, quotas, anti-spam |
| `functions/src/gmao/kits.ts` | Kits de démarrage : Véhicules, Engins de nettoyage, Centrales de dilution, Équipements divers |
| `functions/src/gmao/seed.ts` | Démo générique (Démo Services NC), ~150 jours rejoués |
| `functions/src/index.ts` (fin) | `gmaoAction`, `gmaoPublic` (sans compte, limite 10/h par IP, photos → Storage), `gmaoDailyPreventiveScan` (05:00, plan Blaze), `gmaoCreateOrganization`, `gmaoSetPlan` |
| `services/gmao/*` | `firebaseBackend` / `demoBackend` (même cœur en mémoire), `PublicBackend` |
| `components/gmao/*` | `GmaoShell` (navigation par rôle), `Dashboard` (+ accueil client), `Planning`, `WorkOrders` (interventions), `Requests` (signalements), `Preventive`, `Assets` (parc, fiche machine, QR, import CSV), `Tracking` (suivi des maintenances), `Terrain` (scanner), `Settings`, `PublicReportPage` |

Le front importe `functions/src/gmao/*` directement (Vite). `functions/lib` est versionné : **rebuild après chaque
modification** (`cd functions && npm run build`).

### QR code
Chaque machine a un jeton `qrToken` non devinable ; le QR contient `https://<app>/q/<jeton>`. Index global
`gmaoQr/{jeton} → {tenantId, assetId}` (écrit par le serveur). Téléphone sans session → `PublicReportPage` ; compte
connecté → fiche de la machine (`openToken`) ; scanner de l'application → `tokenFromScan` isole le jeton (un code machine
tapé fonctionne aussi). Garde-fous du formulaire public : champ piège, durée minimale de saisie, nom et description
obligatoires, pas de lien, doublons fusionnés, 5 signalements/h par machine, 60/jour par organisation, 10/h par IP.
Un signalement public ne modifie jamais l'état de la machine ; « faux signalement » = classé sans suite marqué.

### Réglages par organisation (champ `gmao` du tenant)
`requireApproval` (validation des signalements, désactivée par défaut), `techniciansSelfPlan`, `publicReports`,
`assetHierarchy` (sous-ensembles), `safetyChecklistId`, `assetCodeMode` (`GENERATED` + `assetCodePrefix`, ou `MANUAL`),
`priorityDelays` (Urgente / Haute / Normale / Basse), `interventionTypes`, `utcOffsetMinutes`.
Référentiels propres : typologies (`gmaoTypologies`, compteur et check-list par défaut), clients (`gmaoClients`), sites,
check-lists (types : conforme/non conforme, choix, nombre, texte, photo).

### Collections Firestore (`tenants/{tenantId}/…`)
`gmaoAssets` (`technicianIds` vide = tous, `clientId`, `qrToken`, `nextPm` dénormalisé), `gmaoAssetEvents`,
`gmaoRequests` (SIG-AAAA-NNNN, `source` APP / QR_PUBLIC, `kind` PROBLEME / REMARQUE), `gmaoWorkOrders` (INT-AAAA-NNNN),
`gmaoPmPlans` (`recurrence` ou `meterInterval`, `typologyId` = gamme type), `gmaoTasks`, `gmaoTypologies`, `gmaoClients`,
`checklists`, `sites`, `counters/gmao`. `clientId` est recopié sur interventions, signalements et événements pour que les
règles Firestore limitent un client à ses machines (`firestore.rules`).

### Flux
- **Signalement** `A_TRAITER → APPROUVEE (intervention créée) → PLANIFIEE → CLOTUREE` ou `ANNULEE` (classé sans suite /
  faux signalement). Sans validation, un signalement d'un compte crée directement l'intervention ; un signalement public
  reste « à traiter ». Remarque : « marquer comme lue ».
- **Intervention** `A_PLANIFIER → PLANIFIE → EN_COURS → CLOTURE` (+ `EN_ATTENTE`, `ANNULE`). Attribuée d'office à
  l'unique technicien du périmètre. « Fait » depuis la fiche (sans démarrage préalable) ; « Intervention réalisée » =
  création + clôture en une étape (`WO_RECORD`).
- **Préventif** : une seule intervention ouverte par gamme × machine ; une échéance manquée n'est pas rattrapée (fait en
  retard en juillet pour juin → prochaine en août) ; ancrage « dates fixes » ou « depuis la réalisation » ; compteur :
  depuis le relevé ou paliers fixes.

### Hors périmètre
Stock, achats, coûts et indicateurs avancés (MTBF, MTTR) retirés volontairement, interfaces externes, hors-ligne.
Facturation des offres : manuelle.

## Vue d'ensemble
Application de gestion de parc matériel hospitalier, SaaS multi-tenant.  
React 19 + Vite 6 SPA, TypeScript, Tailwind CSS.  
Backend : Firebase (Auth, Firestore, Cloud Functions v1).

## Démarrage local

```bash
# 1. Compiler les Cloud Functions (à chaque modif de functions/src/)
cd functions && npm run build && cd ..

# 2. Lancer les émulateurs Firebase
firebase emulators:start
# Auth:9099 | Functions:5001 | Firestore:8080 | Storage:9199 | UI:4000

# 3. Seeder les données de test (premier démarrage ou reset)
node scripts/seedEmulator.mjs
# Crée : 4 comptes, 3 sites, 10 équipements, 7 mouvements, 3 tickets, 3 signalements, 5 unités CDil + 2 sessions

# 4. Frontend (autre terminal)
npm run dev   # http://localhost:5173
```

### Comptes de test
| Email | Mot de passe | Rôle | Périmètre |
|---|---|---|---|
| admin@miki.nc | password123 | ADMIN | Plateforme entière |
| tech@miki.nc | password123 | TECHNICIAN | Hôpital Nord + Clinique Sud |
| agent@miki.nc | password123 | AGENT | Toute la Clinique Test |
| client@miki.nc | password123 | CLIENT | Hôpital Nord uniquement |

## Stack technique
| Couche | Technologie |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS, Vite 6 |
| Backend | Firebase Cloud Functions v1 (`firebase-functions/v1`) |
| Base de données | Firestore (règles côté serveur, pas d'écriture client directe) |
| Auth | Firebase Auth |
| Dev | Firebase Emulator Suite |

## Architecture Firestore (multi-tenant)

```
users/{userId}
  └─ notifications/{notifId}

tenants/{tenantId}
  ├─ equipments/{equipmentId}
  ├─ equipmentLogs/{logId}
  ├─ sites/{siteId}
  ├─ checklists/{checklistId}
  ├─ maintenanceLogs/{logId}
  ├─ incidentReports/{reportId}
  ├─ cdilUnits/{unitId}          ← Centrales de Dilution (installations fixes)
  └─ visitSessions/{sessionId}   ← Sessions de visite CDil (entries[] embarqués)

audit_logs/{logId}               ← Journal d'audit (lecture ADMIN uniquement)
```

## Hiérarchie des rôles
**Décision cadrage 31/08/2026 : 4 rôles uniquement** (MANAGER fusionné dans TECHNICIAN)

`ADMIN > TECHNICIAN > AGENT > CLIENT`

| Rôle | tenantId | Accès |
|---|---|---|
| ADMIN | `platform` | Console super-admin, audit_logs, tous les tenants, validation archivage |
| TECHNICIAN | tenant réel | Gestion équipements, CDil, visites, signalements, restitution forcée, multi-sites |
| AGENT | tenant réel | Scan QR, emprunts, saisie a posteriori, signalements |
| CLIENT | tenant réel | Consultation périmètre propre, signalements, réponses (pas exports, pas durée interventions) |

> **Fusion MANAGER → TECHNICIAN terminée (P0).** Plus aucune référence MANAGER dans le code.

## Pattern Cloud Functions

```typescript
// Garde obligatoire sur toutes les CF
const { user, tenantId } = await verifyAccess(data, context, ['TECHNICIAN', 'ADMIN']);

// Audit fire-and-forget (ne bloque pas la réponse)
await writeAuditLog({
  userId, userName, action,   // ex: 'USER_CREATED'
  tenantId, details,          // details = string lisible (pas d'objet)
  targetId, targetName        // entité concernée
});
// La category est déduite du préfixe : USER_* → 'USER', EQUIPMENT_* → 'STRUCTURE', etc.
```

### Actions d'audit enregistrées
```
USER_CREATED  USER_UPDATED  USER_DISABLED  USER_ENABLED  USER_PASSWORD_RESET
EQUIPMENT_CREATED  EQUIPMENT_UPDATED  EQUIPMENT_ARCHIVED  EQUIPMENT_ARCHIVE_REQUESTED  EQUIPMENT_REACTIVATED
TENANT_CREATED  TENANT_UPDATED
TICKET_STATUS_CHANGED  TICKET_ARCHIVED
SIGNALEMENT_CREATED  SIGNALEMENT_UPDATED  SIGNALEMENT_CLOSED
RESTITUTION_FORCED
```

## CDil — Centrales de Dilution

Installations fixes, **non empruntables** → collection séparée de `equipments`.

**Types clés** (`types.ts`) :
```typescript
type ComponentState = 'ok' | 1 | 2   // 0 / 1 / 2 remplacements effectués

interface CdilUnit {
  serialNumber, location, service, roomCode
  isActive, currentState?: { buse, crepine, ligne: ComponentState }
  lastVisitDate?
}

interface VisitSession {
  status: 'DRAFT' | 'COMPLETED'
  entries: VisitEntry[]   // max ~22 → bien sous la limite 1MB Firestore
}
```

**Cloud Functions** :
- `manageCdilUnit` : `CREATE` / `UPDATE` / `DEACTIVATE`
- `manageVisitSession` : `CREATE` (pré-remplit entries depuis cdilUnits actifs) / `SAVE_ENTRIES` / `COMPLETE` (batch update currentState) / `DELETE_DRAFT`

**Export CSV** : séparateur `;`, BOM UTF-8 (`﻿`), colonnes : Date · Technicien · Localisation · Service · N° Série · Buse · Crépine · Ligne aspiration · Remarques

## Composants principaux

| Composant | Rôle | Vue (`currentView`) |
|---|---|---|
| `Login` | Authentification (role picker en DEV) | — |
| `AdminPanel` | Console ADMIN (platform) | `admin` |
| `ManagementPanel` | Gestion tenant TECHNICIAN (équipements, comptes, checklists, QR, chantiers, **CDil**) | `management` |
| `Dashboard` | Suivi temps réel TECHNICIAN + CLIENT | `dashboard` |
| `TicketPanel` | Tickets maintenance TECHNICIAN | `tickets` |
| `AgentView` | Scan QR + emprunts (tous) | `agent` |
| `CdilVisitPanel` | Visites techniques CDil TECHNICIAN | `cdil` |
| `SignalementPanel` | Signalements + échanges Client↔Technicien | `signalements` |
| `EquipmentHistoryModal` | Fiche de vie équipement (timeline unifiée) | — (panneau slide-in) |

## Navigation (`Layout.tsx`)
```
ADMIN      → admin
TECHNICIAN → management, dashboard, tickets, cdil, agent, signalements
AGENT      → agent
CLIENT     → dashboard, signalements (périmètre restreint)
```

## Services / Fichiers clés

| Fichier | Rôle |
|---|---|
| `types.ts` | Tous les types TypeScript du projet |
| `services/db.ts` | Accès données : lectures Firestore directes + appels CF via `httpsCallable` |
| `services/firebaseConfig.ts` | Init Firebase, connecte aux émulateurs si `import.meta.env.DEV` |
| `functions/src/index.ts` | Toutes les Cloud Functions |
| `firestore.rules` | Règles de sécurité Firestore |
| `App.tsx` | Routing principal (`currentView` string state) |
| `components/Layout.tsx` | Shell (header, nav bottom), type `currentView` à mettre à jour avec chaque nouvelle vue |
| `hooks/useDialog.tsx` | `confirm()`, `prompt()`, `toast()` — dialog et prompts réutilisables |

## Conventions de code
- Pas de commentaires sauf si le WHY est non-évident
- Tailwind pur, jamais de CSS modules
- Labels : `font-black uppercase tracking-widest text-[10px]`
- Cartes : `rounded-[32px]` ou `rounded-[24px]`, `border border-border`, `shadow-sm`
- Couleurs sémantiques : `text-primary`, `bg-success`, `bg-danger`, `text-gray-400`
- CSV natif (`Blob` + `URL.createObjectURL`), séparateur `;`, BOM UTF-8
- Pas de bibliothèque externe si une solution native suffit
- Mutations exclusivement via Cloud Functions (jamais d'écriture client directe)

## Faits métier confirmés (CDil)
- **Installation fixe** dans un local (lieu de stockage). Peut être remplacée mais son association lieu est permanente tant qu'elle est en service.
- **Technicien** : Clean&Tech rattaché à MIKI. Une visite = un technicien.
- **Fréquence** : 2 visites périodiques / an. + interventions inopinées possibles sur demande.
- **Saisie** : au fur et à mesure, centrale par centrale, pendant la tournée.
- **Types de session** : `PERIODIQUE` (toutes les unités actives) | `INTERVENTION` (sélection d'unités)
- **Photos** : souhaitées à terme → champ `photos?: string[]` prêt dans `VisitEntry`, implémentation Firebase Storage à prévoir.
- **Export** : double usage (interne Miki + transmission client). Colonnes : Date · Type de visite · Technicien · Localisation · Service · N° Série · Buse · Crépine · Ligne aspiration · Remarques.
- **Colonnes autres machines** : à définir au cas par cas quand le patron CDil sera appliqué à d'autres équipements.

## Décisions métier confirmées — Cadrage 31/08/2026

### Traçabilité utilisation
- Chaque utilisation trace : agent, équipement, site/chantier, date, heure début, heure fin, anomalie éventuelle
- **Saisie a posteriori** autorisée : l'heure déclarée et l'heure de saisie réelle doivent être distinguées et identifiables par Admin/Technicien
- Délai max pour correction a posteriori : **à préciser avec Kimi**

### Restitution forcée
- Possible par Technicien ou Admin si l'agent ne peut plus restituer
- Tracée dans l'historique : équipement, utilisateur concerné, auteur de l'action, date, motif

### Archivage équipement
- Principe : archivage plutôt que suppression (historique conservé, réactivation possible)
- **Circuit** : Technicien → demande d'archivage → Admin → validation → archivage effectif
- Le Technicien ne peut PAS archiver directement

### Module signalements
- Créé par tous les profils (Agent, Client, Technicien) selon leur périmètre
- Fonctionne comme un espace d'échange : Client dépose, Technicien répond, Client est notifié
- Flux : `Client → Signalement → Technicien → Traitement → Réponse → Notification → Clôture → Archivage`
- Historique complet conservé (demande, réponses, dates, auteurs, statuts)
- Statuts à définir (nouveau / en cours / traité / clôturé / archivé) : **à préciser avec Kimi**
- Canal de notification : **à préciser (appli, email, ou les deux)**

### Droits Client
- Périmètre restreint : ses équipements et ses sites uniquement
- Peut voir : passages réalisés, date intervention, signalements et réponses
- Ne peut PAS voir : durée des interventions, exports
- Ne peut PAS faire : créer/modifier équipements, gérer comptes

### Exports
- Réservés à Admin et Technicien
- Filtrables : client, site/chantier, typologie machine (filtres combinables)
- Contenu minimal : ID machine, typologie, client, site, local de stockage, intervention, technicien, date, durée
- Format : **à préciser (Excel / CSV / PDF)**

### Fiche de vie équipement
- Vue historique complète par équipement : utilisations, interventions, maintenances, signalements associés, archivage/réactivation

### Points restant à arbitrer avec Kimi
- Délai max pour saisie a posteriori
- Liste exacte des champs modifiables par le Technicien
- Statuts définitifs des signalements
- Canal de notification (appli, email, ou les deux)
- Formats d'export (Excel, CSV, PDF ou plusieurs)
- Champs spécifiques par typologie de machine (au-delà des CDil)

## Backlog — Tâches planifiées

### P0 — Refactorisation structurelle ✅ TERMINÉ
- [x] **Fusion MANAGER → TECHNICIAN** — `types.ts`, `functions/src/index.ts`, `firestore.rules`, `App.tsx`, `Layout.tsx`, `services/db.ts`, `ManagementPanel.tsx`, `AdminPanel.tsx`, `Dashboard.tsx`, `TicketPanel.tsx`, `Login.tsx`, `scripts/seedEmulator.mjs`

### P1 — Fonctionnalités core ✅ TERMINÉ
- [x] **Circuit d'archivage** : `REQUEST_ARCHIVE` / `CANCEL_ARCHIVE_REQUEST` / `ARCHIVE` (admin only) / `REACTIVATE` dans CF + db.ts + UI ManagementPanel (badge ambre, boutons contextuels TECHNICIAN/ADMIN)
- [x] **Restitution forcée avec motif** : `prompt()` dans `useDialog` (textarea + required), CF `FORCE_RETURN` + log `RESTITUTION_FORCED` avec motif
- [x] **Module signalements** : `SignalementPanel`, CF `manageSignalement` — CREATE / ADD_REPLY / UPDATE_STATUS / CLOSE / ARCHIVE — statuts provisoires (NEW/IN_PROGRESS/RESOLVED/CLOSED/ARCHIVED), nav TECHNICIAN + AGENT + CLIENT
- [x] **Saisie a posteriori** : `isAPosteriori` + `declaredAt` sur `EquipmentLog`, toggle UI amber + datetime-local dans AgentView, badge dans EquipmentHistoryModal
- [x] **Anomalie constatée** : champ `userNote` optionnel sur TAKE/RETURN dans AgentView, stocké sur le log, visible dans fiche de vie + export CSV colonne Note
- [x] **Fiche de vie équipement** : `EquipmentHistoryModal` — timeline unifiée (logs + tickets + signalements), compteurs, icônes par type, bouton History sur chaque carte équipement
- [x] **Multi-sites Technicien** : `assignedSiteIds?: string[]` sur `User`, modal checkboxes dans ManagementPanel (carte TECHNICIAN), filtre sites tab + AgentView

### P2 — Espace Client ✅ TERMINÉ
- [x] **Dashboard CLIENT restreint** : `visibleEquipments` / `visibleLogs` / `visibleReports` filtrés par `user.assignedSiteIds` — métriques et tous les tabs recalculés dessus. Bandeau contextuel si vue restreinte. Panneau Checklists masqué pour CLIENT (trop technique).
- [x] **Accès CLIENT aux signalements** : déjà fonctionnel depuis P1 — CLIENT voit ses propres signalements, peut créer et répondre, ne peut pas changer les statuts.
- [x] **Durée des interventions** : `durationMinutes?` sur `EquipmentLog`, saisie manuelle dans TicketPanel (résolution), durée TAKE→RETURN calculée automatiquement — visible Admin/Technicien uniquement (`isManager` prop sur `EquipmentHistoryModal`), colonne "Durée" dans export CSV.

### P3 — Exports enrichis ✅ TERMINÉ
- [x] **Export mouvements filtrable** : nouvel onglet "Exports" dans ManagementPanel — filtres par période, chantier, typologie machine
- [x] **Champs étendus** : Date · Heure · Action · N° Référence interne · Désignation · Typologie · Local de stockage · Chantier · Technicien/Agent · A posteriori · Heure déclarée · **Durée** · Note
- [x] **Durée TAKE→RETURN** dans l'export : pré-calcul chrono des paires par équipement, colonne Durée remplie sur les lignes RETURN/FORCE_RETURN
- [x] **Format CSV** : BOM UTF-8, séparateur `;` (même pattern que CDil) — Excel/PDF restent à définir avec Kimi si besoin
- [x] **Export CDil** : lien de raccourci dans l'onglet Exports vers le tab Centrales (export par session déjà existant)

### P4 — CDil (suite)
- [x] **Upload photos dans VisitEntry** (Firebase Storage) — déjà implémenté : `storage.rules`, émulateur port 9199, `db.uploadVisitPhoto` / `db.deleteVisitPhoto`, UI complète dans CdilVisitPanel (bouton caméra + badge + modal grille + ajout multiple + suppression)
- [ ] **Patron visite+export aux autres types de machines** — en attente de décision Kimi sur quelles machines et quelles colonnes spécifiques

### En attente de décision Kimi
- Délai max saisie a posteriori (provisoire : pas de limite côté code)
- Statuts définitifs signalements (provisoires en prod : NEW/IN_PROGRESS/RESOLVED/CLOSED/ARCHIVED)
- Canal notification (appli, email, ou les deux)
- Champs exactement modifiables par le Technicien
- Format d'export (Excel/CSV/PDF)
