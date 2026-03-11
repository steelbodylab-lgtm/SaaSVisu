# Workflow à deux — sans frictions

Objectif : **toujours repartir de la version à jour**, que ce soit toi ou l’autre qui a poussé en dernier.

---

## Règle d’or

- **Une seule branche de travail : `master`.**
- **Avant de commencer** → récupérer la dernière version.
- **Avant de pousser** → récupérer encore, puis pousser.

---

## À chaque fois que tu (re)commences à travailler

```powershell
cd C:\Users\frede\saas-visu    # ou le chemin de l’autre dev
git switch master
git pull origin master
```

Ensuite tu travailles normalement (code, tests, etc.).

---

## Quand tu as fini une étape et veux sauvegarder / partager

```powershell
git add .
git status                    # vérifier ce qui part
git commit -m "Description claire de ce que tu as fait"
git pull origin master        # récupérer d’éventuelles modifs de l’autre
git push origin master
```

Si `git pull` affiche « Already up to date », tu peux enchaîner direct avec `git push`.  
Si quelqu’un a poussé entre-temps, Git fusionne ; en cas de **conflit**, il te dira quels fichiers modifier — tu corriges, puis :

```powershell
git add .
git commit -m "Résolution conflit après merge"
git push origin master
```

---

## Résumé

| Moment            | Action |
|-------------------|--------|
| Début de session  | `git pull origin master` |
| Après tes modifs  | `git add .` → `git commit -m "..."` → `git pull origin master` → `git push origin master` |

Comme ça, vous travaillez toujours sur la **même base à jour** et vous évitez les surprises.

---

## À ne pas faire

- Ne pas pousser sur une autre branche par erreur : tout va sur **`master`**.
- Ne pas ignorer un `git pull` avant `git push` : tu risques d’écraser ou de créer des conflits inutiles.
- Ne pas committer `venv/` ni le contenu de `projects/` (déjà dans `.gitignore`).

---

## Si l’autre a poussé pendant que tu travaillais

Tu as fait des commits locaux, puis `git pull` :

- Soit Git fusionne tout seul (fast-forward ou merge automatique) → tu fais `git push`.
- Soit il dit « merge conflict » dans certains fichiers → tu ouvres ces fichiers, tu supprimes les marqueurs `<<<<<<<`, `=======`, `>>>>>>>` et tu gardes le bon code, puis `git add .` → `git commit -m "Résolution conflit"` → `git push`.

En cas de doute, mieux vaut un court message (Slack, SMS, etc.) : « J’ai poussé sur master, fais un pull avant de continuer. »
