const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const USER_DATA_DIR = path.resolve(__dirname, '../.browser_profile');
const WORKOUTS_CACHE_FILE = path.resolve(__dirname, '../data/workouts.json');

class EndurocoScraper {
  constructor() {
    this.userDataDir = USER_DATA_DIR;
    if (!fs.existsSync(path.resolve(__dirname, '../data'))) {
      fs.mkdirSync(path.resolve(__dirname, '../data'), { recursive: true });
    }
  }

  /**
   * Launch browser with persistent profile to allow Google Login once.
   */
  async launchBrowser(headless = false) {
    console.log(`Starting browser with persistent profile at: ${this.userDataDir}`);
    return await puppeteer.launch({
      headless: headless ? 'new' : false,
      userDataDir: this.userDataDir,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ]
    });
  }

  /**
   * Scrape workouts from Enduroco Dashboard & Calendar
   */
  async scrapeWorkouts(options = { headless: false, days: 14 }) {
    const browser = await this.launchBrowser(options.headless);
    const page = await browser.newPage();

    let capturedToken = null;
    const interceptedWorkouts = [];

    // Intercept network requests to grab JSON data directly
    page.on('request', (req) => {
      const authHeader = req.headers()['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ') && !capturedToken) {
        capturedToken = authHeader.replace('Bearer ', '');
        console.log('Captured Enduroco Bearer Token from network!');
      }
    });

    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('workouts') || url.includes('activities') || url.includes('calendar')) {
        try {
          const contentType = res.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const json = await res.json().catch(() => null);
            if (json && (json.workouts || Array.isArray(json))) {
              console.log(`Intercepted workout data payload from: ${url.slice(0, 60)}...`);
              interceptedWorkouts.push(json);
            }
          }
        } catch (e) {}
      }
    });

    console.log('Navigating to Enduroco Dashboard (https://www.enduroco.in/dashboard)...');
    await page.goto('https://www.enduroco.in/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });

    // Check if user is on login page
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('signup')) {
      console.log('\n======================================================');
      console.log('Please sign in with your Google Account in the browser.');
      console.log('Your session will be saved for future automatic runs.');
      console.log('======================================================\n');

      // Wait until user reaches dashboard or calendar
      await page.waitForFunction(
        () => !window.location.href.includes('login') && !window.location.href.includes('signup'),
        { timeout: 180000 }
      );
      console.log('Login detected! Navigating to workout calendar...');
      await page.waitForTimeout(3000);
    }

    // Navigate to calendar if not already there
    await page.goto('https://www.enduroco.in/calendar', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);

    // Scrape DOM elements for scheduled workouts
    console.log('Extracting workout cards from calendar view...');
    const domWorkouts = await page.evaluate(() => {
      const items = [];
      // Look for workout card buttons or sections
      const buttons = document.querySelectorAll('button');
      buttons.forEach((btn) => {
        const text = btn.innerText || '';
        if (text.includes('Load:') || text.includes('min') || text.includes('km') || text.includes('W') || text.includes('Workout')) {
          items.push({
            rawText: text,
            title: btn.querySelector('.font-medium')?.textContent || text.split('\n')[1] || 'Workout',
            duration: btn.querySelector('.font-semibold')?.textContent || '',
            load: text.match(/Load:\s*(\d+)/i)?.[1] || null
          });
        }
      });
      return items;
    });

    // Save results
    const results = {
      scrapedAt: new Date().toISOString(),
      token: capturedToken,
      domWorkouts,
      interceptedWorkouts
    };

    fs.writeFileSync(WORKOUTS_CACHE_FILE, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`Saved scraped workouts to ${WORKOUTS_CACHE_FILE}`);

    await browser.close();
    return results;
  }
}

module.exports = EndurocoScraper;
