# Documentation — SaaSVisu

Index de la documentation du projet. Tout est rédigé en **français**.

---

## À la racine du repo

| Fichier | Rôle |
|--------|------|
| [../README.md](../README.md) | Présentation, prérequis, utilisation (CLI + API) |
| [../STATUS.md](../STATUS.md) | **État du projet** : ce qui est fait / ce qui reste à faire |
| [../AGENTS.md](../AGENTS.md) | Consignes pour les agents IA et suivi des tâches |
| [../WORKFLOW_COLLABORATION.md](../WORKFLOW_COLLABORATION.md) | Git : pull/push, branche `master`, résolution de conflits |

---

## Installation et utilisation

| Fichier | Rôle |
|--------|------|
| [../INSTALL.md](../INSTALL.md) | Installation (Python, FFmpeg, venv, dépendances) |
| [../USAGE_LOCAL.md](../USAGE_LOCAL.md) | Utilisation en local (CLI pas à pas) |
| [../COMMANDES.md](../COMMANDES.md) | Commandes terminal (résumé rapide) |

---

## Configuration et déploiement

| Fichier | Rôle |
|--------|------|
| [../GITHUB_SETUP.md](../GITHUB_SETUP.md) | Mise en place du dépôt GitHub et push depuis Cursor |
| [../README_MAIN_ONLY.md](../README_MAIN_ONLY.md) | Rappel : branche de travail = `master` |

---

## Structure du code

- **`saasvisu/`** — Package Python : CLI, API web, moteur de sync, rendu vidéo, templates.
- **`static/`** — Interface web locale (HTML/CSS/JS).
- **`scripts/`** — Scripts de démarrage (dev_start.bat, dev_start.sh).
- **`projects/`** — Projets utilisateur (audio, fond, paroles, sync.json, output.mp4) — contenu ignoré par Git.

Pour le détail des tâches et l’état actuel, voir ** [STATUS.md](../STATUS.md) ** et ** [AGENTS.md](../AGENTS.md) **.
