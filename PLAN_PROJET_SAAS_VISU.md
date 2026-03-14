# Plan de Projet � Saas Visu

## 1. R�sum� ex�cutif

**Nom du produit :** Saas Visu  
**Type de produit :** SaaS + outil local pour g�n�rer des lyric videos anim�es avec fond vid�o, optimis�es pour TikTok/Reels/Shorts et autres plateformes.  
**Utilisateur cible principal :** artistes solo.  
**Positionnement vs lyrc.studio :** proposer une exp�rience plus simple, plus flexible et plus accessible, avec un moteur local testable facilement, et une meilleure personnalisation des styles.

Objectif : permettre � un artiste solo d�uploader un morceau, de saisir ou d�tecter ses paroles, de synchroniser automatiquement (avec corrections manuelles possibles), de choisir un style/template anim� sur fond vid�o, puis de g�n�rer une vid�o exportable pour les r�seaux (ratios 16:9, 9:16, 1:1) � le tout r�utilisable dans un futur SaaS avec abonnement + tokens.

---

## 2. Vision produit & cas d�usage

### 2.1 Utilisateur cible
- Artiste solo ind�pendant, peu ou pas technique, qui veut :
  - Promouvoir ses morceaux sur TikTok / Reels / Shorts.
  - Poster vite, souvent, sans apprendre le montage vid�o.

### 2.2 Cas d�usage principal
> � Un artiste solo veut transformer rapidement sa musique en lyric videos anim�es pr�tes � poster sur TikTok et autres r�seaux, afin de publier du contenu tous les jours sans passer des heures sur le montage. �

### 2.3 Diff�rences cl�s avec lyrc.studio
- **Phase locale forte** : un moteur CLI Python + interface web locale pour tester et it�rer sans abonnement ni connexion.
- **Contr�le cr�atif** : templates + personnalisation plus fine (typographie, couleurs, animations) pour que chaque artiste garde une identit� visuelle coh�rente.
- **Orientation  cr�ateur qui d�marre** : exp�rience pens�e pour quelqu�un qui n�a jamais fait de montage vid�o.
- **Ouverture technique** : architecture document�e pour qu�un autre agent ou dev puisse ajouter des mod�les IA (Whisper, mod�les vid�o) et des int�grations (cloud) plus tard.

---

## 3. P�rim�tre fonctionnel V1 (test local)

V1 = **moteur complet testable en local** (CLI + mini interface web), sans inscription, sans cloud.

### 3.1 Inclus en V1
1. **Upload d�un fichier audio** (au moins MP3 + WAV) depuis la machine locale.
2. **Saisie manuelle des paroles** (copier-coller dans un champ texte).
3. **Transcription / synchronisation automatique par IA** via un mod�le de type Whisper (local ou API configurable), donnant des timestamps par ligne.
4. **�diteur de synchro simple** : possibilit� d�ajuster manuellement les timestamps des lignes (glisser une ligne sur la timeline ou �diter les valeurs).
5. **Gestion des templates vid�o** :
   - Fond vid�o (boucle vid�o, clip g�n�rique ou import d�une vid�o par l�utilisateur).
   - Style de texte anim� (entr�es, sorties, highlight au rythme des paroles).
   - Param�tres simples : police, taille, couleurs, positionnement, marges.
6. **G�n�ration de vid�o** :
   - Export en **MP4** avec FFmpeg.
   - R�solutions : **720p** pour les tests (local rapide), **1080p** en option pour la qualit� finale.
   - Ratios support�s : 16:9 (horizontal), 9:16 (vertical), 1:1 (carr�) � au moins un par template au d�but.
7. **Interface web locale** (localhost) permettant :
   - Cr�ation d�un projet.
   - Upload audio.
   - Saisie des paroles.
   - Lancement de la synchro IA.
   - Ajustement manuel des temps.
   - Choix d�un template + param�tres visuels de base.
   - Lancement d�un rendu et t�l�chargement du MP4 g�n�r�.
8. **CLI** (ligne de commande) permettant :
   - Entr�e : chemin audio + fichier paroles + config template + config export.
   - Sortie : fichier vid�o g�n�r�.

