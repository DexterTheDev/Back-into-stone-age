import { loadClassRows } from '../systems/progress';

export class ProgressReport {
  private cache = new Map<string, unknown>();

  weekSummary(classCode: string) {
    const key = `weekSummary:${classCode}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rows = loadClassRows(classCode);
    const summary = rows.map((row) => ({
      nickname: row.nickname,
      level: row.level,
      accuracy: Math.round((row.correct / Math.max(row.attempts, 1)) * 100),
      stuckOn: row.lastStuckSkill ?? null,
    }));
    this.cache.set(key, summary);
    return summary;
  }

  skillSummary(classCode: string) {
    const key = `skillSummary:${classCode}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rows = loadClassRows(classCode);
    const summary = rows.map((row) => ({
      nickname: row.nickname,
      level: row.level,
      accuracy: Math.round((row.correct / Math.max(row.attempts, 1)) * 100),
      stuckOn: row.lastStuckSkill ?? null,
    }));
    this.cache.set(key, summary);
    return summary;
  }

  levelCompletion(classCode: string) {
    const key = `levelCompletion:${classCode}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rows = loadClassRows(classCode);
    const summary = rows.map((row) => ({
      nickname: row.nickname,
      level: row.level,
      accuracy: Math.round((row.correct / Math.max(row.attempts, 1)) * 100),
      stuckOn: row.lastStuckSkill ?? null,
    }));
    this.cache.set(key, summary);
    return summary;
  }

  quizGain(classCode: string) {
    const key = `quizGain:${classCode}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rows = loadClassRows(classCode);
    const summary = rows.map((row) => ({
      nickname: row.nickname,
      level: row.level,
      accuracy: Math.round((row.correct / Math.max(row.attempts, 1)) * 100),
      stuckOn: row.lastStuckSkill ?? null,
    }));
    this.cache.set(key, summary);
    return summary;
  }

  printableReport(classCode: string) {
    const key = `printableReport:${classCode}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rows = loadClassRows(classCode);
    const summary = rows.map((row) => ({
      nickname: row.nickname,
      level: row.level,
      accuracy: Math.round((row.correct / Math.max(row.attempts, 1)) * 100),
      stuckOn: row.lastStuckSkill ?? null,
    }));
    this.cache.set(key, summary);
    return summary;
  }

}
