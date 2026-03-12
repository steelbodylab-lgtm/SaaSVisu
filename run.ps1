# Lancer le serveur SaaSVisu
# Pour redémarrer : Ctrl+C ici puis relancer ce script (ou F5 dans le terminal)
Set-Location $PSScriptRoot
python -m saasvisu.web_api.main
