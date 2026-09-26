// Puppeteer is only for the local QA scripts in tools/qa. Cloudflare Pages (CF_PAGES) and CI run `npm install`
// on every push and must NOT download a ~150 MB Chromium — that download is what broke every Pages build after
// puppeteer became a devDependency. Locally the browser still downloads as normal.
module.exports = {
  skipDownload: Boolean(process.env.CF_PAGES || process.env.CI),
};
