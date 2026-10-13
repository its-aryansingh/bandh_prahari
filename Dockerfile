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
COPY --from=build /app/web/node_modules ./node_modules
COPY --from=build /app/web/package.json ./package.json

ENV PORT=5173
EXPOSE 5173

CMD ["sh", "-c", "npx vite preview --host 0.0.0.0 --port ${PORT:-5173}"]
