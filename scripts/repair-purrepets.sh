#!/bin/bash
# One-shot repair for the live Ubuntu box. Run as the ubuntu user.
set -euo pipefail
cd /home/ubuntu/Base44

git pull --ff-only origin main

sudo mkdir -p /var/www/purrepets/uploads
sudo chown -R ubuntu:www-data /var/www/purrepets/uploads
sudo chmod -R 775 /var/www/purrepets/uploads
ln -sfn /var/www/purrepets/uploads /home/ubuntu/Base44/uploads
ln -sfn /var/www/purrepets/uploads /home/ubuntu/Base44/backend/uploads

sudo cp /home/ubuntu/Base44/backend/nginx/purrepets.conf /etc/nginx/sites-available/purrepets
sudo ln -sfn /etc/nginx/sites-available/purrepets /etc/nginx/sites-enabled/purrepets
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

cd /home/ubuntu/Base44/backend
npx prisma generate
node scripts/make-admin.mjs effdoa@gmail.com || true

cd /home/ubuntu/Base44
npm run build
pm2 startOrReload /home/ubuntu/Base44/ecosystem.config.cjs --update-env
pm2 save
echo "PURRE PETS repaired"
