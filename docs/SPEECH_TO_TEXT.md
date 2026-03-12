# Speech-to-Text : précision et alternatives

## Pourquoi un concurrent (ex. lyrc.studio) peut être plus précis ?

- **Modèle différent** : ils utilisent peut‑être Deepgram Nova, Whisper large fine-tuné, ou un modèle interne optimisé chant/paroles.
- **Contexte chant** : la musique (instrumental, reverb) dégrade la reconnaissance. Certains services sont meilleurs sur ce cas.
- **Phrase list / vocabulaire** : on envoie déjà les paroles comme indices (phrase_hints) pour Azure ; coller les paroles avant de détecter améliore le résultat.

## Modèles souvent plus précis qu’Azure (selon benchmarks)

| Modèle / service      | Précision typique   | Note |
|-----------------------|---------------------|------|
| **Deepgram Nova-3**   | ~4,8 % WER          | Très bon, API payante, français supporté. |
| **Whisper large-v3** | ~3–5 % WER (audio propre) | Open source, gratuit, multilingue ; plus lent, à héberger. |
| **Soniox**            | Meilleur que Deepgram sur le français (études) | Payant. |
| **Azure Speech**       | ~5,5 % WER          | Bon, plan gratuit 5 h/mois, phrase list possible. |

En chant, les écarts peuvent être plus grands (bruit, mélodie). Pour réduire les erreurs avec Azure : **toujours remplir la zone Paroles** (ou les corriger puis relancer la détection) pour utiliser la phrase list.

## Évolution possible du projet

- Ajouter **Deepgram** en option (clé API) pour comparer avec Azure.
- Ou proposer **Whisper large** en local pour une précision maximale sans cloud.
