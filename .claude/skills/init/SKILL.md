---
description: Initialise le contexte de session pour le projet MIKI — lit la doc, l'état git et les mémoires persistantes, puis donne un résumé actionnable.
---

# /init — Initialisation de session MIKI

Quand l'utilisateur tape `/init`, tu dois :

## 1. Lire la documentation du projet
Lis `CLAUDE.md` à la racine du projet. C'est la source de vérité sur la stack, l'architecture, les patterns et les conventions.

## 2. Lire l'état git
Exécute ces commandes en parallèle :
- `git status` — changements non commités
- `git log --oneline -10` — les 10 derniers commits
- `git branch` — branche courante

## 3. Lire les mémoires persistantes
Lis le fichier `MEMORY.md` dans le répertoire mémoire du projet (`C:\Users\vuedr\.claude\projects\C--Users-vuedr-Projet-Miki-miki\memory\MEMORY.md`), puis lis les fichiers mémoire référencés qui semblent pertinents pour la session.

## 4. Donner un résumé actionnable

Présente à l'utilisateur :

```
## État du projet MIKI

**Branche** : <nom de la branche>
**Derniers commits** : <les 3-5 derniers, condensés>
**Changements en cours** : <fichiers modifiés non commités, ou "Propre">

### Contexte rapide
<2-3 phrases sur ce que le projet fait et où en est le développement>

### Ce qui a été livré récemment
<bullet points depuis les commits récents>

### Points d'attention / en cours
<éléments notables des mémoires ou de l'état git>
```

Sois bref et direct. L'objectif est de mettre l'utilisateur en situation de travailler immédiatement, pas de faire un rapport exhaustif.
