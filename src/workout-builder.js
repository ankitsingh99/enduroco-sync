const fs = require('fs');
const path = require('path');

class WorkoutBuilder {
  /**
   * Parse description text into structured interval steps.
   * Example: "5 minutes Zone 1, 15 minutes Zone 2, 5 minutes Zone 3"
   */
  static parseSteps(description, totalSeconds = 1800) {
    const steps = [];
    const desc = (description || '').toLowerCase();

    // Map zones to target power/pace/HR percentages
    const zoneRatios = {
      'zone 1': { low: 0.50, high: 0.60, target: 0.55 },
      'zone 2': { low: 0.60, high: 0.75, target: 0.68 },
      'zone 3': { low: 0.76, high: 0.90, target: 0.83 },
      'zone 4': { low: 0.91, high: 1.05, target: 0.98 },
      'zone 5': { low: 1.06, high: 1.20, target: 1.12 }
    };

    // Check for repeat intervals like "3 x (2 minutes Zone 4/2 minutes Zone 1)"
    const repeatMatch = desc.match(/(\d+)\s*x\s*\((.*?)\)/i);
    if (repeatMatch) {
      const repeatCount = parseInt(repeatMatch[1], 10);
      const innerContent = repeatMatch[2]; // e.g. "2 minutes Zone 4/2 minutes Zone 1"
      const parts = innerContent.split(/[\/,]/);

      let onDuration = 120;
      let offDuration = 120;
      let onZone = 'zone 4';
      let offZone = 'zone 1';

      if (parts.length >= 2) {
        const onMatch = parts[0].match(/(\d+)\s*min.*?zone\s*(\d)/i);
        const offMatch = parts[1].match(/(\d+)\s*min.*?zone\s*(\d)/i);
        if (onMatch) {
          onDuration = parseInt(onMatch[1], 10) * 60;
          onZone = `zone ${onMatch[2]}`;
        }
        if (offMatch) {
          offDuration = parseInt(offMatch[1], 10) * 60;
          offZone = `zone ${offMatch[2]}`;
        }
      }

      steps.push({
        type: 'IntervalsT',
        repeat: repeatCount,
        onDuration,
        offDuration,
        onPower: zoneRatios[onZone]?.target || 1.0,
        offPower: zoneRatios[offZone]?.target || 0.55
      });
    }

    // Check simple sequential parts like "5 minutes Zone 1, 15 minutes Zone 2"
    const segments = desc.split(/[,+]/);
    segments.forEach((seg) => {
      const segMatch = seg.match(/(\d+)\s*(?:min|minutes).*?zone\s*(\d)/i);
      if (segMatch) {
        const durationSec = parseInt(segMatch[1], 10) * 60;
        const zoneKey = `zone ${segMatch[2]}`;
        steps.push({
          type: 'SteadyState',
          duration: durationSec,
          power: zoneRatios[zoneKey]?.target || 0.65
        });
      }
    });

    // Fallback if no steps parsed
    if (steps.length === 0) {
      const duration = totalSeconds || 1800;
      steps.push({
        type: 'Warmup',
        duration: Math.min(300, Math.round(duration * 0.15)),
        powerLow: 0.50,
        powerHigh: 0.65
      });
      steps.push({
        type: 'SteadyState',
        duration: Math.max(300, duration - 600),
        power: 0.70
      });
      steps.push({
        type: 'Cooldown',
        duration: Math.min(300, Math.round(duration * 0.15)),
        powerLow: 0.65,
        powerHigh: 0.50
      });
    }

    return steps;
  }

  /**
   * Generate ZWO (Zwift Workout XML) file content for TrainingPeaks / COROS
   */
  static generateZWO(workout) {
    const title = workout.title || 'Workout';
    const sportType = (workout.sport || 'bike').toLowerCase().includes('run') ? 'run' : 'bike';
    const description = workout.description || 'Enduroco structured workout';
    const totalDurationSec = (workout.durationMinutes || 30) * 60;
    const steps = this.parseSteps(description, totalDurationSec);

    let xmlSteps = '';
    steps.forEach((s) => {
      if (s.type === 'IntervalsT') {
        xmlSteps += `    <IntervalsT Repeat="${s.repeat}" OnDuration="${s.onDuration}" OffDuration="${s.offDuration}" OnPower="${s.onPower.toFixed(2)}" OffPower="${s.offPower.toFixed(2)}"/>\n`;
      } else if (s.type === 'Warmup') {
        xmlSteps += `    <Warmup Duration="${s.duration}" PowerLow="${s.powerLow.toFixed(2)}" PowerHigh="${s.powerHigh.toFixed(2)}"/>\n`;
      } else if (s.type === 'Cooldown') {
        xmlSteps += `    <Cooldown Duration="${s.duration}" PowerLow="${s.powerLow.toFixed(2)}" PowerHigh="${s.powerHigh.toFixed(2)}"/>\n`;
      } else {
        xmlSteps += `    <SteadyState Duration="${s.duration || 600}" Power="${(s.power || 0.70).toFixed(2)}"/>\n`;
      }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>Enduroco</author>
  <name>${title}</name>
  <description>${description}</description>
  <sportType>${sportType}</sportType>
  <tags>
    <tag name="Enduroco"/>
    <tag name="${sportType}"/>
  </tags>
  <workout>
${xmlSteps}  </workout>
</workout_file>`;
  }

  /**
   * Export all workouts into .zwo files inside data/workouts_export/
   */
  static exportAllZWO(workouts, outputDir = path.resolve(__dirname, '../data/workouts_export')) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const exportedFiles = [];
    workouts.forEach((w, idx) => {
      if (w.title.toLowerCase().includes('rest day')) return;
      const safeTitle = w.title.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${w.date}_${safeTitle}.zwo`;
      const filePath = path.join(outputDir, filename);
      const zwoContent = this.generateZWO(w);
      fs.writeFileSync(filePath, zwoContent, 'utf-8');
      exportedFiles.push({ filename, filePath, date: w.date, title: w.title });
    });

    return exportedFiles;
  }
}

module.exports = WorkoutBuilder;
