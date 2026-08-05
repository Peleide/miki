# MIKI — Rôles & Permissions

> Document de référence. À mettre à jour à chaque évolution du périmètre des droits.  
> Dernière révision : 2026-08-06

---

## Hiérarchie des rôles

```
ADMIN (plateforme)
  └── MANAGER (tenant)
        └── TECHNICIAN (tenant)
              └── AGENT (tenant)
                    └── CLIENT (tenant, lecture seule)
```

Un rôle hérite des droits des rôles inférieurs **sauf ADMIN → MANAGER** : l'ADMIN est global (multi-tenant), le MANAGER est limité à son tenant.

---

## Synthèse par rôle

### ADMIN
- **tenantId** : `platform`
- **Accès** : tous les tenants, console super-admin
- **Spécificités** :
  - Seul à pouvoir lire les `audit_logs`
  - Peut créer/suspendre des tenants
  - Bypass automatique de toutes les gardes `verifyAccess`
  - Peut modifier n'importe quel utilisateur, y compris d'autres MANAGERs

### MANAGER
- **tenantId** : tenant réel
- **Accès** : son tenant uniquement
- **Spécificités** :
  - Ne peut **pas** modifier un ADMIN plateforme (protection côté CF)
  - Gère équipements, utilisateurs, checklists, sites, CDil, paramètres tenant
  - Reçoit les notifications de maintenance et d'incidents

### TECHNICIAN
- **tenantId** : tenant réel
- **Accès** : son tenant uniquement
- **Spécificités** :
  - Peut changer le statut des tickets (pas les archiver)
  - Gère les visites CDil (CREATE, SAVE, COMPLETE, DELETE_DRAFT)
  - Peut créer et modifier des unités CDil
  - Reçoit les notifications d'incidents

### AGENT
- **tenantId** : tenant réel
- **Accès** : scan QR uniquement
- **Spécificités** :
  - Seule action disponible : `processEquipmentScan` (TAKE / RETURN / REPORT)
  - Peut soumettre des réponses de checklist (déclenche un incident si échec)
  - Pas d'accès à la gestion, aux tickets ni aux CDil

### CLIENT
- **tenantId** : tenant réel
- **Accès** : dashboard en lecture seule
- **Spécificités** :
  - Aucune Cloud Function accessible
  - Firestore : lecture autorisée sur `tenants/{tenantId}/**`
  - Pas de barre de navigation, pas d'actions

---

## Navigation (vues accessibles)

| Vue | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|-----|:-----:|:-------:|:----:|:-----:|:------:|
| Console Admin (`admin`) | ✅ | — | — | — | — |
| Gestion (`management`) | — | ✅ | — | — | — |
| Dashboard (`dashboard`) | — | ✅ | — | — | ✅ |
| Tickets (`tickets`) | — | ✅ | ✅ | — | — |
| Visites CDil (`cdil`) | — | ✅ | ✅ | — | — |
| Scan QR (`agent`) | — | ✅ | ✅ | ✅ | — |

---

## Matrice Cloud Functions

### Équipements

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Scan — TAKE (emprunter) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Scan — RETURN (restituer) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Scan — REPORT (signaler) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Scan — INTERVENTION (résoudre maintenance) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Créer équipement | ✅ | ✅ | ❌ | ❌ | ❌ |
| Modifier équipement | ✅ | ✅ | ❌ | ❌ | ❌ |
| Archiver équipement | ✅ | ✅ | ❌ | ❌ | ❌ |
| Renouveler QR code | ✅ | ✅ | ❌ | ❌ | ❌ |
| Supprimer log d'équipement | ✅ | ✅ | ❌ | ❌ | ❌ |

### Utilisateurs

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer utilisateur | ✅ | ✅ | ❌ | ❌ | ❌ |
| Modifier utilisateur | ✅ | ✅ | ❌ | ❌ | ❌ |
| Désactiver / réactiver | ✅ | ✅ | ❌ | ❌ | ❌ |
| Réinitialiser mot de passe | ✅ | ✅ | ❌ | ❌ | ❌ |
| Modifier un ADMIN plateforme | ✅ | ❌ | ❌ | ❌ | ❌ |

