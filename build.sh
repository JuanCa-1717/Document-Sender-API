#!/bin/bash

# Install dependencies
npm ci

# Download Chromium for Puppeteer
npx puppeteer browsers install chrome

echo "Build complete: Chromium installed"
