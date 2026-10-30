FROM node:22-alpine AS dependencies
WORKDIR /app
COPY management/package*.json ./
RUN npm ci

FROM dependencies AS development
WORKDIR /app
COPY management/ .
COPY miniprogram/AppleGaramond.ttf /miniprogram/AppleGaramond.ttf
COPY miniprogram/SourceHanSerifCN-Regular.otf /miniprogram/SourceHanSerifCN-Regular.otf
EXPOSE 61022
CMD ["npm", "run", "dev"]

FROM dependencies AS build
WORKDIR /app
ARG VITE_API_BASE_URL
ARG VITE_API_REQUEST_TIMEOUT_MS=12000
ARG VITE_MEDIA_UPLOAD_TIMEOUT_MS=90000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_API_REQUEST_TIMEOUT_MS=${VITE_API_REQUEST_TIMEOUT_MS}
ENV VITE_MEDIA_UPLOAD_TIMEOUT_MS=${VITE_MEDIA_UPLOAD_TIMEOUT_MS}
COPY management/ .
COPY miniprogram/AppleGaramond.ttf /miniprogram/AppleGaramond.ttf
COPY miniprogram/SourceHanSerifCN-Regular.otf /miniprogram/SourceHanSerifCN-Regular.otf
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY management/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
