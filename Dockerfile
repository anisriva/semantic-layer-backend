FROM node:22-alpine AS builder

WORKDIR /app

# Install only necessary build dependencies
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# Create production-only node_modules
RUN npm prune --production

# Final stage with minimal runtime dependencies
FROM node:22-alpine

WORKDIR /app

# Install only necessary runtime dependencies
RUN apk add --no-cache openssl

# Copy only production dependencies and built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Use non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/src/api-server.js"]