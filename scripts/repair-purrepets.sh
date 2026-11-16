#!/bin/bash
# One-shot repair for the live Ubuntu box. Run as the ubuntu user.
set -euo pipefail
cd /home/ubuntu/PurrePets

git pull --ff-only origin main

sudo mkdir -p /var/www/purrepets/uploads
sudo chown -R ubuntu:www-data /var/www/purrepets/uploads
sudo chmod -R 775 /var/www/purrepets/uploads
ln -sfn /var/www/purrepets/uploads /home/ubuntu/PurrePets/uploads
ln -sfn /var/www/purrepets/uploads /home/ubuntu/PurrePets/backend/uploads

sudo cp /home/ubuntu/PurrePets/backend/nginx/purrepets.conf /etc/nginx/sites-available/purrepets
sudo ln -sfn /etc/nginx/sites-available/purrepets /etc/nginx/sites-enabled/purrepets
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

cd /home/ubuntu/PurrePets/backend
npx prisma generate
node scripts/seed-admin.js  # role admin wyłącznie z ADMIN_EMAILS (backend/.env)

cd /home/ubuntu/PurrePets
npm run build
pm2 startOrReload /home/ubuntu/PurrePets/ecosystem.config.cjs --update-env
pm2 save
echo "PURRE PETS repaired"
