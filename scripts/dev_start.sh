#!/usr/bin/env bash
# Saas Visu - Demarrage backend API (Mac/Linux)
set -e
cd "$(dirname "$0")/.."
if [ ! -f venv/bin/activate ]; then
  echo "Creer d'abord le venv: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
source venv/bin/activate
python -m saasvisu.web_api.main
