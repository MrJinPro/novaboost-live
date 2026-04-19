cd /opt/novaboost-live/app
git pull origin main
npm run build:backend
npm run build

systemctl restart novaboost-backend novaboost-frontend
