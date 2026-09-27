const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openCorosHub() {
  console.log('====================================================');
  console.log('      Launching COROS Training Hub Web UI           ');
  console.log('====================================================\n');

  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = fs.existsSync(systemChrome) ? systemChrome : undefined;

  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  console.log('Navigating to COROS Training Hub (https://t.coros.com)...');
  await page.goto('https://t.coros.com/login', { waitUntil: 'networkidle2' });
  await delay(2000);

  // Fill email & password
  const emailInput = await page.$('input[placeholder*="E-mail" i], input[type="text"]');
  if (emailInput && process.env.COROS_EMAIL) {
    await emailInput.click();
    await emailInput.type(process.env.COROS_EMAIL);
  }

  const pwdInput = await page.$('input[type="password"]');
  if (pwdInput && process.env.COROS_PASSWORD) {
    await pwdInput.click();
    await pwdInput.type(process.env.COROS_PASSWORD);
  }

  // Click Agreement checkbox
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label, span, div'));
    const policy = labels.find((l) => l.innerText?.includes('Privacy Policy'));
    if (policy) policy.click();
  });

  console.log('COROS credentials filled in browser.');
  console.log('Browser is running. You can click Login or navigate directly to the Calendar!');
}

if (require.main === module) {
  openCorosHub().catch(console.error);
}

module.exports = openCorosHub;
