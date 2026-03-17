# Consignes pour les agents IA — SaaSVisu

Ce fichier permet aux agents de comprendre l’état du projet et comment travailler **sans dépendre de l’historique du chat**. À mettre à jour au fil des évolutions.

---

## 1. Contexte projet

- **Nom** : SaaSVisu — générateur automatique de lyric videos.
- **Stack** : Python 3.10+, FastAPI (API locale), FFmpeg (rendu), CLI + interface web statique.
- **Langue** : tout en français (Max ne parle pas anglais).
- **Séparation** : ne jamais mélanger avec le projet SaaSMix.

---

## 2. Où trouver l’état actuel

| Fichier | Usage |
|--------|--------|
| **STATUS.md** | Ce qui est fait ✅ et ce qui manque ❌ (fonctionnalités, intégrations). |
| **README.md** | Vue d’ensemble, prérequis, utilisation CLI/API. |
| **docs/README.md** | Index de toute la documentation. |
| **Derniers commits** | Pour voir les changements récents et l’état réel du code. |

---

## 3. Structure du repo (à préserver)

- **`saasvisu/`** — Cœur Python : `cli.py`, `web_api/`, `sync_engine/`, `render_engine/`, `templates/`, `audio_ingest.py`, `lyrics.py`.
- **`static/`** — Interface web locale (index.html, app.js, style.css).
- **`scripts/`** — Démarrage dev (dev_start.bat, dev_start.sh).
- **`projects/`** — Données utilisateur (un dossier par projet ; contenu ignoré par Git).
- **Racine** — README, STATUS, AGENTS, WORKFLOW_COLLABORATION, INSTALL, USAGE_LOCAL, COMMANDES, GITHUB_SETUP, requirements.txt, .gitignore.

---

## 4. Workflow collaboration (humains)

- Une seule branche de travail : **`master`**.
- Avant de commencer : `git pull origin master`.
- Avant de pousser : commit puis `git pull origin master` puis `git push origin master`.
- Détails : **WORKFLOW_COLLABORATION.md**.

---

## 5. Consignes pour les agents

1. **Lire en priorité** : STATUS.md, AGENTS.md (ce fichier), et les derniers commits pour comprendre l’état actuel.
2. **Ne pas inventer** de contexte venant d’un autre projet (ex. SaaSMix).
3. **Répondre et documenter en français**.
4. **Proposer des changements** cohérents avec la structure existante ; ne pas réorganiser inutilement les dossiers déjà en place.
5. Après des changements importants (nouvelles features, refactos), mettre à jour **STATUS.md** (et ce fichier si besoin) pour que le prochain agent ou développeur reparte sur une base à jour.
6. **Quand on demande à l’utilisateur de redémarrer le serveur**, toujours lui donner la commande exacte dans la réponse, par exemple :  
   `cd "c:\Users\frede\OneDrive\Bureau\saas visu"; .\run.ps1`  
   (ou avec uvicorn + --reload si pertinent). Ne jamais oublier d’envoyer le code/commande.

---

## 6. Suivi des tâches (fait / à faire)

Le suivi détaillé des **fonctionnalités** (fait / à faire) est dans **STATUS.md**.

Ici, on peut lister des **tâches ponctuelles** ou **décisions** à ne pas oublier :

- *(Rien pour l’instant — à remplir au besoin.)*

---

*Dernière mise à jour : mise en place de la structure docs + workflow + consignes agents.*
