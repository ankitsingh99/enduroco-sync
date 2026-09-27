const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const CACHE_FILE = path.resolve(__dirname, '../data/workouts.json');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function injectWorkoutsToTrainingPeaks() {
  const username = process.env.TRAININGPEAKS_USERNAME;
  const password = process.env.TRAININGPEAKS_PASSWORD;

  if (!username || !password) {
    console.error('TRAININGPEAKS_USERNAME and TRAININGPEAKS_PASSWORD are required.');
    process.exit(1);
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

  // Deduplicate
  const unique = [];
  const seen = new Set();
  workouts.forEach((item) => {
    if (item.title.toLowerCase().includes('rest day')) return;
    const k = `${item.date}-${item.sport}-${item.title}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(item);
    }
  });

  console.log(`Starting automated calendar placement for ${unique.length} workouts on TrainingPeaks...`);
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = fs.existsSync(systemChrome) ? systemChrome : undefined;

  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  console.log('Logging into TrainingPeaks...');
  await page.goto('https://home.trainingpeaks.com/login', { waitUntil: 'networkidle2', timeout: 60000 });

  if (page.url().includes('login')) {
    await page.type('#Username, input[name="Username"], #UserName', username);
    await page.type('#Password, input[name="Password"]', password);
    await Promise.all([
      page.click('#btnSubmit, #btnLogin, button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);
  }

  console.log('Navigating to TrainingPeaks Calendar...');
  await page.goto('https://app.trainingpeaks.com/#calendar', { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(8000);

  // Close any cookie banners or overlays
  await page.evaluate(() => {
    const banners = document.querySelectorAll('#onetrust-banner-sdk, .ot-sdk-container, .modal-backdrop');
    banners.forEach((b) => b.remove());
  }).catch(() => {});

  let placedCount = 0;
  for (const w of unique) {
    console.log(`Placing workout: [${w.date}] ${w.title} (${w.durationMinutes}m)`);
    const dateSelector = `[data-date="${w.date}"]`;

    // Ensure any open modal is closed
    await page.keyboard.press('Escape');
    await delay(500);

    const dayEl = await page.$(dateSelector);
    if (!dayEl) {
      console.log(`Calendar date cell not visible for ${w.date}. Skipping.`);
      continue;
    }

    try {
      await dayEl.hover();
      await delay(600);

      // Find the + / Add Workout button on the day
      const addBtn = await dayEl.$('button, .addBtn, [class*="add" i], [class*="plus" i]');
      if (addBtn) {
        await addBtn.click();
        await delay(1200);

        // Click sport icon
        const isRun = w.sport.toLowerCase().includes('run');
        await page.evaluate((isRunSport) => {
          const icons = Array.from(document.querySelectorAll('.workoutType, .quickAddIcon, [data-sport], .sportIcon, [class*="workoutType" i], [class*="sport" i]'));
          const target = icons.find((el) => {
            const t = (el.title || el.innerText || el.className || '').toLowerCase();
            return isRunSport ? t.includes('run') : (t.includes('bike') || t.includes('ride') || t.includes('cycle'));
          });
          if (target) target.click();
          else if (icons.length > 0) icons[0].click();
        }, isRun);

        await delay(1500);

        // Fill Title, Description, Duration and Save
        const saved = await page.evaluate(
          (titleText, descText, durationMins) => {
            const titleInput = document.querySelector('input[name="Title"], input[placeholder*="Title" i], .workoutTitle input, [data-field="title"] input');
            if (titleInput) {
              titleInput.value = titleText;
              titleInput.dispatchEvent(new Event('input', { bubbles: true }));
              titleInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const descInput = document.querySelector('textarea[name="Description"], textarea[placeholder*="Description" i], .workoutDescription textarea');
            if (descInput) {
              descInput.value = descText;
              descInput.dispatchEvent(new Event('input', { bubbles: true }));
              descInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const durationInput = document.querySelector('input[name="PlannedDuration"], input[placeholder*="Duration" i], input[placeholder*="Time" i], input[name*="duration" i]');
            if (durationInput) {
              durationInput.value = `${durationMins}`;
              durationInput.dispatchEvent(new Event('input', { bubbles: true }));
              durationInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const saveBtn = Array.from(document.querySelectorAll('button, .btn')).find((b) => {
              const text = (b.innerText || '').toLowerCase();
              return text.includes('save & close') || text.includes('save') || text.includes('done');
            });

            if (saveBtn) {
              saveBtn.click();
              return true;
            }
            return false;
          },
          w.title,
          w.description || `Enduroco planned session (${w.durationMinutes}m)`,
          w.durationMinutes
        );

        if (saved) {
          console.log(`[OK] Placed on TrainingPeaks calendar: [${w.date}] ${w.title}`);
          placedCount++;
        }

        await delay(2500);
      }
    } catch (err) {
      console.log(`Note during placing ${w.title}:`, err.message);
    }
  }

  console.log(`\nCalendar placement completed: ${placedCount}/${unique.length} workouts scheduled.`);
  await delay(3000);
  await browser.close();
  return placedCount;
}

if (require.main === module) {
  injectWorkoutsToTrainingPeaks().catch(console.error);
}

module.exports = injectWorkoutsToTrainingPeaks;
