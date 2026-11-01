export interface QuizResult { nickname: string; phase: 'pre' | 'post'; score: number }

export function gain(pre: QuizResult[], post: QuizResult[]): number {
  const mean = (xs: QuizResult[]) => xs.reduce((sum, x) => sum + x.score, 0) / Math.max(xs.length, 1);
  return mean(post) - mean(pre);
}