### Structures (tenant, sites, types)

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer tenant | ✅ | ❌ | ❌ | ❌ | ❌ |
| Modifier paramètres tenant | ✅ | ✅ | ❌ | ❌ | ❌ |
| Créer / modifier / archiver site | ✅ | ✅ | ❌ | ❌ | ❌ |
| Créer / archiver type d'équipement | ✅ | ✅ | ❌ | ❌ | ❌ |

### Tickets & Incidents

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer un ticket | ✅ | ✅ | ✅ | ✅ | ❌ |
| Changer statut ticket (En cours / Résolu) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assigner ticket / note de résolution | ✅ | ✅ | ✅ | ❌ | ❌ |
| Archiver ticket | ✅ | ✅ | ❌ | ❌ | ❌ |

### Checklists

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer / modifier / archiver checklist | ✅ | ✅ | ❌ | ❌ | ❌ |
| Soumettre réponses checklist | ✅ | ✅ | ✅ | ✅ | ❌ |

### Centrales CDil

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Créer unité CDil | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modifier unité CDil | ✅ | ✅ | ✅ | ❌ | ❌ |
| Désactiver unité CDil | ✅ | ✅ | ✅ | ❌ | ❌ |
| Créer session de visite | ✅ | ✅ | ✅ | ❌ | ❌ |
| Enregistrer avancement (SAVE_ENTRIES) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Clôturer session (COMPLETE) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Supprimer brouillon | ✅ | ✅ | ✅ | ❌ | ❌ |
| Exporter CSV session | ✅ | ✅ | ✅ | ❌ | ❌ |

### Audit & Observabilité

| Action | ADMIN | MANAGER | TECH | AGENT | CLIENT |
|--------|:-----:|:-------:|:----:|:-----:|:------:|
| Lire les audit_logs | ✅ | ❌ | ❌ | ❌ | ❌ |
| Être tracé dans les audit_logs | ✅ | ✅ | ✅ | ✅ | ❌ |
| Recevoir les notifications app | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## Règles Firestore (résumé)

| Chemin | Lecture | Écriture |
|--------|---------|----------|
| `users/{userId}` | Authentifié + (soi-même OU Manager+) | ❌ CF uniquement |
| `users/{userId}/notifications/{id}` | Soi-même uniquement | ❌ CF uniquement |
| `tenants/{tenantId}` | Authentifié + accès tenant | ❌ CF uniquement |
| `tenants/{tenantId}/**` | Authentifié + accès tenant | ❌ CF uniquement |
| `audit_logs/{id}` | ADMIN plateforme uniquement | ❌ Serveur uniquement |

**Principe général** : aucune écriture directe client vers Firestore. Toutes les mutations passent par les Cloud Functions.

---

## Comportements automatiques (effets de bord)

| Déclencheur | Effet automatique |
|-------------|-------------------|
| Scan RETURN + seuil d'usages atteint | Ticket de maintenance préventive créé, notifications MANAGER + TECH |
| Ticket créé | Notifications MANAGER + ADMIN + TECH |
| Ticket résolu | Mise à jour `lastVisiteTechniqueDate` ou `lastReparationDate` sur l'équipement |
| Checklist échouée | Incident créé automatiquement, notification CRITICAL |
| Session CDil COMPLETE | `currentState` + `lastVisitDate` mis à jour sur chaque unité visitée |
| Création utilisateur | `mustChangePassword = true`, mot de passe provisoire généré |

---

## Zones d'évolution identifiées

- [ ] **CLIENT** : rôle défini mais sans aucune CF accessible — à préciser si des actions légères sont souhaitées (ex : soumettre un incident)
- [ ] **TECHNICIAN et CDil CREATE** : le TECH peut créer des unités CDil — à valider si ce périmètre est voulu ou s'il doit être restreint au MANAGER
- [ ] **Photos CDil** : upload Firebase Storage autorisé à tout utilisateur authentifié (règle large) — à resserrer si besoin
- [ ] **Patron visite autres équipements** : colonnes métier à définir avant d'étendre le système CDil
- [ ] **Notifications CLIENT** : non implémenté — à décider
