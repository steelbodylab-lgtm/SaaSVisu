# Utilisation en local (CLI uniquement)

Pas d’interface web, pas d’API à lancer : tout se fait en ligne de commande depuis le dossier du projet.

**Alternative :** tu peux aussi lancer l’API (`python -m saasvisu.web_api.main`) et ouvrir **http://localhost:8000** pour une interface avec boutons d’upload et lecteur vidéo (voir README).

---

## Prérequis

- Python 3.10+ avec le venv activé (`.\venv\Scripts\activate`)
- FFmpeg dans le PATH

---

## Workflow complet : 1 projet = 1 visualizer

Tout se passe dans `C:\Users\frede\saas-visu`. Ouvre PowerShell, va dans ce dossier, active le venv.

### 1. Créer un projet

```powershell
python -m saasvisu.cli init-project --name "Ma chanson"
```

Tu obtiens un **id** (ex. `a1b2c3d4`). Tout le reste du projet est dans `projects\a1b2c3d4\`.

### 2. Mettre l’audio dans le projet

Copie ton fichier audio (MP3 ou WAV) dans le dossier audio du projet :

```powershell
Copy-Item "C:\chemin\vers\ma_chanson.mp3" "projects\a1b2c3d4\audio\track.mp3"
```

(Remplace `a1b2c3d4` par ton id et le chemin source par le tien.)

### 3. Mettre la photo ou la vidéo de fond

Copie une **image** (jpg, png) ou une **vidéo** (mp4, etc.) dans le dossier du projet, avec le nom `background` + l’extension :

```powershell
Copy-Item "C:\chemin\vers\ma_photo.jpg" "projects\a1b2c3d4\background.jpg"
```

Ou pour une vidéo :

```powershell
Copy-Item "C:\chemin\vers\fond.mp4" "projects\a1b2c3d4\background.mp4"
```

Si tu ne mets pas de fichier `background.*`, le rendu utilisera une **couleur de fond** (définie par le template).

### 4. Créer le fichier des paroles

Crée un fichier texte avec les paroles, **une ligne = une phrase** affichée à l’écran :

```powershell
Set-Content -Path "projects\a1b2c3d4\lyrics.txt" -Encoding UTF8 @"
Première phrase de la chanson
Deuxième phrase
Couplet qui continue
Refrain ici
"@
```

Ou édite à la main `projects\a1b2c3d4\lyrics.txt` avec ton éditeur.

### 5. Lancer la synchronisation

Ça répartit les lignes de paroles sur la durée de l’audio (pour l’instant de façon uniforme) :

```powershell
python -m saasvisu.cli sync --audio "projects\a1b2c3d4\audio\track.mp3" --lyrics "projects\a1b2c3d4\lyrics.txt" --out "projects\a1b2c3d4\sync.json" --whisper
```

### 6. Générer la vidéo (visualizer)

```powershell
python -m saasvisu.cli render --project "projects\a1b2c3d4" --template minimal_16x9 --ratio 16:9 --resolution 720p
```

- **Sans** fichier `background.*` dans le projet → fond couleur.
- **Avec** `background.jpg` ou `background.mp4` → ce fichier est utilisé comme fond.

Options utiles :
- `--ratio` : `16:9` (YouTube), `9:16` (TikTok/Reels), `1:1` (carré)
- `--template` : `minimal_16x9`, `neon_9x16`, `square_clean_1x1`
- `--resolution` : `720p` (rapide) ou `1080p`
- `--output "chemin\custom.mp4"` : enregistrer la vidéo ailleurs

### 7. Récupérer la vidéo

La vidéo générée est ici :

```
projects\a1b2c3d4\output.mp4
```

Ouvre-la avec ton lecteur vidéo ou ton logiciel de montage.

---

## Résumé des commandes (à adapter avec ton id)

```powershell
cd C:\Users\frede\saas-visu
.\venv\Scripts\activate

python -m saasvisu.cli init-project --name "Mon titre"
# Copier audio → projects\<id>\audio\track.mp3
# Copier fond  → projects\<id>\background.jpg (ou .mp4)
# Créer       → projects\<id>\lyrics.txt

python -m saasvisu.cli sync --audio "projects\<id>\audio\track.mp3" --lyrics "projects\<id>\lyrics.txt" --out "projects\<id>\sync.json"
python -m saasvisu.cli render --project "projects\<id>" --template minimal_16x9 --ratio 16:9 --resolution 720p
```

Vidéo finale : `projects\<id>\output.mp4`.
