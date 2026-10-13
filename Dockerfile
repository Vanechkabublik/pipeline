FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
# При старте: сначала миграции, потом приложение
CMD ["sh", "-c", "npm run migration:run:prod && node dist/main"]
