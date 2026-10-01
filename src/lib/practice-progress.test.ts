import assert from "node:assert/strict";
import { test } from "node:test";
import { resumePractice } from "./practice-progress";

test("resumes at the first unanswered question with saved results", () => {
  const progress = resumePractice([
    { index: 0, isCorrect: true },
    { index: 1, isCorrect: false },
    { index: 2, isCorrect: null },
    { index: 3, isCorrect: null },
  ]);
  assert.deepEqual(progress, { index: 2, results: { 0: true, 1: false }, allAnswered: false });
});

test("allows final submission when every answer was saved before leaving", () => {
  assert.deepEqual(resumePractice([{ index: 0, isCorrect: true }, { index: 1, isCorrect: false }]), {
    index: 1,
    results: { 0: true, 1: false },
    allAnswered: true,
  });
});
