FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache git

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/auth_info_baileys && chmod -R 777 /app/auth_info_baileys

ENV PORT=7860
EXPOSE 7860

CMD ["node", "src/index.js"]
