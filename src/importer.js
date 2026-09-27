const path = require('path');
const fs = require('fs');
const CorosClient = require('./coros');
const TrainingPeaksClient = require('./trainingpeaks');
const WorkoutBuilder = require('./workout-builder');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const CACHE_FILE = path.resolve(__dirname, '../data/workouts.json');

class WorkoutImporter {
  static getWorkouts() {
    if (!fs.existsSync(CACHE_FILE)) {
      console.log('No cached workouts found. Run scraper first.');
      return [];
    }

    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const today = new Date().toISOString().split('T')[0];
    const workouts = [];

    (data.interceptedWorkouts || []).forEach((batch) => {
      const arr = batch.workouts || (Array.isArray(batch) ? batch : []);
      arr.forEach((day) => {
        const date = day.workoutdate || day.date;
        if (date && date >= today) {
          (day.workouts || []).forEach((w) => {
            const sec = w.duration || w.workout_doc?.duration || 0;
            const mins = sec > 0 ? Math.round(sec / 60) : (w.duration || 30);
            workouts.push({
              date,
              sport: w.type || w.sportType || 'Workout',
              title: w.title || w.name || w.subtype || 'Workout',
              durationMinutes: mins,
              load: w.tss || day.tss || w.training_load || null,
              description: w.description || w.workout_doc?.description || ''
            });
          });
        }
      });
    });

    const unique = [];
    const seen = new Set();
    workouts.forEach((item) => {
      const k = `${item.date}-${item.sport}-${item.title}`;
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(item);
      }
    });

    return unique;
  }

  static async importToCoros() {
    if (!process.env.COROS_EMAIL || !process.env.COROS_PASSWORD) {
      console.log('COROS credentials not found in .env.');
      return false;
    }

    const workouts = this.getWorkouts();
    if (workouts.length === 0) {
      console.log('No workouts to import to COROS.');
      return false;
    }

    console.log(`Importing ${workouts.length} workouts directly to COROS Training Hub...`);
    const coros = new CorosClient();
    try {
      await coros.login();
      await coros.syncAllWorkouts(workouts);
      console.log('COROS direct import completed.');
      return true;
    } catch (err) {
      console.error('Error during COROS direct import:', err.message);
      return false;
    }
  }

  static async run() {
    console.log('====================================================');
    console.log('     Automated Workout Calendar Importer            ');
    console.log('====================================================\n');

    const workouts = this.getWorkouts();
    WorkoutBuilder.exportAllZWO(workouts);

    let corosSuccess = false;
    if (process.env.COROS_EMAIL && process.env.COROS_PASSWORD) {
      corosSuccess = await this.importToCoros();
    }

    if (!corosSuccess) {
      console.log('Proceeding with TrainingPeaks sync...');
      const tpClient = new TrainingPeaksClient();
      await tpClient.authorizeEndurocoIntegration(true);
    }

    console.log('\n====================================================');
    console.log('Import completed.');
    console.log('Workouts are synchronized to your devices.');
    console.log('====================================================');
  }
}

if (require.main === module) {
  WorkoutImporter.run().catch(console.error);
}

module.exports = WorkoutImporter;
