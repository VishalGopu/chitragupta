FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY profiles ./profiles
ENV NODE_ENV=production PORT=8080 STORE=firestore TENANCY=multi TRUST_PROXY=1
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
