## APP BUILD ENVIRONMENT ##
FROM node:16-alpine as builder

# Set Working Directory
WORKDIR /usr/src/app

# Copy License and README File
COPY  package.json ./

# Install Node Modules
RUN npm install

# Copy Application Source
COPY . .

# Build Application to /usr/local/bin/app
RUN npm run build

## APP RUN ENVIRONMENT ##
FROM node:16-alpine

# SET Working Directory
WORKDIR /app

# Copy License and README File
COPY  LICENSE.md README.md package.json ./

# Install Node Modules (Production Only)
RUN npm install --omit=dev

# Copy Application from Build Environment
COPY --from=builder /usr/src/app/dist /app/dist

# Execute Command
CMD ["node", "dist/subscriber.js"]
