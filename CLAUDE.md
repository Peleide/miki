# MIKI — Documentation Projet

> **Branche `csp`** : GMAO sur mesure pour la CSP (Calédonienne de Services Publics), niveau 1, **sans aucune
> interconnexion** avec leurs outils (Sage, Yooz, Navitec) et sans reprise des fichiers Excel existants.
> Voir la section « GMAO CSP » ci-dessous ; le reste du document décrit le socle Miki hérité de `vivian`.

## GMAO CSP (branche `csp`)

### Démarrer
```bash
# Démo sans Firebase (toute la logique tourne dans le navigateur, données fictives en localStorage)
npm run dev            # puis http://localhost:3000/?demo
# Tests de la logique métier (sans émulateur)
cd functions && npm test
# Émulateurs : après `firebase emulators:start`
node scripts/seedCsp.mjs   # tenant `csp`, comptes resp@ / tech1@ / tech2@ / tech3@ / demandeur@csp.test (password123)
```

### Activation par organisation
L'interface GMAO s'affiche pour une organisation si `tenants/{id}.modules.gmao == true` (à poser dans la console
Firestore, le seed le fait pour `csp`). Les autres organisations gardent l'interface Miki classique : la branche peut
donc être déployée sans casser les autres clients. **Recommandé quand même : un projet Firebase dédié à la CSP.**

### Architecture
| Fichier | Rôle |
|---|---|
| `functions/src/gmao/model.ts` | Types, libellés, référentiels (familles EN/BEN/VL/RE/PL/IF/QAV, sociétés CSP/SAMERTOWN/CDV, types d'intervention, priorités P1–P4). **Partagé front / back.** |
| `functions/src/gmao/rules.ts` | Règles pures : priorité suggérée, échéances préventives, disponibilité, coûts. |
| `functions/src/gmao/core.ts` | `handleGmaoAction(ctx, action, payload)` : **toutes** les mutations + permissions par rôle. Effets (notifications, audit) renvoyés dans `ctx.effects`. |
| `functions/src/gmao/firestoreStore.ts` / `memoryStore.ts` | Stockage Firestore (prod) / mémoire (démo, tests). |
| `functions/src/gmao/seed.ts` | Jeu de démo CSP, rejoue ~90 jours d'activité via `handleGmaoAction`. |
| `functions/src/index.ts` (fin) | Cloud Functions `gmaoAction` (callable unique) et `gmaoDailyPreventiveScan` (05:00 Nouméa, nécessite le plan Blaze). |
| `services/gmao/*` | `GmaoBackend` : `firebaseBackend` (callable + `onSnapshot`) ou `demoBackend` (même cœur, en mémoire). |
| `components/gmao/*` | `GmaoShell` (navigation par rôle), vues `Dashboard`, `Planning`, `WorkOrders`, `Requests`, `Preventive`, `Assets`, `Terrain`, `Settings`. |

Le front importe `functions/src/gmao/*` directement (Vite). `functions/lib` est versionné : **rebuild après chaque
modification** (`cd functions && npm run build`).

### Rôles
| Rôle Miki | Rôle GMAO | Droits |
|---|---|---|
| ADMIN / TECHNICIAN | Responsable maintenance | Tout : approuve les DI, crée/planifie les BT, gammes, planning, réglages, comptes |
| AGENT | Technicien | Son planning, démarre / clôture **ses** BT, relevés compteur, état machine, DI |
| CLIENT | Demandeur / direction | Crée des DI, suit leur état, consulte parc et tableau de bord |

### Collections Firestore (`tenants/{tenantId}/…`)
`gmaoAssets` (arborescence équipement > sous-équipement > composant via `parentId`), `gmaoAssetEvents` (états et
relevés, base des indicateurs), `gmaoRequests` (DI), `gmaoWorkOrders` (BT), `gmaoPmPlans` (gammes + `schedule` par
équipement), `gmaoTasks` (tâches, congés, formations du planning), `checklists` (partagée, `kind` MAINTENANCE /
SECURITE), `sites`, `counters/gmao` (numéros DI-AAAA-NNNN / BT-AAAA-NNNN). Réglages : champ `gmao` du document tenant
(`hourlyRate`, `safetyChecklistId`). Fichiers : Storage `tenants/{id}/gmao/**` (membres du tenant, 20 Mo max).

### Flux
- **DI** `A_APPROUVER → APPROUVEE → PLANIFIEE → CLOTUREE` (ou `ANNULEE`). Priorité suggérée : sécurité ou arrêt → P1 ;
  réglementaire ou dégradé → P2 ; sans impact → P3 ; confort → P4. L'état déclaré dégrade l'état de la machine.
- **BT** `A_PLANIFIER → PLANIFIE → EN_COURS → CLOTURE` (+ `EN_ATTENTE`, `ANNULE`). Démarrage bloqué si la check-list
  de sécurité (Take 5 / permis feu) a un point « Non ». Clôture : rapport obligatoire, check-list, coûts, état machine.
- **Préventif** : calendaire (jours/semaines/mois) ou compteur (h / km). BT créé à `échéance − alerte`, un seul BT
  ouvert par gamme × équipement ; clôture → prochaine échéance depuis la date réelle ; annulation → occurrence sautée.
- **Disponibilité** : le mode dégradé compte comme disponible (CDC 4.1.2).

### Hors périmètre (volontairement, niveau 1)
Stock de pièces, achats, fournisseurs, budgets, prises de mesures hors compteur, interfaces Sage / Yooz / Navitec,
reprise Dimo Maint / Excel, hors-ligne, saisie vocale.

### Limites connues
- Les règles Firestore laissent tout membre du tenant lire les coûts (masqués dans l'interface du demandeur seulement).
- Un admin plateforme n'est pas proposé comme intervenant (non listé dans les comptes du tenant).
- L'émulateur Firestore n'a pas pu être lancé dans l'environnement de développement initial : la logique est testée
  (unitaire + Firestore simulé + parcours navigateur en mode démo), mais un passage complet sur émulateurs reste à faire.

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
