# Installation — Saas Visu

## 1. Prérequis (à installer si pas déjà fait)

- **Python 3.10+**  
  - Téléchargement : https://www.python.org/downloads/  
  - Coche « Add Python to PATH » à l’installation.

- **FFmpeg**  
  - Avec winget : `winget install Gyan.FFmpeg`  
  - Ou : https://ffmpeg.org/download.html — extraire et ajouter le dossier `bin` au PATH.

- **Node.js** (pour l’interface web plus tard)  
  - Déjà installé si tu as suivi l’étape précédente.  
  - Sinon : https://nodejs.org/ (version LTS).

## 2. Créer l’environnement et installer les dépendances

Ouvre un terminal dans `C:\Users\frede\saas-visu`.

**Si PowerShell refuse d’exécuter `.\venv\Scripts\activate`** (erreur « exécution de scripts désactivée »), autorise les scripts pour ton utilisateur (une fois) :
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Réponds `O` (Oui). Ensuite tu pourras activer le venv normalement.

**Ensuite :**
```powershell
cd C:\Users\frede\saas-visu
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

**Alternative sans activer le venv** (si tu préfères ne pas changer la stratégie) : utilise directement le Python du venv :
```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```
Puis pour lancer l’API : `.\venv\Scripts\python.exe -m saasvisu.web_api.main`

## 3. Vérifier que tout marche

```powershell
# Créer un projet test
python -m saasvisu.cli init-project --name Test

# Lister les projets (le dossier projects contient un sous-dossier avec l’id)
dir projects
```

## 4. Lancer l’API web

- Si le venv est activé : `python -m saasvisu.web_api.main`
- Sans activation : `.\venv\Scripts\python.exe -m saasvisu.web_api.main`
- Ou double-clic sur `scripts\dev_start.bat`

Puis ouvre [http://localhost:8000](http://localhost:8000) et [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger).

## 5. Workflow complet (CLI)

1. Créer un projet :  
   `python -m saasvisu.cli init-project --name MonTitre`

2. Copier un fichier MP3 dans `projects\<id>\audio\` (remplacer `<id>` par l’id affiché).

3. Créer un fichier `paroles.txt` avec les paroles (une ligne = une phrase).

4. Synchroniser :  
   `python -m saasvisu.cli sync --audio projects\<id>\audio\track.mp3 --lyrics paroles.txt --out projects\<id>\sync.json`

5. Générer la vidéo :  
   `python -m saasvisu.cli render --project projects\<id> --template minimal_16x9 --ratio 16:9 --resolution 720p`

La vidéo sera dans `projects\<id>\output.mp4`.
