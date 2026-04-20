cd /opt/novaboost-live/app
git pull origin main
npm install
npm run build:backend
npm run build
systemctl restart novaboost-backend novaboost-frontend



cd /opt/novaboost-live/app
git pull origin main
rm -rf node_modules
npm ci
npm run build:backend
npm run build
systemctl restart novaboost-backend novaboost-frontend
