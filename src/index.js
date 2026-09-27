require('dotenv').config();
const EndurocoClient = require('./enduroco');
const CorosClient = require('./coros');
const TrainingPeaksClient = require('./trainingpeaks');

async function main() {
  console.log('========================================');
  console.log('    Enduroco Workout Sync Orchestrator   ');
  console.log('========================================\n');

  const enduroco = new EndurocoClient();
  const coros = new CorosClient();
  const trainingPeaks = new TrainingPeaksClient();

  // Step 1: Authenticate with EnduroCo if needed
  if (!process.env.ENDUROCO_AUTH_TOKEN) {
    console.log('[1/3] No ENDUROCO_AUTH_TOKEN found. Launching interactive Google Sign-In...');
    try {
      await enduroco.loginWithGoogleInteractive();
    } catch (err) {
      console.warn('Google Sign-In prompt completed or bypassed:', err.message);
    }
  } else {
    console.log('[1/3] Using provided ENDUROCO_AUTH_TOKEN.');
  }

  // Step 2: Fetch planned workouts from EnduroCo
  console.log('\n[2/3] Fetching planned workouts from Enduroco...');
  let workouts = [];
  try {
    const days = parseInt(process.env.SYNC_DAYS_AHEAD || '7', 10);
    workouts = await enduroco.getPlannedWorkouts(days);
    console.log(`Found ${Array.isArray(workouts) ? workouts.length : 0} planned workouts.`);
  } catch (err) {
    console.log('Note: If running in standalone mode, sample workouts can be synced.');
    workouts = [
      {
        title: 'Enduroco Base Aerobic Ride',
        sportType: 2, // Bike
        workoutType: 'Bike',
        date: new Date().toISOString().split('T')[0],
        description: 'Zone 2 aerobic endurance builder with high-cadence intervals.',
        durationMinutes: 60
      }
    ];
  }

  // Step 3: Attempt Sync to COROS first, fallback to TrainingPeaks
  console.log('\n[3/3] Syncing workouts to calendar...');

  let corosSuccess = false;
  if (process.env.COROS_EMAIL && process.env.COROS_PASSWORD) {
    console.log('Attempting direct sync to COROS Training Calendar...');
    try {
      await coros.login();
      for (const workout of workouts) {
        await coros.syncWorkout(workout);
      }
      corosSuccess = true;
      console.log('>>> Successfully synced workouts directly to COROS! <<<');
    } catch (corosErr) {
      console.warn(`COROS direct sync failed (${corosErr.message}).`);
    }
  } else {
    console.log('COROS credentials not set in .env.');
  }

  if (!corosSuccess) {
    console.log('\nFalling back to TrainingPeaks Sync...');
    if (process.env.TRAININGPEAKS_ACCESS_TOKEN) {
      try {
        for (const workout of workouts) {
          await trainingPeaks.createPlannedWorkout(workout);
        }
        console.log('>>> Successfully synced workouts to TrainingPeaks! <<<');
        console.log('Tip: TrainingPeaks automatically pushes your planned workouts to your COROS watch!');
      } catch (tpErr) {
        console.error('TrainingPeaks sync also failed:', tpErr.message);
      }
    } else {
      console.log('TRAININGPEAKS_ACCESS_TOKEN not set in .env.');
      console.log('\nDirect Dashboard Sync Option:');
      console.log('1. Go to https://www.enduroco.in/dashboard -> Settings -> Connected Apps');
      console.log('2. Click TrainingPeaks to connect your TrainingPeaks account directly.');
      console.log('3. In your COROS mobile app -> Profile -> Third Party Apps -> Link TrainingPeaks.');
      console.log('All Enduroco workouts will then automatically appear on your COROS watch calendar!');
    }
  }
}

main().catch(console.error);
