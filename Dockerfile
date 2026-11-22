# Stage 1: build the Next.js front end to static files
FROM node:20-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web ./
RUN npm run build

# Stage 2: the Node backend, serving the API and the exported front end
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY profiles ./profiles
COPY --from=web /web/out ./web/out
ENV NODE_ENV=production PORT=8080 STORE=firestore TENANCY=multi TRUST_PROXY=1
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
