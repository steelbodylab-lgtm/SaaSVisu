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

## Lancer / redémarrer le serveur

Dans le dossier du projet :

```powershell
.\run.ps1
```

Ou à la main : `python -m saasvisu.web_api.main`

**Pour redémarrer** : dans le terminal où le serveur tourne, **Ctrl+C**, puis relancer `.\run.ps1`.

Ouvre **http://localhost:8000** dans le navigateur.

---

## Utilisation en local (CLI)

Guide pas à pas en CLI : **USAGE_LOCAL.md**

**Interface locale (recommandé pour tester)** : lance l’API puis ouvre le navigateur (voir ci‑dessus).

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

## HeartMuLa (paroles) : dev gratuit vs prod

- **En dev** (gratuit) : dans `.env` mets `HEARTMULA_USE_LOCAL=1`, puis  
  `pip install -r requirements-heartmula-local.txt`. Le moteur « HeartMuLa (local, gratuit) » apparaît ; la première détection télécharge le modèle (~1 Go).
- **En prod** : dans `.env` mets `WAVESPEED_API_KEY=ta_cle` (sans `HEARTMULA_USE_LOCAL`). L’app utilisera l’API WaveSpeed (~0,05 $ / transcription).

## Structure

- `saasvisu/` — cœur Python (audio, paroles, sync, templates, rendu, CLI)
- `projects/` — tes projets locaux (audio, background, lyrics, sync.json, output.mp4)
- L’API (`web_api`) existe mais n’est pas nécessaire en local ; tu peux l’ignorer.

## Documentation

- **État du projet (fait / à faire)** : [STATUS.md](STATUS.md)
- **Collaboration Git** : [WORKFLOW_COLLABORATION.md](WORKFLOW_COLLABORATION.md)
- **Index de toute la doc** : [docs/README.md](docs/README.md)
- **Consignes pour les agents IA** : [AGENTS.md](AGENTS.md)
