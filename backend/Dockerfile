FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS development
WORKDIR /app
COPY . .
EXPOSE 61021
CMD ["npm", "run", "start:dev"]

FROM dependencies AS production
WORKDIR /app
COPY . .
RUN npm run build && npm prune --omit=dev
EXPOSE 61021
CMD ["npm", "run", "start"]
