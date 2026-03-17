# Démarrer le projet SaaSVisu — étapes à suivre

À faire **à chaque fois** que tu ouvres le projet pour travailler et voir les dernières modifs.

---

## 1. Ouvrir le dossier du projet

- Ouvre **Cursor** (ou ton éditeur).
- **Fichier → Ouvrir un dossier** (ou `Ctrl+K Ctrl+O`).
- Choisis : `C:\Users\frede\OneDrive\Bureau\saas visu`

Tu travailles ainsi sur les bons fichiers et le bon repo Git.

---

## 2. Récupérer les dernières modifications (Git)

Dans un terminal (PowerShell) **à la racine du projet** :

```powershell
cd "C:\Users\frede\OneDrive\Bureau\saas visu"
git switch master
git pull origin master
```

Comme ça tu es toujours sur la dernière version (y compris si quelqu’un d’autre a poussé).

---

## 3. Lancer le serveur

Dans le **même** terminal (toujours à la racine du projet) :

**Option A — avec le script (recommandé)**  
```powershell
.\run.ps1
```

**Option B — avec le venv**  
```powershell
.\venv\Scripts\python.exe -m saasvisu.web_api.main
```

**Option C — avec Python du système (si pas de venv)**  
```powershell
python -m saasvisu.web_api.main
```

Tu dois voir quelque chose comme :  
`Uvicorn running on http://0.0.0.0:8000`  
→ **ne ferme pas ce terminal** tant que tu veux utiliser l’app.

---

## 4. Ouvrir l’interface dans le navigateur

- Ouvre ton navigateur.
- Va sur : [http://localhost:8000](http://localhost:8000)

Tu verras la page avec les boutons (créer projet, upload audio, fond, paroles, synchro, rendu) et le lecteur vidéo.

- **Documentation de l’API (Swagger)** : [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 5. Redémarrer le serveur (après des changements de code)

1. Dans le terminal où le serveur tourne : **Ctrl+C**.
2. Relancer : `.\run.ps1` (ou l’option B/C ci-dessus).

Si tu as activé le mode rechargement (reload), certains changements peuvent s’appliquer sans redémarrage.

---

## Récap en une fois (copier-coller)

```powershell
cd "C:\Users\frede\OneDrive\Bureau\saas visu"
git switch master
git pull origin master
.\run.ps1
```

Puis ouvre [http://localhost:8000](http://localhost:8000) dans le navigateur.

---

## Prérequis (une seule fois)

- **Python 3.10+** installé.
- **FFmpeg** dans le PATH (pour le rendu vidéo).
- **Première fois** : créer le venv et installer les deps :
  ```powershell
  cd "C:\Users\frede\OneDrive\Bureau\saas visu"
  python -m venv venv
  .\venv\Scripts\Activate.ps1
  pip install -r requirements.txt
  ```

---

*Pour plus de détails : [README.md](README.md), [STATUS.md](STATUS.md), [docs/README.md](docs/README.md).*
