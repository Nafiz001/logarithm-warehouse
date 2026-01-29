FROM node:18-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy package files (including lock file for reproducible builds)
COPY package.json package-lock.json ./

# Install dependencies using ci for reproducible builds
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3002

CMD ["node", "src/index.js"]
