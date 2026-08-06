# MIKI — Audit UX & Améliorations interface

> Suivi des problèmes identifiés, des correctifs appliqués et des points restants.  
> Dernière révision : 2026-08-06

---

## Légende

- ✅ Corrigé
- 🔄 En cours / chantier identifié
- ❌ Non traité (priorité basse ou besoin à confirmer)

---

## Correctifs appliqués

### AgentView (Vue agent / scan QR)

| Problème | Correction | Statut |
|----------|------------|:------:|
| Filtre par marque seul — impossible de trouver rapidement un équipement | Remplacé par : champ de recherche textuelle (nom, marque, modèle, n° série, lieu) + filtre par type d'équipement | ✅ |
| "Chantier (Destination)" — label vague en contexte hospitalier | Renommé "Site de destination" | ✅ |
| Message d'erreur caméra non actionnable ("Vérifiez les autorisations") | Ajout d'instructions pas-à-pas pour autoriser la caméra dans les paramètres navigateur | ✅ |
| Bouton "Relancer Caméra" après erreur | Renommé "Réessayer" (plus naturel) | ✅ |

### Dashboard

| Problème | Correction | Statut |
|----------|------------|:------:|
| "Objets & Suivi" — onglet au nom ambigu | Renommé "Équipements" | ✅ |
| "Historique Global" — "global" sans contexte | Renommé "Mouvements" | ✅ |
| "Visite Technique" — terme technique, valeur vide affichée "Non" | Renommé "Maintenance préventive" + sous-titre "Dernier passage technique" + valeur vide → "—" | ✅ |
| "Réparation" — pas de contexte sur quand c'est renseigné | Renommé "Dernière réparation" + sous-titre "Suite à incident ou ticket" + valeur vide → "—" | ✅ |

### ManagementPanel

| Problème | Correction | Statut |
|----------|------------|:------:|
| "BLOQUANT (NON = TICKET)" dans checklists — incompréhensible | Renommé "NON → crée un incident" | ✅ |
| "Délai min. entre 2 scans (secondes)" — jargon technique | Renommé "Délai minimum entre 2 emprunts (secondes)" | ✅ |
| "Max scans par fenêtre" | Renommé "Nb max d'emprunts par période" | ✅ |
| "Fenêtre (secondes)" | Renommé "Durée de la période (secondes)" | ✅ |
| "Nom auto-généré" sans explication | Renommé "Identifiant généré automatiquement" + texte explicatif : "Cet identifiant est imprimé sur le QR code. Le numéro d'ordre final sera attribué à l'enregistrement." | ✅ |

### CdilVisitPanel

| Problème | Correction | Statut |
|----------|------------|:------:|
| "Brouillon" — terme technique | Renommé "En cours" | ✅ |
| "Clôturée" — terme juridique peu naturel | Renommé "Terminée" | ✅ |

### TicketPanel

| Problème | Correction | Statut |
|----------|------------|:------:|
| "Pris par un autre technicien" — bouton grisé sans guidance | Ajout d'un sous-texte : "Contactez votre responsable si nécessaire" | ✅ |

---

## Points restants

### Importants

| Problème | Composant | Notes |
|----------|-----------|-------|
| "Catégorie" vs "Type" — deux mots pour le même concept dans le formulaire équipement | ManagementPanel | À clarifier avec le métier avant de renommer |
| "Créer plusieurs exemplaires (Unitaires)" vs "Gérer en lot" — distinction pas évidente | ManagementPanel | Ajouter une phrase explicative sous chaque option |
| "Pris par un autre technicien" — pas de nom affiché | TicketPanel | Nécessite de stocker `assignedToName` dans le ticket (chantier CF) |
| Passage vers checklist inattendu au clic "Marquer résolu" | TicketPanel | Afficher la liste des vérifications requises avant le clic |
| Grille de saisie CDil non utilisable sur mobile (scroll horizontal) | CdilVisitPanel | Refonte responsive — layout en cartes empilées sur petit écran |

### Mineurs

| Problème | Composant | Notes |
|----------|-----------|-------|
| Notifications non groupées par type (WARNING / CRITICAL / INFO) | Layout | Groupement chronologique suffisant pour l'instant |
| "SCAN" dans la navigation — peut évoquer autre chose que QR code | Layout | Envisager "QR / SCAN" ou icône seule |
| États `ok/1/2` des centrales CDil non expliqués dans le widget Dashboard | Dashboard | Ajouter légende inline (identique à CdilVisitPanel) |
| Badge "En cours d'utilisation" redondant avec bordure colorée | AgentView | Cosmétique, non prioritaire |
| Priorités ticket (LOW/MEDIUM/HIGH/CRITICAL) sans définition | TicketPanel | Ajouter un tooltip ou un guide de choix |

---

## Chantiers liés (voir aussi ROLES_PERMISSIONS.md)

- 🔄 **Restitution forcée MANAGER** — permettre de remettre un équipement à "Disponible" depuis le ManagementPanel sans scan QR
- 🔄 **Multi-tenant TECHNICIAN** — un technicien accède à plusieurs établissements avec un seul compte
- 🔄 **Responsive CDil mobile** — refonte de la grille de saisie pour usage terrain sur téléphone
