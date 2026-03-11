# Mettre le projet sur GitHub et permettre les push depuis Cursor

Une fois Git installé et le dépôt GitHub créé, tu pourras faire (ou me demander de faire) `git add`, `git commit`, `git push` depuis le projet. Les commandes utiliseront **ton** compte GitHub (token ou clé SSH).

---

## 1. Installer Git

Si Git n’est pas installé :

```powershell
winget install Git.Git
```

Ferme et rouvre PowerShell (ou Cursor) pour que `git` soit reconnu.

Vérifier :

```powershell
git --version
```

---

## 2. Créer le dépôt sur GitHub

1. Va sur **https://github.com/new**
2. **Repository name** : `saas-visu` (ou un autre nom)
3. **Visibility** : Public ou Private
4. Ne coche **pas** "Add a README" (le projet en a déjà un)
5. Clique sur **Create repository**
6. Note l’URL du dépôt, par ex. :  
   `https://github.com/TON_USERNAME/saas-visu.git`

---

## 3. Initialiser Git et faire le premier commit (en local)

Dans PowerShell, depuis le dossier du projet :

```powershell
cd C:\Users\frede\saas-visu
git init
git add .
git commit -m "Initial commit: Saas Visu local (CLI + API + interface)"
```

---

## 4. Branche principale et remote

GitHub utilise souvent `main` comme branche par défaut :

```powershell
git branch -M main
git remote add origin https://github.com/TON_USERNAME/saas-visu.git
```

Remplace `TON_USERNAME` par ton identifiant GitHub.

---

## 5. Premier push (authentification)

```powershell
git push -u origin main
```

- **Si tu utilises HTTPS** : GitHub te demandera de t’authentifier. Les mots de passe ne sont plus acceptés : il faut un **Personal Access Token (PAT)**.
  - Va sur **GitHub → Settings → Developer settings → Personal access tokens**
  - Crée un token avec la permission **repo**
  - Quand Git demande le mot de passe, colle ce token
- **Si tu préfères SSH** : configure une clé SSH sur GitHub, puis utilise l’URL `git@github.com:TON_USERNAME/saas-visu.git` comme remote au lieu de l’URL HTTPS.

Une fois un push réussi, ton dépôt est à jour et **tout push fait depuis ce dossier (par toi ou par l’assistant) utilisera la même config** : tu n’as rien de plus à “donner” à l’assistant, il suffit de lancer les commandes `git` dans le projet.

---

## 6. Résumé des commandes (à lancer dans l’ordre)

```powershell
cd C:\Users\frede\saas-visu
git init
git add .
git commit -m "Initial commit: Saas Visu local (CLI + API + interface)"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/saas-visu.git
git push -u origin main
```

Ensuite, pour mettre à jour le dépôt après des changements :

```powershell
cd C:\Users\frede\saas-visu
git add .
git commit -m "Description des changements"
git push
```

L’assistant pourra exécuter ces commandes pour toi dès que Git est installé et que le remote + l’auth sont configurés.
