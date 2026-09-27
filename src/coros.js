const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const COROS_API_BASE = 'https://teamapi.coros.com';

class CorosClient {
  constructor(email = process.env.COROS_EMAIL, password = process.env.COROS_PASSWORD) {
    this.email = email;
    this.password = password;
    this.accessToken = null;
    this.userId = null;
    this.apiClient = axios.create({
      baseURL: COROS_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
  }

  /**
   * Authenticate with COROS Training Hub API
   */
  async login() {
    if (!this.email || !this.password) {
      throw new Error('COROS_EMAIL and COROS_PASSWORD are required.');
    }

    // COROS MD5 password hash
    const md5Password = crypto.createHash('md5').update(this.password).digest('hex');

    try {
      const response = await this.apiClient.post('/account/login', {
        account: this.email,
        pwd: md5Password,
        accountType: 2
      });

      if (response.data?.result === '0000' && response.data?.data?.accessToken) {
        this.accessToken = response.data.data.accessToken;
        this.userId = response.data.data.userId;
        this.apiClient.defaults.headers['accessToken'] = this.accessToken;
        console.log('Successfully logged into COROS Training Hub.');
        return true;
      } else {
        throw new Error(`COROS Login failed: ${response.data?.message || JSON.stringify(response.data)}`);
      }
    } catch (error) {
      console.error('COROS authentication error:', error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Push a structured workout to COROS Calendar
   */
  async syncWorkout(workout) {
    if (!this.accessToken) {
      await this.login();
    }

    try {
      const payload = {
        name: workout.title || workout.name || 'Enduroco Workout',
        sportType: workout.sportType || 1, // 1: Run, 2: Bike, 3: Swim
        date: workout.date || new Date().toISOString().split('T')[0],
        description: workout.description || '',
        steps: workout.steps || []
      };

      const response = await this.apiClient.post('/training/workout/create', payload);
      console.log(`Synced workout "${payload.name}" to COROS calendar (${payload.date})`);
      return response.data;
    } catch (error) {
      console.error('Failed to sync workout to COROS:', error?.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = CorosClient;
