# Commandes terminal — Saas Visu

À faire dans **PowerShell**, depuis le dossier du projet.

---

## 1. Aller dans le projet et activer l’environnement (à faire à chaque nouvelle fenêtre)

```powershell
cd C:\Users\frede\saas-visu
.\venv\Scripts\activate
```

Tu dois voir `(venv)` au début de la ligne.

---

## 2. Lancer l’interface locale (pour travailler avec l’app)

```powershell
cd C:\Users\frede\saas-visu
.\venv\Scripts\activate
python -m saasvisu.web_api.main
```

Puis ouvre [http://localhost:8000](http://localhost:8000) dans le navigateur.  
Pour arrêter le serveur : **Ctrl+C**.

---

## 3. Installer / mettre à jour les dépendances (après un pull ou changement de requirements.txt)

```powershell
cd C:\Users\frede\saas-visu
.\venv\Scripts\activate
pip install -r requirements.txt
```

---

## 4. Créer un projet (en CLI)

```powershell
cd C:\Users\frede\saas-visu
.\venv\Scripts\activate
python -m saasvisu.cli init-project --name "Mon titre"
```

---

## 5. Synchroniser les paroles (CLI)

```powershell
cd C:\Users\frede\saas-visu
.\venv\Scripts\activate
python -m saasvisu.cli sync --audio "projects\ID_DU_PROJET\audio\track.mp3" --lyrics "projects\ID_DU_PROJET\lyrics.txt" --out "projects\ID_DU_PROJET\sync.json"
```

Remplace `ID_DU_PROJET` par l’id affiché à la création du projet.

---

## 6. Générer la vidéo (CLI)

```powershell
cd C:\Users\frede\saas-visu
.\venv\Scripts\activate
python -m saasvisu.cli render --project "projects\ID_DU_PROJET" --template minimal_16x9 --ratio 16:9 --resolution 720p
```

---

## Résumé ultra-court

| Action | Commande |
|--------|----------|
| Ouvrir le projet + activer le venv | `cd C:\Users\frede\saas-visu` puis `.\venv\Scripts\activate` |
| Lancer l’interface web | `python -m saasvisu.web_api.main` (après avoir activé le venv) |
| Installer les deps | `pip install -r requirements.txt` (après avoir activé le venv) |
