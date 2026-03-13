"""
Télécharge le modèle HeartMuLa (HeartTranscriptor) une fois.
Lance ce script depuis la racine du projet, attends la fin du téléchargement (~1 Go),
puis utilise « Détecter les paroles » avec HeartMuLa (local) dans l'interface sans timeout.
"""
import sys
from pathlib import Path

# S'assurer que la racine du projet est dans le path
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

def main():
    print("Téléchargement du modèle HeartMuLa (HeartTranscriptor)… (~1 Go, une seule fois)")
    print("Cela peut prendre 5 à 15 min selon la connexion. Ne ferme pas ce terminal.\n")
    from saasvisu.sync_engine.heartmula_adapter import _get_pipeline
    _get_pipeline()
    print("\nModèle prêt. Tu peux maintenant utiliser « Détecter les paroles » avec HeartMuLa (local) dans l'interface.")

if __name__ == "__main__":
    main()
