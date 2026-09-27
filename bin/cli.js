#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const action = process.argv[2] || 'sync';

switch (action) {
  case 'scrape':
    console.log('Running Enduroco scraper...');
    const Scraper = require('../src/scraper');
    new Scraper().scrapeWorkouts().then(() => {
      console.log('Scraping finished.');
    }).catch(console.error);
    break;

  case 'prune':
  case 'clean':
    console.log('Running past workouts prune on COROS...');
    const CorosClient = require('../src/coros');
    const coros = new CorosClient();
    coros.deletePastWorkouts().then(() => {
      console.log('Prune finished.');
    }).catch(console.error);
    break;

  case 'import':
  case 'upload':
    console.log('Running automated workout importer...');
    const WorkoutImporter = require('../src/importer');
    WorkoutImporter.run().catch(console.error);
    break;

  case 'coros':
    console.log('Running direct COROS sync...');
    require('../src/index');
    break;

  case 'tp':
  case 'trainingpeaks':
  case 'sync':
  default:
    console.log('Running Enduroco -> TrainingPeaks / COROS sync...');
    const runSync = require('../src/sync-trainingpeaks');
    runSync({ force: true }).then(async () => {
      const Importer = require('../src/importer');
      await Importer.run();
    }).catch(console.error);
    break;
}