### 3.2 Hors V1 (mais pr�vus plus tard)
- Int�gration directe avec **YouTube, TikTok, Instagram** (upload automatique).
- G�n�ration de **performance videos** (visage de l�artiste anim� / deepfake).
- G�n�ration de **cover art** IA.
- Syst�me de **comptes utilisateurs**, stockage cloud de projets.
- **Abonnements et tokens** (mon�tisation compl�te SaaS).
- Int�gration streaming (Spotify/Deezer), import automatique de paroles.

---

## 4. Mod�le �conomique cible (pour la version SaaS)

M�me si V1 est locale, la vision est :

- **Abonnement mensuel/annuel** pour acc�der � la plateforme, aux mod�les IA et aux templates avanc�s.
- **Syst�me de tokens/cr�dits** � l�unit� pour :
  - Rendus vid�o (par dur�e / r�solution).
  - Usage de mod�les IA co�teux (vid�o, image, couverture).
  - G�n�ration de variations (remix d�une m�me chanson en plusieurs formats).

Ce mod�le s�inspire de lyrc.studio (cr�dits) mais vise � :
- Proposer un **palier d�entr�e plus accessible** pour les artistes solo.
- Donner un **moteur local gratuit/low-cost** pour tester et comprendre la valeur avant l�abonnement.

---

## 5. Architecture technique

### 5.1 Vue d�ensemble

Composants principaux :

- **Core Python (moteur local)**
  - Gestion des fichiers audio.
  - Appel au mod�le de transcription/synchro (Whisper ou �quivalent).
  - Gestion du format des paroles + timestamps.
  - G�n�ration vid�o via **FFmpeg** (ou MoviePy + FFmpeg sous le capot).
  - Exposition d�une API locale (REST) pour l�interface web.
  - CLI pour automatiser les flux.

- **Interface Web locale**
  - Frontend (par ex. React) communiquant avec l�API Python.
  - Affichage des formulaires (upload, paroles), de la timeline, des templates, du statut de rendu.

- **Fichiers de configuration & templates**
  - Dossier 	emplates/ avec des JSON/YAML d�crivant : layout, animations, styles.
  - Dossier projects/ stockant les projets (audio, paroles, m�tadonn�es, rendu).

- **�volution ult�rieure**
  - D�ploiement du core sur un serveur (Docker) pour la version SaaS.
  - Ajout d�un backend SaaS (auth, billing, multi-tenant) connectant le m�me moteur.

### 5.2 Stack propos�e

- **Langage core :** Python 3.x.
- **Audio/vid�o :**
  - **FFmpeg** (install� sur la machine) pour l�encodage/d�codage vid�o.
  - Option : MoviePy ou fmpeg-python comme wrapper Python.
- **Transcription / synchro :**
  - Mod�le type **Whisper** (open source ou API) pour extraire des timestamps.
  - Module de mapping paroles ? segments audio.
- **Interface web :**
  - Frontend : React (ou autre framework moderne) + Tailwind/Chakra pour l�UI.
  - Backend web : FastAPI ou Flask exposant des endpoints vers le core.

- **Syst�mes d�exploitation cibles :**
  - Dev initial sur **Windows** (ton environnement).
  - Conception portable pour **Windows, Mac, Linux** (via Python + FFmpeg install�s localement).

---

## 6. Modules principaux

### 6.1 Module udio_ingest
- **R�le :** g�rer l�import audio.
- **Entr�es :** fichier audio (MP3, WAV, etc.).
- **Fonctions cl�s :**
  - Validation de format.
  - Extraction de m�ta (dur�e, bitrate).
  - Conversion �ventuelle vers un format interne standard (ex : WAV 44.1kHz).

### 6.2 Module lyrics
- **R�le :** g�rer les paroles, du texte brut au format synchronis�.
- **Fonctions :**
  - Stockage du texte brut.
  - Format interne (ex : JSON) listant les lignes de paroles.
  - Association d�un ID unique par ligne.

