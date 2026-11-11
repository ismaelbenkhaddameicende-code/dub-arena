# DUB ARENA en un unico contenedor: Express sirve la API, Socket.IO y la web.
# Pensado para hostings gratuitos que aceptan Docker (Hugging Face Spaces, Koyeb...).
FROM node:20-bookworm AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && apt-get clean
WORKDIR /app
ENV NODE_ENV=production \
    SERVE_STATIC=1 \
    PORT=7860 \
    STORAGE_DIR=/data \
    CORS_ORIGINS=*
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7860)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/index.js"]
