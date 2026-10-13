FROM node:22-alpine AS build

WORKDIR /app
COPY web/package*.json ./web/
WORKDIR /app/web
RUN npm ci

COPY web/ ./
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app/web
COPY --from=build /app/web/dist ./dist
COPY --from=build /app/web/server.js ./server.js
COPY --from=build /app/web/package.json ./package.json

ENV PORT=8080
EXPOSE 8080 5173

CMD ["node", "server.js"]
