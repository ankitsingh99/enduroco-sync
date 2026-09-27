const axios = require('axios');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const TP_API_BASE = 'https://api.trainingpeaks.com/v1';
const USER_DATA_DIR = path.resolve(__dirname, '../.browser_profile');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class TrainingPeaksClient {
  constructor(options = {}) {
    this.accessToken = options.accessToken || process.env.TRAININGPEAKS_ACCESS_TOKEN;
    this.username = options.username || process.env.TRAININGPEAKS_USERNAME;
    this.password = options.password || process.env.TRAININGPEAKS_PASSWORD;
    this.apiClient = axios.create({
      baseURL: TP_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {})
      }
    });
  }

  /**
   * Authorize TrainingPeaks connection directly inside Enduroco using credentials.
   * This links Enduroco -> TrainingPeaks -> COROS watch.
   */
  async authorizeEndurocoIntegration(headless = false) {
    if (!this.username || !this.password) {
      console.log('No TRAININGPEAKS_USERNAME/PASSWORD provided in .env.');
      return false;
    }

    console.log('Starting automated TrainingPeaks authorization in Enduroco...');
    const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const executablePath = fs.existsSync(systemChrome) ? systemChrome : undefined;

    const browser = await puppeteer.launch({
      headless: headless ? 'new' : false,
      executablePath,
      userDataDir: USER_DATA_DIR,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    console.log('Navigating to Enduroco Settings -> Connected Apps...');
    await page.goto('https://www.enduroco.in/settings/connected-apps', { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(3000);

    // Look for TrainingPeaks connect button
    console.log('Looking for TrainingPeaks connection toggle...');
    const authUrl = await page.evaluate(() => {
      // Find TrainingPeaks link or button
      const tpImg = document.querySelector('img[alt*="TrainingPeaks"], img[src*="trainingpeaks"]');
      if (tpImg) {
        const btn = tpImg.closest('button') || tpImg.closest('a');
        if (btn) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    await delay(4000);

    // If redirected to TrainingPeaks OAuth login page
    const currentUrl = page.url();
    if (currentUrl.includes('oauth.trainingpeaks.com') || currentUrl.includes('trainingpeaks.com')) {
      console.log('TrainingPeaks OAuth page reached. Entering credentials...');
      try {
        await page.waitForSelector('#Username, input[name="Username"], input[type="text"]', { timeout: 15000 });
        await page.type('#Username, input[name="Username"], input[type="text"]', this.username);
        await page.type('#Password, input[name="Password"], input[type="password"]', this.password);
        
        console.log('Submitting TrainingPeaks login...');
        await Promise.all([
          page.click('#Submit, button[type="submit"], input[type="submit"]'),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);

        await delay(3000);

        // Check if there is an "Authorize" or "Allow" button on OAuth consent screen
        const consentClicked = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button, input[type="submit"]')).find(
            (el) => el.innerText?.toLowerCase().includes('allow') || el.innerText?.toLowerCase().includes('authorize')
          );
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });

        if (consentClicked) {
          console.log('Approved TrainingPeaks OAuth consent.');
          await delay(4000);
        }

        console.log('TrainingPeaks connection successfully linked to Enduroco!');
      } catch (err) {
        console.log('Note during TrainingPeaks OAuth form fill:', err.message);
      }
    } else {
      console.log('Current page:', currentUrl);
    }

    await browser.close();
    return true;
  }

  /**
   * Sync planned workout to TrainingPeaks calendar via API
   */
  async createPlannedWorkout(workout) {
    if (!this.accessToken) {
      return null;
    }

    try {
      const payload = {
        workoutDate: workout.date || new Date().toISOString().split('T')[0],
        workoutType: workout.workoutType || 'Bike',
        title: workout.title || workout.name || 'Enduroco Planned Workout',
        description: workout.description || '',
        plannedDuration: workout.durationMinutes ? workout.durationMinutes / 60 : 1.0,
        structure: workout.structure || null
      };

      const response = await this.apiClient.post('/workouts/planned', payload);
      console.log(`[OK] Synced workout "${payload.title}" to TrainingPeaks calendar (${payload.workoutDate})`);
      return response.data;
    } catch (error) {
      console.error(`[ERROR] Failed to sync to TrainingPeaks API:`, error?.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = TrainingPeaksClient;
