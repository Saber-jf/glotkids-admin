# GlotKids panel (Coolify, Dockerfile build pack, port 80).
# The panel calls /api/... on its own address; Caddy passes those to the
# server named by API_UPSTREAM (default: the public API address).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
ENV API_UPSTREAM=https://glotkids-api.imtiyaz.io
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
