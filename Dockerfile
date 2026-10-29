# Stage 1: Pre-compress static assets using Brotli (-q 9) and Gzip (-9)
FROM alpine:3.21 AS builder

RUN apk add --no-cache brotli gzip bash findutils

WORKDIR /build

COPY index.html ./
COPY css/ ./css/
COPY js/ ./js/
COPY vendor/ ./vendor/
COPY data/ ./data/

# Pre-compress static files (-q 9 is fast and within 2% of -q 11)
RUN find . -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" -o -name "*.json" -o -name "*.svg" \) \
    -exec gzip -9 -k {} + \
    -exec brotli -q 9 -k {} +

# Stage 2: Production Caddy Web Server
FROM caddy:2.11-alpine

COPY deploy/Caddyfile.container /etc/caddy/Caddyfile
COPY --from=builder /build /srv/osmwd

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/healthz || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
