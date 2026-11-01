import { loadClassRows } from '../systems/progress';

export class RosterView {
  private cache = new Map<string, unknown>();

  byStudent(classCode: string) {
    const key = `byStudent:${classCode}`;
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

  byLevel(classCode: string) {
    const key = `byLevel:${classCode}`;
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

  stuckStudents(classCode: string) {
    const key = `stuckStudents:${classCode}`;
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

  absentStudents(classCode: string) {
    const key = `absentStudents:${classCode}`;
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

  sortedByAccuracy(classCode: string) {
    const key = `sortedByAccuracy:${classCode}`;
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

  nicknamesOnly(classCode: string) {
    const key = `nicknamesOnly:${classCode}`;
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
