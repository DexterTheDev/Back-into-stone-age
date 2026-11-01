import { loadClassRows } from '../systems/progress';

export class CsvExport {
  private cache = new Map<string, unknown>();

  studentRows(classCode: string) {
    const key = `studentRows:${classCode}`;
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

  levelRows(classCode: string) {
    const key = `levelRows:${classCode}`;
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

  quizRows(classCode: string) {
    const key = `quizRows:${classCode}`;
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

  districtFormat(classCode: string) {
    const key = `districtFormat:${classCode}`;
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
