export interface ProgressRow { nickname: string; level: number; correct: number; attempts: number; lastStuckSkill?: string }

const KEY = 'fk-progress';

export function loadClassRows(classCode: string): ProgressRow[] {
  return JSON.parse(localStorage.getItem(`${KEY}:${classCode}`) ?? '[]');
}

export function saveRow(classCode: string, row: ProgressRow): void {
  const rows = loadClassRows(classCode).filter((r) => r.nickname !== row.nickname);
  localStorage.setItem(`${KEY}:${classCode}`, JSON.stringify([...rows, row]));
}
