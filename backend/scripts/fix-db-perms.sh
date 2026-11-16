#!/usr/bin/env bash
# PURRE PETS — naprawa uprawnień bazy (42501). Użycie: sudo bash backend/scripts/fix-db-perms.sh [nazwa_bazy]
set -euo pipefail

DB_NAME="${1:-purrepets}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=0 -f "$DIR/fix-db-perms.sql"
echo "✅ Uprawnienia PostgreSQL naprawione (baza: $DB_NAME)."
