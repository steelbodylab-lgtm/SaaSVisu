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
| **Synchronisation** paroles / audio | OK (répartition uniforme pour l’instant ; Whisper prévu plus tard) |
| **Rendu vidéo** (FFmpeg) | OK avec **fond couleur**, **photo** ou **vidéo** |
| **Fond photo ou vidéo** | OK : upload via API `POST /projects/{id}/background`, ou fichier `background.jpg` / `background.mp4` dans le projet ; le render l’utilise automatiquement |
| API REST (créer projet, upload audio, **upload fond**, sync, render, download) | OK |
| Templates (style des paroles) | OK (3 templates : 16:9, 9:16, 1:1) |

---

## ❌ Ce qui manque encore (optionnel)

| Manque | Détail |
|--------|--------|
| **Synchro automatique (Whisper)** | Les paroles sont réparties uniformément sur la durée ; pas encore de détection vocale pour caler les lignes au bon moment. (Prévu Phase 2.) |
| **Interface web (React)** | Tout se fait via l’API /docs ou le CLI ; pas encore d’UI dédiée. |

---

*Dernière mise à jour : après mise en place de l’API et du rendu couleur.*
