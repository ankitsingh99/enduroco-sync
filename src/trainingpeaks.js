const axios = require('axios');
const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config();

const TP_API_BASE = 'https://api.trainingpeaks.com/v1';
const TP_USER_DATA_DIR = path.resolve(__dirname, '../.tp_browser_profile');

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
   * Log into TrainingPeaks web app via Puppeteer to push workouts or session sync
   */
  async loginWeb(headless = false) {
    if (!this.username || !this.password) {
      console.log('No TRAININGPEAKS_USERNAME/PASSWORD provided in .env.');
      return false;
    }

    console.log('Logging into TrainingPeaks web session...');
    const browser = await puppeteer.launch({
      headless: headless ? 'new' : false,
      userDataDir: TP_USER_DATA_DIR,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://home.trainingpeaks.com/login', { waitUntil: 'networkidle2' });

    if (page.url().includes('login')) {
      await page.type('#Username', this.username);
      await page.type('#Password', this.password);
      await Promise.all([
        page.click('#Submit'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);
    }

    console.log('TrainingPeaks web session active.');
    await browser.close();
    return true;
  }

  /**
   * Sync planned workout to TrainingPeaks calendar via API
   */
  async createPlannedWorkout(workout) {
    if (!this.accessToken) {
      throw new Error('TRAININGPEAKS_ACCESS_TOKEN is required for API sync, or configure credentials in .env.');
    }

    try {
      const payload = {
        workoutDate: workout.date || new Date().toISOString().split('T')[0],
        workoutType: workout.workoutType || 'Bike', // Bike, Run, Swim
        title: workout.title || workout.name || 'Enduroco Planned Workout',
        description: workout.description || '',
        plannedDuration: workout.durationMinutes ? workout.durationMinutes / 60 : 1.0,
        structure: workout.structure || null
      };

      const response = await this.apiClient.post('/workouts/planned', payload);
      console.log(`Synced workout "${payload.title}" to TrainingPeaks calendar (${payload.workoutDate})`);
      return response.data;
    } catch (error) {
      console.error('Failed to sync to TrainingPeaks:', error?.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = TrainingPeaksClient;
