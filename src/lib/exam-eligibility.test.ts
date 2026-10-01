import assert from "node:assert/strict";
import { test } from "node:test";
import { canChildUsePaper, isCompatibleChildExamTopic, paperStageForGrade } from "./exam-eligibility";

test("matches imported papers to the child's school stage", () => {
  assert.equal(paperStageForGrade(2), "primary");
  assert.equal(paperStageForGrade(8), "zhongkao");
  assert.equal(paperStageForGrade(11), "gaokao");
  assert.equal(canChildUsePaper(2, "gaokao"), false);
  assert.equal(canChildUsePaper(2, "other"), false);
  assert.equal(canChildUsePaper(2, "primary"), true);
  assert.equal(canChildUsePaper(8, "zhongkao"), true);
});

test("hides an existing high-school paper exam from a primary child", () => {
  const paperStages = new Map([["high", "gaokao"], ["young", "primary"]]);
  assert.equal(isCompatibleChildExamTopic("paper-high", 2, paperStages), false);
  assert.equal(isCompatibleChildExamTopic("paper-young", 2, paperStages), true);
  assert.equal(isCompatibleChildExamTopic("paper-deleted", 2, paperStages), false);
  assert.equal(isCompatibleChildExamTopic("exam-gaokao-chinese", 2, paperStages), false);
  assert.equal(isCompatibleChildExamTopic(null, 2, paperStages), true);
});
