const axios = require('axios');
const puppeteer = require('puppeteer');
require('dotenv').config();

const ENDUROCO_BASE_URL = 'https://www.enduroco.in';

class EndurocoClient {
  constructor(token = process.env.ENDUROCO_AUTH_TOKEN) {
    this.token = token;
    this.apiClient = axios.create({
      baseURL: ENDUROCO_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });
  }

  /**
   * Launch a browser session for Google Auth login to EnduroCo.
   * Extracts Firebase / Auth tokens upon successful login.
   */
  async loginWithGoogleInteractive() {
    console.log('Launching browser for Enduroco Google Sign-In...');
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });

    const page = await browser.newPage();
    await page.goto(`${ENDUROCO_BASE_URL}/login`, { waitUntil: 'networkidle2' });

    console.log('Please complete your Google Sign-In in the browser window...');

    // Wait for redirect to dashboard or token in localStorage
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});

    // Retrieve auth token from localStorage/cookies
    const token = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('firebase:authUser') || key.includes('token') || key.includes('auth'))) {
          try {
            const val = JSON.parse(localStorage.getItem(key));
            if (val?.stsTokenManager?.accessToken) {
              return val.stsTokenManager.accessToken;
            }
          } catch (e) {}
        }
      }
      return null;
    });

    if (token) {
      this.token = token;
      this.apiClient.defaults.headers.Authorization = `Bearer ${token}`;
      console.log('Successfully captured Enduroco authentication token!');
    } else {
      console.log('Browser session finished. If logged in, session cookies are preserved.');
    }

    await browser.close();
    return this.token;
  }

  /**
   * Fetch planned workouts for the upcoming days
   */
  async getPlannedWorkouts(days = 7) {
    if (!this.token) {
      throw new Error('Authentication token required. Call loginWithGoogleInteractive() or set ENDUROCO_AUTH_TOKEN.');
    }

    try {
      const response = await this.apiClient.get('/api/athlete/workouts/calendar', {
        params: { days }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch Enduroco workouts:', error?.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = EndurocoClient;
