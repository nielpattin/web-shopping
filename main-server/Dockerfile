FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY index.js ./
COPY public ./public/
COPY proto ./proto/

EXPOSE 3030

CMD ["node", "index.js"]