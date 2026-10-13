# syntax=docker/dockerfile:1

# ---------- Этап 1: сборка ----------
# Здесь есть devDependencies (TypeScript, Nest CLI) — они нужны только для сборки
FROM node:24-alpine AS build
WORKDIR /app

# Сначала только package*.json: пока зависимости не менялись,
# Docker берёт слой с node_modules из кэша и не качает их заново
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  # Оставляем в node_modules только production-зависимости
  && npm prune --omit=dev

# ---------- Этап 2: runtime ----------
# В итоговый образ попадают только dist и production-зависимости:
# он меньше и в нём нет компилятора и исходников
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Не запускаем приложение от root
USER node
EXPOSE 3000

# При старте контейнера: сначала миграции, потом приложение.
# exec заменяет shell процессом node — тогда node получает SIGTERM от docker stop
# и корректно закрывает соединения (enableShutdownHooks в main.ts).
CMD ["sh", "-c", "npm run migration:run:prod && exec node dist/main"]
