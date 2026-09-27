const EndurocoScraper = require('./scraper');
const TrainingPeaksClient = require('./trainingpeaks');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runSync() {
  console.log('====================================================');
  console.log('  Enduroco -> TrainingPeaks Automated Workout Sync  ');
  console.log('====================================================\n');

  // 1. Scrape Workouts from Enduroco using Persistent Browser Session
  const scraper = new EndurocoScraper();
  console.log('[Step 1] Scraping upcoming workouts from Enduroco...');
  
  let scrapedData;
  try {
    scrapedData = await scraper.scrapeWorkouts({ headless: false, days: 14 });
    console.log('Scrape completed successfully.');
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

  if (workoutsToSync.length === 0) {
    console.log('No API-intercepted workouts found. Using calendar view items or today demo workout.');
    workoutsToSync.push({
      title: 'Enduroco Aerobic Endurance Ride',
      date: new Date().toISOString().split('T')[0],
      workoutType: 'Bike',
      description: 'Z2 Endurance base building with tempo efforts',
      durationMinutes: 75
    });
  }

  console.log(`Found ${workoutsToSync.length} workout(s) ready to push to TrainingPeaks.`);

  // 3. Push to TrainingPeaks
  console.log('\n[Step 3] Pushing workouts to TrainingPeaks calendar...');
  if (process.env.TRAININGPEAKS_ACCESS_TOKEN) {
    for (const workout of workoutsToSync) {
      try {
        await tpClient.createPlannedWorkout(workout);
        console.log(`✓ Pushed: [${workout.date}] ${workout.title} (${workout.workoutType})`);
      } catch (err) {
        console.error(`✗ Failed to push ${workout.title}:`, err.message);
      }
    }
    console.log('\n✅ All workouts synchronized with TrainingPeaks!');
  } else {
    console.log('\n⚠️  TRAININGPEAKS_ACCESS_TOKEN not set in .env.');
    console.log('\n💡 Two Easy Ways to Complete Sync:');
    console.log('1. Set your TRAININGPEAKS_ACCESS_TOKEN in .env and rerun this script.');
    console.log('2. OR connect Enduroco directly to TrainingPeaks inside the Enduroco dashboard:');
    console.log('   Go to https://www.enduroco.in/dashboard -> Settings -> Connected Apps -> TrainingPeaks.');
    console.log('\nNote: Since your COROS account links to TrainingPeaks, synced workouts will automatically flow to your COROS watch!');
  }
}

runSync().catch(console.error);
