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

## Description des rôles

---

### ADMIN

**Qui est-ce ?**
L'administrateur de la plateforme MIKI. Il n'appartient à aucun tenant client — son tenant est `platform`. En pratique, c'est l'équipe Clean&Tech qui opère MIKI.

**Ce qu'il peut faire**
L'ADMIN a un accès illimité à l'ensemble de la plateforme. Il crée et configure les tenants clients (hôpitaux, cliniques), peut suspendre un tenant, et consulte le journal d'audit complet de toutes les actions réalisées sur la plateforme. Il peut intervenir sur n'importe quel compte utilisateur, quel que soit son rôle ou son tenant.

**Ce qu'il ne peut pas faire**
Rien de bloqué côté système. L'ADMIN est le niveau d'accès maximum.

**Questions ouvertes**
- L'ADMIN doit-il avoir accès aux données métier des tenants (équipements, tickets, visites CDil) ou uniquement à la couche d'administration ? Actuellement il y a accès — est-ce souhaité ?
- Faut-il un log d'audit des actions de l'ADMIN lui-même, séparé des actions tenant ?
- Un seul ADMIN suffit-il ou faut-il prévoir plusieurs comptes ADMIN distincts (ex : un par collaborateur Clean&Tech) ?

---

### MANAGER

**Qui est-ce ?**
Le responsable opérationnel côté client — typiquement un chef de service, un référent matériel ou un coordinateur logistique au sein de l'établissement. Il a la main sur tout ce qui concerne son établissement.

**Ce qu'il peut faire**
Le MANAGER administre l'intégralité de son tenant : il crée et modifie les équipements, gère les comptes utilisateurs (création, désactivation, réinitialisation de mot de passe), configure les checklists, les chantiers et les paramètres du tenant (fuseau horaire, quotas, sécurité). Il suit les emprunts et les incidents via le dashboard, traite les tickets, peut clôturer et archiver. Il pilote aussi les centrales CDil : configuration des unités, consultation de l'historique des visites et export CSV.

**Ce qu'il ne peut pas faire**
Il ne peut pas modifier un compte ADMIN plateforme. Il n'a pas accès aux audit_logs complets (réservés à l'ADMIN). Il ne peut pas créer de nouveaux tenants.

**Questions ouvertes**
- Le MANAGER doit-il pouvoir supprimer définitivement des équipements, ou uniquement archiver ? Aujourd'hui seul l'archivage est possible.
- Faut-il distinguer un rôle "MANAGER lecture seule" (chef de service qui consulte sans modifier) d'un "MANAGER admin" (qui gère les comptes) ? Aujourd'hui il n'y a qu'un seul niveau MANAGER.
- Le MANAGER peut-il voir les données d'un autre tenant si un utilisateur appartient à plusieurs ? À clarifier pour les organisations multi-sites.

---

### TECHNICIAN

**Qui est-ce ?**
Le technicien de terrain Clean&Tech rattaché à MIKI. Il intervient physiquement sur les équipements et les centrales CDil. Il peut être amené à se déplacer sur plusieurs établissements.

**Ce qu'il peut faire**
Le TECHNICIAN gère les tickets de maintenance : il change leur statut (En cours, Résolu), s'assigne des tickets et renseigne des notes de résolution. C'est lui qui réalise les visites techniques CDil : il crée les sessions (périodiques ou interventions inopinées), saisit l'état de chaque centrale au fil de la tournée, et clôture la session une fois terminée. Il peut aussi créer et modifier les unités CDil. En parallèle, il peut scanner des QR codes pour emprunter ou restituer des équipements, et soumettre des checklists.

**Ce qu'il ne peut pas faire**
Il ne peut pas archiver de tickets (action MANAGER). Il n'a pas accès à la gestion des comptes utilisateurs, des équipements (création/modification/archivage), ni aux paramètres du tenant.

**Questions ouvertes**
- Le TECHNICIAN doit-il pouvoir **créer et modifier des unités CDil**, ou uniquement réaliser des visites sur des unités déjà configurées par le MANAGER ? Actuellement il le peut — ce périmètre est-il voulu ?
- Un technicien intervient parfois sur plusieurs établissements. Faut-il lui permettre de basculer entre plusieurs tenants, comme l'ADMIN le fait ? Aujourd'hui ce n'est pas possible.
- Faut-il que le TECHNICIAN puisse clôturer un ticket sans passer par le MANAGER, ou la résolution doit-elle toujours être validée par un MANAGER ?

---

### AGENT

**Qui est-ce ?**
L'utilisateur de terrain au sein de l'établissement client — aide-soignant, agent de service, logisticien. Son usage de MIKI se résume à l'emprunt et la restitution de matériel via QR code.

**Ce qu'il peut faire**
L'AGENT scanne un QR code d'équipement et peut l'emprunter (TAKE), le restituer (RETURN) ou signaler un problème (REPORT qui déclenche un ticket). Il peut également soumettre des réponses à une checklist avant une prise d'équipement. C'est tout.

**Ce qu'il ne peut pas faire**
Il n'a accès à aucune vue de gestion. Il ne voit pas les tickets, ne consulte pas le dashboard, n'interagit pas avec les CDil. Il ne reçoit pas de notifications.

**Questions ouvertes**
- L'AGENT doit-il recevoir une confirmation visuelle ou une notification après un emprunt/restitution réussi, au-delà du toast actuel ?
- Faut-il permettre à l'AGENT de voir l'historique de ses propres emprunts ?
- Un AGENT peut-il signaler un problème sans emprunter l'équipement (REPORT direct sur un équipement AVAILABLE) ? Actuellement oui — est-ce souhaité ?
- Un AGENT emprunte un équipement : que se passe-t-il s'il n'a pas le téléphone pour le restituer ? Y a-t-il un process de restitution forcée par un MANAGER ?

---

### CLIENT

**Qui est-ce ?**
Un décideur ou observateur côté établissement client — directeur, référent qualité, acheteur — qui a besoin de visibilité sur le parc sans intervenir dessus.

**Ce qu'il peut faire**
Le CLIENT accède uniquement au dashboard en lecture seule : il voit les métriques du parc (taux d'utilisation, équipements en service/maintenance), le flux des emprunts/restitutions, et l'état des équipements. Depuis la dernière évolution, il voit aussi le widget des centrales CDil si des unités sont actives.

**Ce qu'il ne peut pas faire**
Il ne peut exécuter aucune action — pas d'emprunt, pas de ticket, pas de signalement. Il n'a pas de barre de navigation. Il ne reçoit aucune notification.

**Questions ouvertes**
- Le CLIENT doit-il pouvoir **soumettre un incident** (ex : signaler un dysfonctionnement constaté lors d'une visite) ? Ce serait une action légère sans accès à la gestion.
- Faut-il lui donner accès à un **export** des données du dashboard (PDF ou CSV de synthèse mensuelle) ?
- Le CLIENT voit actuellement toutes les données du tenant — faut-il restreindre sa vue à certains services ou catégories d'équipements seulement ?
- Y a-t-il un besoin de **notifications passives** pour le CLIENT (ex : alerte si le taux de maintenance dépasse un seuil) ?

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
