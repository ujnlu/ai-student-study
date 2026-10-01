import assert from "node:assert/strict";
import { after, test } from "node:test";
import { z } from "zod";
import { OpenAICompatClient } from "./openai-compat";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

test("repairs malformed grading JSON without resending the image", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const outputs = [
    '{"subject":"math","summary":"8题都对" "problems":[]}',
    '{"subject":"math","summary":"8题都对","problems":[]}',
  ];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ choices: [{ message: { content: outputs.shift() }, finish_reason: "stop" }] });
  };

  const schema = z.object({ subject: z.literal("math"), summary: z.string(), problems: z.array(z.unknown()) });
  const client = new OpenAICompatClient("test-key", "https://example.test/v1");
  const result = await client.completeJson({
    model: "test-model",
    messages: [{ role: "user", content: [{ type: "image", mimeType: "image/png", base64: "aGVsbG8=" }, { type: "text", text: "批改" }] }],
  }, schema);

  assert.deepEqual(result.data, { subject: "math", summary: "8题都对", problems: [] });
  assert.equal(requests.length, 2);
  assert.match(JSON.stringify(requests[0]), /data:image\/png;base64/);
  assert.doesNotMatch(JSON.stringify(requests[1]), /data:image\/png;base64/);
});
