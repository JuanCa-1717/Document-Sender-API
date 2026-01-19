/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Use system-wide cache for Chromium
  cacheDirectory: process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer',
  // Skip download during npm install; do it explicitly in build
  skipDownload: false,
  // Use Chrome if available, fallback to Chromium
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
};
