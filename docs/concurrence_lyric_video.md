# Repérage concurrence — lyric video / templates audio

Références utiles pour l’UX produit (2025). SaaSVisu reste **local** (FFmpeg + API optionnelles) ; ce document sert d’inspiration, pas de copie.

## Acteurs proches

| Produit | Positionnement | À retenir pour l’UX |
|--------|----------------|---------------------|
| **LYRC (lyrc.studio)** | Modèles réutilisables, variations (scènes, remix, performance) | Étapes claires, timeline audio, sensation « studio » |
| **Wavel AI** | Lyric video + voix / outils audio | Transcription multi-langue, promesse de rapidité |
| **Neural Frames** | Visuels IA + autopilot, 4K | Progression guidée, rendu premium |
| **Pictory** | Sync auto + styles de texte | Personnalisation typo / marque |
| **Creatify** | Avatars + voix | Moins direct pour nous ; prouve l’import du **parcours en 3 temps** |

## Patterns UX à viser

1. **Étape 1** : médias + **sélection temporelle explicite** (onde, zoom, durée cible) avant coût API.
2. **Étape 2** : **feedback de chargement** crédible (barre + message d’état) pendant la transcription.
3. **Étape 3** : **prévisualisation WYSIWYG** + export — tout ce que nous avons déjà, présenté comme « montage final ».

## Différenciation SaaSVisu

- Contrôle local des polices bundle + FFmpeg (`fontsdir`).
- Pas d’abonnement obligatoire côté outil ; coûts = APIs choisies (AudioShake, AssemblyAI, etc.).

*Document court — à enrichir au fil des retours utilisateurs.*
