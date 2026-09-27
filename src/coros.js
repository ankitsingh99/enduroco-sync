const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const COROS_API_BASE = 'https://teamapi.coros.com';
const EXPORT_DIR = path.resolve(__dirname, '../data/workouts_export');

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
        console.log(`Successfully logged into COROS Training Hub (User ID: ${this.userId}).`);
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
   * Delete / prune past workouts from COROS Training Library and local exports
   * @param {string} beforeDate - Date string YYYY-MM-DD (defaults to today)
   */
  async deletePastWorkouts(beforeDate = new Date().toISOString().split('T')[0]) {
    if (!this.accessToken) {
      await this.login();
    }

    console.log(`\n[Prune] Checking for COROS workouts scheduled before ${beforeDate}...`);
    let deletedCount = 0;

    try {
      const res = await this.apiClient.post('/training/program/query', { pageNumber: 1, size: 100 });
      const programs = res.data?.data || [];

      for (const prog of programs) {
        // Only target active Enduroco synced workouts matching [YYYY-MM-DD]
        if (prog.status === 1 && prog.name) {
          const match = prog.name.match(/^\[(\d{4}-\d{2}-\d{2})\]/);
          if (match) {
            const workoutDate = match[1];
            if (workoutDate < beforeDate) {
              console.log(`[DELETING] Removing past workout: ${prog.name} (ID: ${prog.id})...`);
              const updatePayload = {
                ...prog,
                status: 0 // Deactivate / delete from library
              };
              const delRes = await this.apiClient.post('/training/program/update', updatePayload);
              if (delRes.data?.result === '0000') {
                console.log(`[OK] Deleted past workout from COROS: ${prog.name}`);
                deletedCount++;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error while checking past COROS workouts:', err.message);
    }

    // Also clean up local ZWO exports older than beforeDate
    if (fs.existsSync(EXPORT_DIR)) {
      const files = fs.readdirSync(EXPORT_DIR);
      files.forEach((file) => {
        const match = file.match(/^(\d{4}-\d{2}-\d{2})_/);
        if (match && match[1] < beforeDate) {
          fs.unlinkSync(path.join(EXPORT_DIR, file));
          console.log(`[OK] Removed old local export: ${file}`);
        }
      });
    }

    console.log(`[Prune Finished] Removed ${deletedCount} past workout(s) from COROS.\n`);
    return deletedCount;
  }

  /**
   * Create a structured workout in COROS Training Library
   */
  async createStructuredWorkout(workout) {
    if (!this.accessToken) {
      await this.login();
    }

    const title = workout.title || 'Workout';
    const isRun = (workout.sport || workout.workoutType || '').toLowerCase().includes('run');
    const isStrength = (workout.sport || '').toLowerCase().includes('strength');
    const sportType = isRun ? 1 : (isStrength ? 4 : 2); // 1: Run, 2: Bike, 4: Strength
    const totalDurationSec = (workout.durationMinutes || 30) * 60;
    const desc = workout.description || '';

    // Build exercises / steps for COROS
    const exercises = [];

    // Parse repeat intervals like "3 x (2 minutes Zone 4/2 minutes Zone 1)"
    const repeatMatch = desc.match(/(\d+)\s*x\s*\((.*?)\)/i);
    if (repeatMatch) {
      const repeatCount = parseInt(repeatMatch[1], 10);
      exercises.push({
        name: 'Warm Up',
        sportType,
        exerciseType: 1, // Warmup
        targetType: 2, // Duration
        targetValue: 300,
        intensityType: 0
      });

      for (let i = 0; i < repeatCount; i++) {
        exercises.push({
          name: `Interval ${i + 1}`,
          sportType,
          exerciseType: 2, // Interval/Work
          targetType: 2,
          targetValue: 120, // 2 min
          intensityType: 0
        });
        exercises.push({
          name: `Recovery ${i + 1}`,
          sportType,
          exerciseType: 3, // Rest/Recovery
          targetType: 2,
          targetValue: 120, // 2 min
          intensityType: 0
        });
      }

      exercises.push({
        name: 'Cool Down',
        sportType,
        exerciseType: 3, // Cooldown
        targetType: 2,
        targetValue: 300,
        intensityType: 0
      });
    } else {
      // Steady State or Aerobic Base
      const warmupSec = Math.min(300, Math.round(totalDurationSec * 0.15));
      const cooldownSec = Math.min(300, Math.round(totalDurationSec * 0.15));
      const mainSec = Math.max(300, totalDurationSec - warmupSec - cooldownSec);

      exercises.push({
        name: 'Warm Up',
        sportType,
        exerciseType: 1,
        targetType: 2,
        targetValue: warmupSec,
        intensityType: 0
      });
      exercises.push({
        name: `${title} Main Set`,
        sportType,
        exerciseType: 2,
        targetType: 2,
        targetValue: mainSec,
        intensityType: 0
      });
      exercises.push({
        name: 'Cool Down',
        sportType,
        exerciseType: 3,
        targetType: 2,
        targetValue: cooldownSec,
        intensityType: 0
      });
    }

    const payload = {
      name: `[${workout.date}] ${title}`,
      overview: desc || `Enduroco planned workout (${workout.durationMinutes || 30}m)`,
      sportType,
      targetType: 2,
      targetValue: totalDurationSec,
      exercises
    };

    try {
      const response = await this.apiClient.post('/training/program/add', payload);
      if (response.data?.result === '0000') {
        const programId = response.data?.data;
        console.log(`[OK] Created structured workout in COROS Library: [${workout.date}] ${title} (ID: ${programId})`);
        return { programId, name: payload.name, date: workout.date };
      } else {
        throw new Error(response.data?.message || JSON.stringify(response.data));
      }
    } catch (error) {
      console.error(`[ERROR] Failed to create COROS workout "${title}":`, error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Sync all workouts from JSON list into COROS Training Library
   */
  async syncAllWorkouts(workouts) {
    if (!this.accessToken) {
      await this.login();
    }

    // 1. Delete past workouts first
    await this.deletePastWorkouts();

    // 2. Fetch currently existing active workouts to prevent duplicate creation
    const existing = await this.apiClient.post('/training/program/query', { pageNumber: 1, size: 100 });
    const existingNames = new Set((existing.data?.data || []).filter((p) => p.status === 1).map((p) => p.name));

    const results = [];
    for (const w of workouts) {
      if ((w.title || '').toLowerCase().includes('rest day')) continue;
      const expectedName = `[${w.date}] ${w.title}`;
      if (existingNames.has(expectedName)) {
        console.log(`[SKIP] Workout already exists in COROS: ${expectedName}`);
        continue;
      }
      try {
        const res = await this.createStructuredWorkout(w);
        results.push(res);
      } catch (err) {}
    }
    console.log(`Successfully synced ${results.length} new workouts to COROS Training Library.`);
    return results;
  }
}

module.exports = CorosClient;
