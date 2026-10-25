FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npm run lint && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates gosu dumb-init python3 python3-venv && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY backend ./backend
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod 755 /app/entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["dumb-init","--","/app/entrypoint.sh"]
CMD ["python","-m","backend.run"]
