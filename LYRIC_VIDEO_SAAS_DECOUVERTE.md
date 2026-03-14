# Lyric Video SaaS — Phase de découverte & plan projet

> Document créé pour structurer la compréhension du projet et produire un plan détaillé exploitable par tout agent IA ou développeur.

---

## 1. Vision produit & utilisateurs

### Utilisateurs cibles
- [ ] Artistes (solo, groupes)
- [ ] Labels / maisons de disques
- [ ] Managers / agences
- [ ] Autres (préciser) : _______________

### Cas d’usage principal
En une phrase : *« Un [type d’utilisateur] veut [objectif] afin de [bénéfice]. »*

*Exemple : « Un artiste veut publier une lyric video sur YouTube sans faire appel à un monteur, afin de gagner du temps et de l’argent. »*

**Ta formulation :**  
_______________________________________________  
_______________________________________________

### Modèle économique (pour plus tard)
- Abonnement (mensuel / annuel) ?
- Paiement à la vidéo ?
- Freemium (gratuit limité + premium) ?
- Autre : _______________

---

## 2. Qu’est-ce qu’une « lyric video » pour toi ?

### Type de rendu souhaité
- [ ] Texte seul qui apparaît au fil de la chanson (style karaoké)
- [ ] Texte + fond (image statique / dégradé / vidéo)
- [ ] Texte animé (mots qui bougent, effets)
- [ ] Plusieurs lignes à l’écran (couplet / refrain)
- [ ] Sous-titres style « à la ligne » (une ligne à la fois)
- [ ] Autre (décrire) : _______________

### Personnalisation
- Polices / couleurs imposées ou au choix de l’utilisateur ?
- Templates prédéfinis (ex : « minimal », « néon », « rétro ») ?
- Logo / watermark de l’artiste ?
- Langue : une seule ou multilingue (FR, EN, etc.) ?

---

## 3. Contenu : audio & paroles

### Source audio
- [ ] Upload du fichier par l’utilisateur (MP3, WAV, etc.)
- [ ] Lien (YouTube, SoundCloud, autre) à importer
- [ ] Intégration streaming (Spotify, Deezer, etc.) — à prévoir ou pas pour la V1 ?

### Source des paroles
- [ ] Saisie manuelle (copier-coller)
- [ ] Import fichier (LRC, SRT, TXT avec timestamps)
- [ ] Synchronisation automatique (reconnaissance vocale / IA) — V1 ou plus tard ?
- [ ] Recherche automatique des paroles en ligne (API) — à prévoir ou pas ?

### Synchronisation parole / audio
- [ ] L’utilisateur place manuellement chaque ligne dans le temps
- [ ] Import d’un fichier déjà synchronisé (LRC, SRT)
- [ ] Détection automatique (IA) — pour quelle version (V1 / V2) ?

---

## 4. Workflow utilisateur (étapes)

Décris les étapes idéales du début à la fin. Exemple :

1. Connexion / inscription (ou test local sans compte)
2. Créer un nouveau projet « Lyric Video »
3. Upload de l’audio
4. Saisie ou import des paroles
5. Synchronisation (manuelle ou auto)
6. Choix du style (template, couleurs, police)
7. Aperçu
8. Export / téléchargement de la vidéo

**Ton workflow (ajuster / compléter) :**  
_______________________________________________  
_______________________________________________  
_______________________________________________

---

## 5. Export & diffusion

### Formats de sortie
- Résolutions : 1080p uniquement ? 4K ? 720p pour réseaux sociaux ?
- Ratio : 16:9 (YouTube), 9:16 (TikTok/Reels), 1:1 (Instagram carré) ?
- Format fichier : MP4 (H.264 / H.265) ? Autre ?

### Où sera diffusée la vidéo ?
- [ ] YouTube
- [ ] TikTok / Reels / Shorts
- [ ] Instagram
- [ ] Autre : _______________

---

## 6. Technique & environnement

### Test en local — ce que tu veux pour « tester en entier »
- [ ] Application web locale (ex : `localhost:3000`)
- [ ] Script / CLI (ligne de commande) : entrée = audio + paroles → sortie = vidéo
- [ ] Application desktop (Electron, etc.)
- [ ] Les deux : CLI pour le cœur métier + interface web pour l’UX

### Stack technique (si tu as des préférences)
- Langage backend : Python, Node.js, autre ? (Python est souvent utilisé pour la vidéo / traitement audio.)
- Frontend (pour plus tard) : React, Vue, Svelte, autre ?
- Rendu vidéo : FFmpeg, autre lib (e.g. MoviePy en Python) ?

### Contraintes
- OS : Windows uniquement ? Mac / Linux aussi ?
- Pas de cloud au début : tout en local (fichiers sur la machine) ?

---

## 7. Périmètre V1 (MVP — test local)

Pour « tester le projet dans son entièreté en local », qu’est-ce qui est indispensable ?

**Inclus dans la V1 (à cocher / lister) :**
- [ ] Upload (ou chemin local) d’un fichier audio
- [ ] Saisie / import des paroles (format à définir)
- [ ] Synchronisation (manuelle minimum ? ou fichier LRC ?)
- [ ] Un style de rendu (même basique)
- [ ] Génération de la vidéo (ex : MP4)
- [ ] Téléchargement / enregistrement du fichier généré

**Explicitement hors V1 (à faire plus tard) :**
- _______________________________________________
- _______________________________________________

---

## 8. Questions ouvertes

- As-tu des exemples de lyric videos (YouTube, etc.) qui correspondent à ce que tu veux ?
- As-tu déjà des assets (polices, images de fond, maquettes) ?
- Préférence pour un nom de produit / de projet (pour les dossiers, repo GitHub, etc.) ?

---

## Prochaines étapes

Une fois ces questions remplies (ou répondues dans le chat), le plan détaillé du projet sera rédigé dans un document séparé : **PLAN_PROJET_LYRIC_VIDEO_SAAS.md**, avec :

- Architecture technique
- Structure des dossiers et des fichiers
- Spécifications par module (audio, paroles, sync, rendu, export)
- Stack recommandée et justifications
- Étapes de développement pour la phase « test local »
- Glossaire et conventions pour que tout agent IA puisse reprendre le projet

Tu peux répondre directement dans ce fichier (en complétant les cases et les _______________) ou dans le chat — je mettrai à jour le plan en conséquence.
