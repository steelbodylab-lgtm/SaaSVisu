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
| **Interface web statique** | OK : `static/` (index.html, app.js, style.css) — upload, extrait audio, détection paroles, preview, export |
| **Prévisualisation des effets texte** | OK : overlay preview avec classes CSS (néon, outline, ombre, etc.) |
| **Branding (2ᵉ partie du site)** | En cours : nom « SaaS Visu », baseline « Ton monteur de visualizers intelligent », palette violet/nocturne, doc [docs/BRANDING.md](docs/BRANDING.md) |
| **Landing promo + Tarifs + FAQ** | OK : section Accueil (promo, bénéfices, CTA), bulle Tarifs (Découverte / Pro / Studio), bulle FAQ en accordéon ; nav avec ancres |
| **UX produit** | OK : barre de progression des étapes (1–2–3), scroll fluide vers les ancres, scroll-margin sous la nav sticky |
| **Templates sauvegardables** | OK : sauvegarder/charger un preset de rendu (police, effet, animation, position, couleur, etc.) — API + dropdown frontend |
| **Système Remix** | OK : re-rendre la vidéo avec un preset différent ou aléatoire, sans re-détecter les paroles — bouton Remix + API |
| **Cut-point effects (beats)** | OK : détection des beats via librosa, effets visuels synchronisés (flash, zoom, shake) dans le rendu FFmpeg + preview en temps réel |
| **Crédits locaux** | OK : système de crédits localStorage — modal choix du plan (Découverte 10, Pro 50, Studio 200), badge nav, vérification avant export |

---

## ❌ Ce qui manque encore (optionnel)

| Manque | Détail |
|--------|--------|
| **Thème clair/sombre** | Prévoir toggle ou préférence (variables CSS déjà prêtes côté sombre). |
| **Logo / icône SaaS Visu** | À créer (style géométrique, cohérent avec la 1ʳᵉ partie du site). |
| **Cover art / pochette** | Générateur de pochette — reporté pour l'instant. |
| **Système de comptes + crédits serveur** | Crédits actuellement en localStorage ; migration vers comptes + BDD à prévoir. |

---

*Dernière mise à jour : implémentation templates, remix, cut-point effects (beats), crédits locaux.*
