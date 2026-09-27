const EndurocoScraper = require('./scraper');
const TrainingPeaksClient = require('./trainingpeaks');
const WorkoutBuilder = require('./workout-builder');
const SyncState = require('./sync-state');
require('dotenv').config();

async function runSync(options = { force: false }) {
  console.log('====================================================');
  console.log('  Enduroco -> TrainingPeaks Automated Workout Sync  ');
  console.log('====================================================\n');

  const check = SyncState.isSyncNeeded();
  console.log(`[Status Check] ${check.reason}`);
  if (!check.needed && !options.force) {
    console.log('Running standard check/sync now...');
  } else if (check.needed) {
    console.log('[Recovery Mode] Initiating immediate sync due to prior failure or overdue schedule.');
  }

  try {
    // 1. Scrape Workouts from Enduroco
    const scraper = new EndurocoScraper();
    console.log('\n[Step 1] Scraping upcoming workouts from Enduroco...');
    
    const scrapedData = await scraper.scrapeWorkouts({ headless: false, days: 14 });
    console.log('Enduroco scrape completed successfully.');

    // 2. Format and Build Structured Workouts (.ZWO)
    console.log('\n[Step 2] Building structured workouts (.ZWO) for TrainingPeaks / COROS...');
    const tpClient = new TrainingPeaksClient();
    const workoutsToSync = [];

    if (scrapedData?.interceptedWorkouts?.length) {
      for (const batch of scrapedData.interceptedWorkouts) {
        const list = batch.workouts || (Array.isArray(batch) ? batch : []);
        for (const day of list) {
          if (day.workouts && Array.isArray(day.workouts)) {
            for (const item of day.workouts) {
              const sec = item.duration || item.workout_doc?.duration || 0;
              const mins = sec > 0 ? Math.round(sec / 60) : (item.duration || 30);
              workoutsToSync.push({
                title: item.title || item.name || item.subtype || 'Enduroco Workout',
                date: day.workoutdate || new Date().toISOString().split('T')[0],
                sport: item.type || 'Bike',
                workoutType: (item.type || 'Bike').toLowerCase().includes('run') ? 'Run' : 'Bike',
                description: item.description || item.workout_doc?.description || `Enduroco planned workout (${mins}m)`,
                durationMinutes: mins,
                load: item.tss || day.tss || null
              });
            }
          }
        }
      }
    }

    // Deduplicate
    const uniqueWorkouts = [];
    const seen = new Set();
    workoutsToSync.forEach((w) => {
      const k = `${w.date}-${w.workoutType}-${w.title}`;
      if (!seen.has(k)) {
        seen.add(k);
        uniqueWorkouts.push(w);
      }
    });

    // Export ZWO files
    const exportedFiles = WorkoutBuilder.exportAllZWO(uniqueWorkouts);
    console.log(`Generated ${exportedFiles.length} structured .ZWO workout files in data/workouts_export/.`);

    // 3. Connect TrainingPeaks in Enduroco and Sync
    console.log('\n[Step 3] Ensuring TrainingPeaks synchronization...');
    
    if (process.env.TRAININGPEAKS_USERNAME && process.env.TRAININGPEAKS_PASSWORD) {
      console.log('Verifying TrainingPeaks OAuth integration...');
      try {
        await tpClient.authorizeEndurocoIntegration(true);
      } catch (err) {
        console.log('TrainingPeaks connection note:', err.message);
      }
    }

    if (process.env.TRAININGPEAKS_ACCESS_TOKEN) {
      console.log('Pushing workouts directly via TrainingPeaks API...');
      for (const workout of uniqueWorkouts) {
        try {
          await tpClient.createPlannedWorkout(workout);
          console.log(`[OK] Pushed: [${workout.date}] ${workout.title} (${workout.workoutType})`);
        } catch (err) {
          console.error(`[ERROR] Failed to push ${workout.title}:`, err.message);
        }
      }
    }

    // Record successful sync
    SyncState.recordSuccess({ workoutCount: uniqueWorkouts.length, filesExported: exportedFiles.length });

    console.log('\n====================================================');
    console.log('Sync and export completed successfully.');
    console.log(`Structured workout files are available at: data/workouts_export/`);
    console.log('====================================================');
  } catch (error) {
    console.error('\n[SYNC FAILED]', error.message);
    SyncState.recordFailure(error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runSync({ force: true }).catch(console.error);
}

module.exports = runSync;
