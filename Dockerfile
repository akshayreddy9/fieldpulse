# MSR Pulse: one container serving the web app and the API.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
# The Android app (if included in the release) is offered for download on the login page
RUN mkdir -p /out && if [ -f MSR-Pulse.apk ]; then cp MSR-Pulse.apk /out/; fi

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DB_FILE=/data/msr-pulse.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/data ./src/data
COPY --from=build /app/src/lib ./src/lib
COPY package.json ./
COPY --from=build /out/ ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8787/api/health || exit 1
CMD ["node", "server/index.js"]
