const EndurocoScraper = require('./scraper');
const TrainingPeaksClient = require('./trainingpeaks');
require('dotenv').config();

async function runSync() {
  console.log('====================================================');
  console.log('  Enduroco -> TrainingPeaks Automated Workout Sync  ');
  console.log('====================================================\n');

  // 1. Scrape Workouts from Enduroco
  const scraper = new EndurocoScraper();
  console.log('[Step 1] Scraping upcoming workouts from Enduroco...');
  
  let scrapedData;
  try {
    scrapedData = await scraper.scrapeWorkouts({ headless: false, days: 14 });
    console.log('Enduroco scrape completed successfully.');
  } catch (error) {
    console.error('Error during Enduroco scraping:', error.message);
  }

  // 2. Format Workouts for TrainingPeaks
  console.log('\n[Step 2] Formatting workouts for TrainingPeaks...');
  const tpClient = new TrainingPeaksClient();
  const workoutsToSync = [];

  if (scrapedData?.interceptedWorkouts?.length) {
    for (const batch of scrapedData.interceptedWorkouts) {
      const list = batch.workouts || (Array.isArray(batch) ? batch : []);
      for (const day of list) {
        if (day.workouts && Array.isArray(day.workouts)) {
          for (const item of day.workouts) {
            workoutsToSync.push({
              title: item.title || item.name || 'Enduroco Workout',
              date: day.workoutdate || new Date().toISOString().split('T')[0],
              workoutType: (item.type || 'Bike').toLowerCase().includes('run') ? 'Run' : 'Bike',
              description: item.description || `Enduroco planned workout (${item.duration || 60}m)`,
              durationMinutes: item.duration || 60
            });
          }
        }
      }
    }
  }

  console.log(`Found ${workoutsToSync.length} workout(s) parsed from Enduroco.`);

  // 3. Connect TrainingPeaks in Enduroco and Sync
  console.log('\n[Step 3] Ensuring TrainingPeaks synchronization...');
  
  if (process.env.TRAININGPEAKS_USERNAME && process.env.TRAININGPEAKS_PASSWORD) {
    console.log('Authorizing TrainingPeaks integration directly using provided credentials...');
    try {
      await tpClient.authorizeEndurocoIntegration(false);
    } catch (err) {
      console.log('Note on TrainingPeaks authorization:', err.message);
    }
  }

  if (process.env.TRAININGPEAKS_ACCESS_TOKEN) {
    console.log('Pushing workouts directly via TrainingPeaks API...');
    for (const workout of workoutsToSync) {
      try {
        await tpClient.createPlannedWorkout(workout);
        console.log(`[OK] Pushed: [${workout.date}] ${workout.title} (${workout.workoutType})`);
      } catch (err) {
        console.error(`[ERROR] Failed to push ${workout.title}:`, err.message);
      }
    }
  }

  console.log('\n====================================================');
  console.log('Sync process completed.');
  console.log('Your TrainingPeaks workouts will automatically flow to your COROS watch calendar.');
  console.log('====================================================');
}

runSync().catch(console.error);
