// Drives a model through contradictions. "restart" clears the whole output
// and tries again; "backtrack" marks the model's undo trail before each
// choice and, on a contradiction, undoes back to the latest mark and chooses
// again. A mark that keeps failing is dropped in favour of an older one. When
// no mark is left, or an attempt has used up its backtracking budget (some
// contradictions are seeded far from where they appear, and undoing the last
// few choices never reaches the cause), the whole output starts again.

import { PROGRESS, DONE, CONTRADICTION } from './model.js';

export const STOP = 'stop';
export const RESTART = 'restart';
export const BACKTRACK = 'backtrack';

export class Weaver {
  constructor(model, { mode = BACKTRACK, interval = 1, keep = 8, failuresPerSave = 3, budget = 32, maxRestarts = 200, prepare = null } = {}) {
    this.model = model;
    this.mode = mode;
    this.interval = interval;
    this.keep = keep;
    this.failuresPerSave = failuresPerSave;
    this.budget = budget;
    this.maxRestarts = maxRestarts;
    // Applied after every clear, before any choice: pinned pixels, for one.
    // Marks are taken after it, so backing up never undoes it.
    this.prepare = prepare;
    this.reset();
  }

  reset() {
    this.clearModel();
    this.saves = [];
    this.backtracks = 0;
    this.attemptBacktracks = 0;
    this.restarts = 0;
    this.choices = 0;
  }

  clearModel() {
    this.model.clear();
    // A contradiction straight after preparing has nothing random to blame,
    // so no restart can fix it.
    this.infeasible = Boolean(this.prepare) && this.prepare(this.model) === false;
    if (this.infeasible) this.model.status = CONTRADICTION;
  }

  get status() {
    return this.model.status;
  }

  save() {
    this.saves.push({ mark: this.model.mark(), decisions: this.model.decisions, failures: 0 });
    if (this.saves.length > this.keep) this.saves.shift();
  }

  recover() {
    const m = this.model;
    if (this.mode === BACKTRACK && this.attemptBacktracks < this.budget) {
      while (this.saves.length > 0) {
        const top = this.saves[this.saves.length - 1];
        if (top.failures < this.failuresPerSave) {
          top.failures++;
          m.undo(top.mark);
          this.backtracks++;
          this.attemptBacktracks++;
          return true;
        }
        this.saves.pop();
      }
    }
    if (this.mode === STOP || this.infeasible || this.restarts >= this.maxRestarts) return false;
    this.restarts++;
    this.clearModel();
    this.saves = [];
    this.attemptBacktracks = 0;
    return true;
  }

  // One choice, recovering from a contradiction if the mode allows.
  step(rng) {
    const m = this.model;
    if (m.status === CONTRADICTION && !this.recover()) return m.status;
    if (m.status !== PROGRESS) return m.status;
    if (this.mode === BACKTRACK && m.decisions % this.interval === 0) {
      const top = this.saves[this.saves.length - 1];
      if (!top || top.decisions !== m.decisions) this.save();
    }
    const status = m.step(rng);
    if (status !== DONE) this.choices++;
    if (status === CONTRADICTION && this.recover()) return PROGRESS;
    return m.status;
  }

  run(rng, maxSteps = Infinity) {
    for (let s = 0; s < maxSteps && this.step(rng) === PROGRESS; s++);
    return this.model.status;
  }
}
