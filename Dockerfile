FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY dashboard/package.json dashboard/package-lock.json ./dashboard/

RUN npm ci --omit=dev
RUN cd dashboard && npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY dashboard ./dashboard

RUN npm run build
RUN cd dashboard && npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
