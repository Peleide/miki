# MIKI — Documentation Projet

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
# Auth:9099 | Functions:5001 | Firestore:8080

# 3. Frontend (autre terminal)
npm run dev   # http://localhost:5173
```

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
`ADMIN > MANAGER > TECHNICIAN > AGENT > CLIENT`

| Rôle | tenantId | Accès |
|---|---|---|
| ADMIN | `platform` | Console super-admin, audit_logs, tous les tenants |
| MANAGER | tenant réel | Gestion équipements, users, CDil, dashboard |
| TECHNICIAN | tenant réel | Tickets, visites CDil, scan QR |
| AGENT | tenant réel | Scan QR, emprunts |
| CLIENT | tenant réel | Dashboard lecture seule |

## Pattern Cloud Functions

```typescript
// Garde obligatoire sur toutes les CF
const { user, tenantId } = await verifyAccess(data, context, ['MANAGER', 'ADMIN']);

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
EQUIPMENT_CREATED  EQUIPMENT_UPDATED  EQUIPMENT_ARCHIVED
TENANT_CREATED  TENANT_UPDATED
TICKET_STATUS_CHANGED  TICKET_ARCHIVED
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
| `Login` | Authentification | — |
| `AdminPanel` | Console ADMIN (platform) | `admin` |
| `ManagementPanel` | Gestion tenant MANAGER (équipements, comptes, checklists, QR, chantiers, **centrales CDil**) | `management` |
| `Dashboard` | Suivi temps réel MANAGER + CLIENT | `dashboard` |
| `TicketPanel` | Tickets maintenance TECHNICIAN + MANAGER | `tickets` |
| `AgentView` | Scan QR + emprunts (tous) | `agent` |
| `CdilVisitPanel` | Visites techniques CDil TECHNICIAN + MANAGER | `cdil` |

## Navigation (`Layout.tsx`)
```
ADMIN      → admin
MANAGER    → management, dashboard, tickets, agent
TECHNICIAN → tickets, cdil (VISITES), agent
AGENT      → agent
CLIENT     → dashboard
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

## Prochaines évolutions prévues
- Upload photos dans VisitEntry (Firebase Storage)
- Appliquer le patron visite+export aux autres équipements/services
- Rapport/bilan structuré (PDF ou Excel enrichi)
