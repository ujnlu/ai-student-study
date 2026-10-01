export function resumePractice(items: readonly { index: number; isCorrect: boolean | null }[]) {
  const results: Record<number, boolean> = {};
  for (const item of items) {
    if (item.isCorrect !== null) results[item.index] = item.isCorrect;
  }
  const firstUnanswered = items.findIndex((item) => item.isCorrect === null);
  return {
    index: firstUnanswered < 0 ? Math.max(0, items.length - 1) : firstUnanswered,
    results,
    allAnswered: items.length > 0 && firstUnanswered < 0,
  };
}
