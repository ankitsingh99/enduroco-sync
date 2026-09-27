const fs = require('fs');
const path = require('path');

const STATE_FILE = path.resolve(__dirname, '../data/sync-state.json');

class SyncState {
  static getState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      }
    } catch (e) {}
    return {
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastStatus: 'NEVER_RUN',
      lastError: null,
      consecutiveFailures: 0
    };
  }

  static recordSuccess(meta = {}) {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const state = {
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      lastStatus: 'SUCCESS',
      lastError: null,
      consecutiveFailures: 0,
      ...meta
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    return state;
  }

  static recordFailure(error) {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const current = this.getState();
    const state = {
      ...current,
      lastAttemptAt: new Date().toISOString(),
      lastStatus: 'FAILED',
      lastError: error?.message || String(error),
      consecutiveFailures: (current.consecutiveFailures || 0) + 1
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    return state;
  }

  static isSyncNeeded() {
    const state = this.getState();
    if (state.lastStatus === 'FAILED') {
      return { needed: true, reason: `Previous sync attempt failed with error: ${state.lastError}` };
    }
    if (!state.lastSuccessAt) {
      return { needed: true, reason: 'No successful sync recorded yet.' };
    }

    const lastSuccess = new Date(state.lastSuccessAt).getTime();
    const now = Date.now();
    const hoursSinceLast = (now - lastSuccess) / (1000 * 60 * 60);

    if (hoursSinceLast >= 24) {
      return { needed: true, reason: `Last successful sync was ${Math.round(hoursSinceLast)} hours ago.` };
    }

    return { needed: false, reason: `Last sync was successful at ${state.lastSuccessAt}.` };
  }
}

module.exports = SyncState;