### 6.3 Module sync_engine
- **R�le :** produire les timestamps (IA + corrections manuelles).
- **Fonctions :**
  - Appeler le moteur Whisper (ou autre) pour transcrire l�audio.
  - Aligner la transcription avec le texte fourni par l�utilisateur.
  - Produire un tableau du type :
    - [{ line_id, start_time_ms, end_time_ms, text }].
  - Fournir des outils pour ajuster � la main (API + structure de donn�es modifiable).

### 6.4 Module 	emplates
- **R�le :** g�rer les styles visuels.
- **Contenu :**
  - Templates JSON d�crivant :
    - Fond (vid�o/image/couleur).
    - Position/animation du texte.
    - Styles typo et couleur.
    - Configuration par ratio (16:9, 9:16, 1:1).

### 6.5 Module 
ender_engine
- **R�le :** g�n�rer la vid�o finale.
- **Fonctions :**
  - Construire un script FFmpeg (ou MoviePy) � partir de : audio + fond + paroles + timestamps + template.
  - G�rer les diff�rents ratios / r�solutions.
  - Retourner le fichier vid�o export�.

### 6.6 Module cli
- **R�le :** interface ligne de commande pour les scripts et agents.
- **Exemples de commandes :**
  - saasvisu init-project --name MON_PROJET.
  - saasvisu sync --audio song.mp3 --lyrics lyrics.txt --out sync.json.
  - saasvisu render --project projet.json --template template_neon.json --ratio 9:16 --resolution 720p.

### 6.7 Module web_api
- **R�le :** exposer des endpoints HTTP pour le frontend.
- **Endpoints exemples :**
  - POST /projects ? cr�er un projet.
  - POST /projects/{id}/audio ? uploader un fichier audio.
  - POST /projects/{id}/lyrics ? sauvegarder les paroles.
  - POST /projects/{id}/sync ? lancer la synchro IA.
  - PATCH /projects/{id}/sync ? ajuster manuellement des timestamps.
  - POST /projects/{id}/render ? lancer un rendu.
  - GET /projects/{id}/download ? t�l�charger la vid�o.

---

## 7. Structure de dossiers recommand�e

`	ext
saas-visu/
  README.md
  requirements.txt
  saasvisu/
    __init__.py
    audio_ingest.py
    lyrics.py
    sync_engine/
      __init__.py
      whisper_adapter.py
      aligner.py
    templates/
      __init__.py
      templates_registry.py
      builtin/
        neon_9x16.json
        minimal_16x9.json
        square_clean_1x1.json
    render_engine/
      __init__.py
      ffmpeg_renderer.py
    web_api/
      __init__.py
      main.py  # FastAPI/Flask
    cli.py
  web-ui/
    package.json
    src/
      main.tsx
      components/
      pages/
  projects/
    .gitignore
  scripts/
    dev_start.bat
    dev_start.sh
`

---

## 8. Flux utilisateur d�taill� (V1 locale)

1. **Lancer le backend local**
   - Commande : python -m saasvisu.web_api.main (ou script d�di�).
   - Le serveur �coute sur http://localhost:8000.

2. **Lancer le frontend local**
   - Dans web-ui/ : 
pm install puis 
pm run dev.
   - Interface accessible sur http://localhost:3000.

3. **Cr�er un projet**
   - L�utilisateur clique sur � Nouveau projet �.
   - Entre : nom du projet, ratio cible principal (par d�faut 9:16 pour TikTok), r�solution (720p pour tests).

4. **Uploader l�audio**
   - L�utilisateur charge un fichier MP3/WAV.
   - Le backend l�enregistre dans projects/{id}/audio/.

5. **Saisir les paroles**
   - L�utilisateur colle les paroles dans un champ texte.
   - Le backend stocke un JSON lyrics.json.

6. **Lancer la synchro IA**
   - L�utilisateur clique sur � Synchroniser automatiquement �.
   - Le backend appelle Whisper, g�n�re une transcription avec timestamps, puis aligne avec lyrics.json.
   - R�sultat : sync.json (liste des lignes + start/end).

7. **Ajuster la synchro**
   - UI : timeline simple avec les lignes de texte.
   - L�utilisateur peut corriger le d�but/fin de certaines lignes.
   - Les modifications sont renvoy�es � l�API (PATCH) et sauvegard�es.

