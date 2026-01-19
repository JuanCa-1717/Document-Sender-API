/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Use Chromium from system in Render (via PUPPETEER_EXECUTABLE_PATH)
  // Or fallback to Puppeteer's downloaded version locally
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  // Cache directory for downloads (local dev only)
  cacheDirectory: process.env.PUPPETEER_CACHE_DIR || './.cache/puppeteer',
};
