# Saas Visu — Lyric Video Generator (local)

Outil **local** pour générer des visualizers : **photo ou vidéo** + **audio** + **paroles** → une vidéo MP4.  
Pas d’interface web pour l’instant : tout se fait en **ligne de commande (CLI)**.  
Voir `PLAN_PROJET_SAAS_VISU.md` sur le Bureau pour le plan détaillé.

## Prérequis

- **Python 3.10+**
- **FFmpeg** (dans le PATH)

## Installation (une fois)

```powershell
cd C:\Users\frede\saas-visu
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

## Utilisation en local (CLI)

Guide pas à pas en CLI : **USAGE_LOCAL.md**

**Interface locale (recommandé pour tester)** : lance l’API puis ouvre le navigateur :

```powershell
python -m saasvisu.web_api.main
```

Ouvre **http://localhost:8000** : une page avec boutons pour chaque étape (créer projet, upload audio, upload fond, paroles, synchro, rendu) et un lecteur vidéo pour le résultat.

En bref :

1. `python -m saasvisu.cli init-project --name "Mon titre"` → crée un projet (note l’id).
2. Copier l’**audio** dans `projects\<id>\audio\track.mp3`.
3. Copier la **photo ou vidéo** de fond dans `projects\<id>\background.jpg` (ou `.mp4`).
4. Créer `projects\<id>\lyrics.txt` (une ligne = une phrase).
5. `python -m saasvisu.cli sync --audio projects\<id>\audio\track.mp3 --lyrics projects\<id>\lyrics.txt --out projects\<id>\sync.json`  
   Pour un alignement sur la voix (recommandé) : ajouter `--whisper` (et optionnellement `--model base` ou `small`).
6. `python -m saasvisu.cli render --project projects\<id> --template minimal_16x9 --ratio 16:9 --resolution 720p`

La vidéo est dans **`projects\<id>\output.mp4`**.

## Structure

- `saasvisu/` — cœur Python (audio, paroles, sync, templates, rendu, CLI)
- `projects/` — tes projets locaux (audio, background, lyrics, sync.json, output.mp4)
- L’API (`web_api`) existe mais n’est pas nécessaire en local ; tu peux l’ignorer.

## Documentation

- **État du projet (fait / à faire)** : [STATUS.md](STATUS.md)
- **Collaboration Git** : [WORKFLOW_COLLABORATION.md](WORKFLOW_COLLABORATION.md)
- **Index de toute la doc** : [docs/README.md](docs/README.md)
- **Consignes pour les agents IA** : [AGENTS.md](AGENTS.md)