8. **Choisir un template**
   - L�utilisateur choisit un style : Neon, Minimal, etc.
   - Choisit le ratio (9:16, 16:9, 1:1) et �ventuellement une couleur dominante.

9. **G�n�rer la vid�o**
   - L�utilisateur clique sur � G�n�rer �.
   - Le backend compose la commande FFmpeg, lance le rendu.
   - Une barre de progression/�tat s�affiche dans l�UI.

10. **T�l�charger la vid�o**
    - Une fois le rendu termin�, un lien de t�l�chargement MP4 appara�t.
    - L�utilisateur peut poster la vid�o sur TikTok/Reels/YouTube Shorts.

---

## 9. Roadmap haute niveau

### Phase 0 � Pr�paration environnement
- Installer **Python 3.x** sur Windows.
- Installer **FFmpeg** et l�ajouter au PATH.
- Installer **Node.js** (pour le frontend futur).
- (Plus tard) Installer **Git** et cr�er le repo GitHub saas-visu.

### Phase 1 � Core CLI minimal
- Init repo Python (saasvisu + 
equirements.txt).
- Impl�menter :
  - udio_ingest (ouverture audio + extraction dur�e).
  - lyrics (format JSON de stockage).
  - 
ender_engine tr�s basique : fond couleur unie + texte statique (une ligne � la fois) synchronis� � partir d�un sync.json pr�-fabriqu�.
- Objectif : premi�re vid�o g�n�r�e **sans IA**, synchro manuelle.

### Phase 2 � Synchro IA (Whisper)
- Int�grer Whisper (local ou API) pour produire une transcription.
- Impl�menter un module d�alignement texte ? audio.
- �tendre le CLI :
  - saasvisu sync utilisant Whisper.

### Phase 3 � Templates & animations
- Concevoir 2�3 templates de base (Neon vertical 9:16, Minimal horizontal 16:9, Carr� 1:1).
- Ajouter animations d�entr�e/sortie de texte, highlight sur les mots.
- Permettre des param�tres configurables (police, couleurs principales).

### Phase 4 � Interface Web locale
- Cr�er web-ui/ (React ou �quivalent).
- Cr�er l�API FastAPI/Flask + endpoints projets.
- Impl�menter le workflow complet : upload ? paroles ? synchro ? template ? rendu ? download.

### Phase 5 � Pr�paration SaaS
- Design du syst�me d�authentification.
- Design du syst�me de tokens/cr�dits.
- D�ploiement du core dans un container Docker.
- Sp�cification d�une infrastructure cloud (plus tard : non incluse dans V1 locale).

---

## 10. Conventions pour agents et d�veloppeurs

- **Langue des commentaires / docs :** fran�ais ou anglais, mais de fa�on coh�rente dans un fichier donn�.
- **Nom du projet :** saas-visu (code, repo, dossiers).
- **Branches Git recommand�es :**
  - main : stable.
  - dev : int�gration continue.
  - feature branches : eature/<nom-feature>.
- **Style de code :**
  - Python : PEP8.
  - Type hints recommand�s.
- **Tests :**
  - Tests unitaires au minimum sur les modules lyrics, sync_engine, 
ender_engine.

---

## 11. Risques & points d�attention

- **Performance vid�o en local :** rendu FFmpeg peut �tre lourd sur certaines machines ; pr�voir des presets � rapide � en 720p.
- **Qualit� de la synchro IA :** Whisper peut faire des erreurs de transcription ; pr�voir un flux d��dition humain simple.
- **Portabilit� multi-OS :** bien tester les chemins de fichiers, les encodages et l�installation de FFmpeg sur Windows/Mac/Linux.
- **�volution vers SaaS :** veiller � s�parer clairement le core (g�n�ration) de la couche SaaS (auth, billing, multi-tenant).

---

Ce plan est con�u pour que **n�importe quel agent ou d�veloppeur** puisse :
- Comprendre la vision produit de **Saas Visu**.
- Mettre en place l�environnement local.
- Impl�menter progressivement le moteur (CLI + web) de g�n�ration de lyric videos.
- Pr�parer l�extension future vers un vrai SaaS comp�titif avec **lyrc.studio**.

