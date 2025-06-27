FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    build-base \
    python3 \
    pkgconfig \
    ffmpeg-dev \
    linux-headers

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

FROM node:18-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S streaming -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=streaming:nodejs . .

# Create necessary directories
RUN mkdir -p logs recordings public && \
    chown -R streaming:nodejs logs recordings public

# Switch to non-root user
USER streaming

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js || exit 1

# Expose ports
EXPOSE 3001 1935 9998 8443

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]