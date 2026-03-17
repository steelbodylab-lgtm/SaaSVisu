# Guide de démarrage — SaaSVisu

Tout ce qu’il faut faire, étape par étape, pour lancer et tester SaaSVisu.

---

## Étape 1 : Prérequis sur ton PC

### 1.1 Python 3.10 ou plus

- Va sur https://www.python.org/downloads/
- Télécharge et installe Python (coche **« Add Python to PATH »**).
- Ouvre PowerShell et tape : `python --version`  
  Tu dois voir une version ≥ 3.10.

### 1.2 FFmpeg (pour générer les vidéos)

- Avec **winget** (Windows) :  
  `winget install Gyan.FFmpeg`
- Ou télécharge sur https://ffmpeg.org/download.html et ajoute le dossier `bin` au PATH.
- Vérifie : `ffmpeg -version` dans PowerShell.

---

## Étape 2 : Récupérer le projet

1. Ouvre PowerShell.
2. Va sur ton Bureau (ou le dossier où tu veux le projet) :  
   `cd C:\Users\TonNom\Desktop`
3. Clone le dépôt (si pas déjà fait) :  
   `git clone https://github.com/steelbodylab-lgtm/SaaSVisu.git`
4. Entre dans le dossier :  
   `cd SaaSVisu`
5. (Recommandé) Passe sur la branche de travail :  
   `git checkout master`

---

## Étape 3 : Environnement Python et dépendances

1. Toujours dans `SaaSVisu`, crée un environnement virtuel :  
   `python -m venv venv`
2. Active-le :  
   `.\venv\Scripts\activate`  
   (Tu dois voir `(venv)` au début de la ligne.)
3. Si PowerShell bloque l’exécution de scripts, une fois :  
   `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`  
   puis réessaie d’activer le venv.
4. Installe les dépendances :  
   `pip install -r requirements.txt`  
   (Peut prendre quelques minutes la première fois, à cause de Whisper/PyTorch.)

---

## Étape 4 : (Optionnel) Configurer Azure pour la détection des paroles

Si tu veux utiliser **Azure** (meilleure précision, 5 h gratuites par mois) :

1. Va sur https://portal.azure.com et connecte-toi.
2. **Créer une ressource** → cherche **« Speech »** → choisis **Speech** (Azure AI Services).
3. Remplis : abonnement, groupe de ressources, **région** (ex. France Centre), nom.
4. Choisis le niveau **Gratuit (F0)**.
5. Crée la ressource.
6. Dans la ressource : **Clés et point de terminaison** → copie **Clé 1** et la **Région** (ex. `francecentral`).
7. Dans le dossier `SaaSVisu`, copie le fichier d’exemple :  
   `copy .env.example .env`
8. Ouvre `.env` avec un éditeur et mets ta clé et ta région (sans les `#`) :  
   `AZURE_SPEECH_KEY=ta_cle_ici`  
   `AZURE_SPEECH_REGION=francecentral`  
   Puis enregistre.

Si tu ne fais pas cette étape, l’app utilisera **Whisper** (local) pour la détection des paroles.

---

## Étape 5 : Lancer l’application

1. Dans PowerShell, va dans le dossier du projet :  
   `cd C:\Users\TonNom\Desktop\SaaSVisu`
2. Active l’environnement si ce n’est pas déjà fait :  
   `.\venv\Scripts\activate`
3. Démarre l’API et l’interface :  
   `python -m saasvisu.web_api.main`
4. Ouvre ton navigateur et va sur :  
   [http://localhost:8000](http://localhost:8000)

Tu dois voir l’interface SaaSVisu (étapes 1 à 4).

---

## Étape 6 : Tester un lyric video de A à Z

1. **Fichiers (étape 1)**  
   - Clique sur la zone **Audio** (ou dépose un fichier) et choisis un MP3 ou WAV.  
   - (Optionnel) Fais pareil pour **Fond** avec une image ou une vidéo.

2. **Paroles (étape 2)**  
   - **Option A** : Clique sur **« Détecter les paroles »** et attends la fin (Azure ou Whisper selon ta config).  
   - **Option B** : Colle les paroles dans la zone de texte (une ligne = une phrase), puis clique sur **« Analyser mes paroles (déjà collées) »**.

3. **Rendu (étape 3)**  
   - Choisis Format (16:9, 9:16, 1:1), Résolution, Police, Effet, Couleur du texte.  
   - Clique sur **« Lancer le rendu »** et attends 1–2 minutes.

4. **Résultat (étape 4)**  
   - La vidéo s’affiche ; tu peux **Télécharger le MP4**.

---

## En résumé

| Étape | Action |
|-------|--------|
| 1 | Installer Python 3.10+ et FFmpeg |
| 2 | Cloner le repo et aller dans `SaaSVisu` |
| 3 | `python -m venv venv` → `.\venv\Scripts\activate` → `pip install -r requirements.txt` |
| 4 | (Optionnel) Créer une ressource Speech sur Azure, copier `.env.example` en `.env`, remplir clé et région |
| 5 | `python -m saasvisu.web_api.main` puis ouvrir [http://localhost:8000](http://localhost:8000) |
| 6 | Déposer l’audio → Détecter ou coller les paroles → Lancer le rendu → Télécharger la vidéo |

En cas de souci, vérifie que le venv est activé, que FFmpeg est dans le PATH, et que le serveur tourne bien sur le port 8000.
