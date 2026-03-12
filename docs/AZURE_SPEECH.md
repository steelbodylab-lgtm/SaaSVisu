# Détection des paroles avec Azure (gratuit 5 h/mois)

Pour utiliser la reconnaissance vocale **Azure Speech** au lieu de Whisper (meilleure précision, gratuit 5 h d’audio par mois) :

## 1. Créer une ressource Azure

1. Va sur [portal.azure.com](https://portal.azure.com).
2. **Créer une ressource** → recherche **"Speech"** → **Speech** (Azure AI Services).
3. Choisis un abonnement, un groupe de ressources, une région (ex. **France Centre**), un nom.
4. Tarif : **Gratuit (F0)** — 5 heures de transcription par mois.
5. Crée la ressource.

## 2. Récupérer la clé et la région

1. Ouvre la ressource Speech créée.
2. Menu **Clés et point de terminaison** (ou **Keys and Endpoint**).
3. Copie **Clé 1** (ou Key 1) et la **Région** (ex. `francecentral`).

## 3. Configurer le projet

À la racine du projet SaaSVisu :

1. Copie `.env.example` en `.env`.
2. Ouvre `.env` et remplis (sans les `#`) :
   ```
   AZURE_SPEECH_KEY=ta_cle_ici
   AZURE_SPEECH_REGION=francecentral
   ```
3. Redémarre l’API (`python -m saasvisu.web_api.main`).

L’interface affichera **« Détecter les paroles — Azure (cloud, gratuit 5 h/mois) »** et utilisera Azure pour la détection automatique. Sans `.env`, c’est Whisper (local) qui est utilisé.
