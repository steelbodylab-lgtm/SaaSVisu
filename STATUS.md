# Où on en est — Saas Visu

**Objectif :** Créer un **visualizer** à partir de :
1. **Une photo ou une vidéo** (fond visuel)
2. **Un fichier audio** (la chanson)
3. **Les paroles** (synchronisées avec l’audio)

Sortie : une vidéo (MP4) avec le fond photo/vidéo + les paroles qui s’affichent au bon moment.

---

## ✅ Déjà en place

| Élément | État |
|--------|------|
| Projet structuré (`saas-visu`) | OK |
| Upload **audio** (MP3, WAV) | OK (API + CLI) |
| Saisie / import **paroles** (texte → lignes) | OK |
| **Synchronisation** paroles / audio | OK : uniforme, Whisper (phrases), ou **détection auto mot par mot** |
| **Rendu vidéo** (FFmpeg) | OK : fond **adapté au format** (cover), paroles **mot par mot**, **polices et effets** au choix |
| **Fond photo ou vidéo** | OK : upload via API `POST /projects/{id}/background`, ou fichier `background.jpg` / `background.mp4` dans le projet ; le render l’utilise automatiquement |
| API REST (créer projet, upload audio, **upload fond**, sync, render, download) | OK |
| Templates (style des paroles) | OK (3 templates : 16:9, 9:16, 1:1) |
| Documentation et workflow | OK : docs (voir [docs/README.md](docs/README.md)), [WORKFLOW_COLLABORATION.md](WORKFLOW_COLLABORATION.md), [AGENTS.md](AGENTS.md) pour les agents IA |
| **Détection auto des paroles** | OK : bouton « Détecter les paroles automatiquement » (Whisper, mot par mot) |
| **Affichage mot par mot + effets** | OK : texte synchronisé au chant, choix de police et effet (contour, ombre, gras, etc.) |
| **Fond adapté au format** | OK : image/vidéo de fond recadrée pour remplir le format choisi (16:9, 9:16, 1:1) |

---

## ❌ Ce qui manque encore (optionnel)

| Manque | Détail |
|--------|--------|
| **Interface web (React)** | Tout se fait via l’API /docs ou le CLI ; pas encore d’UI dédiée. |

---

*Dernière mise à jour : synchro Whisper intégrée (CLI `--whisper`, API `?use_whisper=true`).*
