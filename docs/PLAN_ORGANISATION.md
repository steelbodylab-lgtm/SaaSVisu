# Plan d’organisation du repo SaaSVisu

Ce document résume l’audit du repo et la structure mise en place pour une collaboration propre et une utilisation par les agents IA.

---

## 1. Audit (état au moment de la mise en place)

### Contenu existant

- **Racine** : README, STATUS, WORKFLOW_COLLABORATION, INSTALL, USAGE_LOCAL, COMMANDES, GITHUB_SETUP, README_MAIN_ONLY, requirements.txt, .gitignore.
- **saasvisu/** : package Python (CLI, web_api, sync_engine, render_engine, templates, audio_ingest, lyrics).
- **static/** : interface web locale (HTML/CSS/JS).
- **scripts/** : dev_start.bat, dev_start.sh.
- **projects/** : dossier des projets utilisateur (contenu ignoré par Git via .gitignore).

### Ce qui manquait

- Pas de dossier `.cursor/` ni de règles pour les agents IA.
- Pas de fichier type AGENTS.md pour que les agents comprennent l’état du projet sans l’historique du chat.
- Pas d’index central pour la documentation (plusieurs fichiers à la racine, pas de lien explicite entre eux).

---

## 2. Décisions prises

- **Ne pas déplacer** les fichiers existants : tout reste à la racine pour garder les habitudes et éviter les chemins cassés.
- **Ajouter** un dossier `docs/` avec un index (README.md) qui pointe vers les docs existantes.
- **Ajouter** `.cursor/rules/projet-saasvisu.mdc` : contexte SaaSVisu, français, pas SaaSMix, toujours appliqué.
- **Ajouter** `AGENTS.md` à la racine : état du projet, où lire STATUS/README, consignes pour les agents, suivi des tâches.
- **Centraliser** le suivi fait/à faire dans STATUS.md (déjà existant) et le référencer depuis README, docs et AGENTS.md.

---

## 3. Structure mise en place

| Élément | Rôle |
|--------|------|
| **docs/README.md** | Index de la documentation (liens vers tous les docs). |
| **docs/PLAN_ORGANISATION.md** | Ce fichier : audit + plan d’organisation. |
| **.cursor/rules/projet-saasvisu.mdc** | Règle Cursor : contexte projet, langue française, pas SaaSMix. |
| **AGENTS.md** | Consignes pour les agents IA, liens vers STATUS et doc. |
| **README.md** | Section « Documentation » ajoutée (liens vers STATUS, workflow, docs, AGENTS). |
| **STATUS.md** | Ligne ajoutée : doc + workflow + AGENTS considérés comme en place. |

---

## 4. Utilisation

- **Développeur** : README pour démarrer, STATUS pour l’état, WORKFLOW_COLLABORATION pour Git.
- **Agent IA** : lire AGENTS.md et STATUS.md (et les derniers commits) pour comprendre l’état ; la règle `.cursor/rules/projet-saasvisu.mdc` s’applique automatiquement.
- **Documentation** : tout est listé dans docs/README.md.

---

*Rédigé lors de la mise en place de la structure projet/collaboration/agents.*
