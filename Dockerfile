# base image: base dependencies and Prisma generation
FROM node:24-alpine AS base

WORKDIR /app

# Install all dependencies
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./

COPY tsconfig*.json nest-cli.json ./

# Use fake DATABASE_URL to avoid errors during Prisma generation
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build

# Generate Prisma client
RUN npx prisma generate

# dev image: fully containerized development environment
FROM base AS dev

ENV NODE_ENV=development

COPY src ./src

# Default command to run the application in development mode (with hot reloading)
CMD ["npm", "run", "start:dev"]

# test image: run tests in a containerized environment
FROM base AS test

ENV NODE_ENV=test

# Copy the application code into the container
COPY . .

# Default command to run unit tests in the containerized environment
CMD ["npm", "run", "test"]

# builder image: prepare the application for production by building it and copying only necessary files to the final image
FROM base AS builder

# Copy the application code into the container
COPY src ./src

# Build the application for production
RUN npm run build

# prod image: production-ready image with only necessary files
FROM node:24-alpine AS prod

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force

# Copy the built application from the builder stage
COPY --from=builder /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/main"]