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

  case 'coros':
    console.log('Running COROS sync...');
    require('../src/index');
    break;

  case 'tp':
  case 'trainingpeaks':
  case 'sync':
  default:
    console.log('Running Enduroco -> TrainingPeaks sync...');
    require('../src/sync-trainingpeaks');
    break;
}
