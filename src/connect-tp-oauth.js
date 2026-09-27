const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const USER_DATA_DIR = path.resolve(__dirname, '../.browser_profile');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectTrainingPeaks() {
  const username = process.env.TRAININGPEAKS_USERNAME;
  const password = process.env.TRAININGPEAKS_PASSWORD;

  if (!username || !password) {
    console.error('TRAININGPEAKS_USERNAME and TRAININGPEAKS_PASSWORD are required in .env.');
    process.exit(1);
  }

  console.log('Connecting TrainingPeaks account to Enduroco via OAuth...');
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = fs.existsSync(systemChrome) ? systemChrome : undefined;

  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    userDataDir: USER_DATA_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });

  const page = await browser.newPage();
  const tpAuthUrl = 'https://oauth.trainingpeaks.com/OAuth/Authorize?response_type=code&client_id=enduro-co&scope=workouts:plan%20workouts:read%20athlete:profile&redirect_uri=https://enduroco.in/thirdpartyauth2';

  console.log('Navigating to TrainingPeaks OAuth login...');
  await page.goto(tpAuthUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(2000);

  if (page.url().includes('trainingpeaks.com')) {
    console.log('Filling TrainingPeaks credentials (#UserName / #Password)...');
    await page.waitForSelector('#UserName', { timeout: 15000 });
    await page.type('#UserName', username);
    await page.type('#Password', password);

    console.log('Submitting login (#btnLogin)...');
    await Promise.all([
      page.click('#btnLogin'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);

    await delay(3000);
    console.log('Page after login submission:', page.url());

    // Check if consent button needs to be clicked
    try {
      const allowClicked = await page.evaluate(() => {
        const btn = document.querySelector('#btnAllow, button[name="submit.Allow"], button.btn-primary, button[type="submit"]');
        if (btn && (btn.innerText.toLowerCase().includes('allow') || btn.innerText.toLowerCase().includes('authorize') || btn.id.includes('Allow'))) {
          btn.click();
          return true;
        }
        return false;
      });
      if (allowClicked) {
        console.log('Clicked Allow/Authorize button.');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      }
    } catch (e) {}

    await delay(4000);
    console.log('Final redirected URL:', page.url());
  }

  await browser.close();
}

connectTrainingPeaks().catch(console.error);
