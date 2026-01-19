FROM node:18-bullseye

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-common \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /opt/render/project/src

# Copy package files
COPY package*.json ./
COPY .puppeteerrc.cjs ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit

# Copy app code
COPY . .

# Expose port
EXPOSE 10000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=10000
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Start app
CMD ["node", "server.js"]
