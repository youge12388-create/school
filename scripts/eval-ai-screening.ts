import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

import { criteriaSchema, type ChatCriteria } from "@/lib/ai-screening";
import {
  extractScreeningIntent,
  screeningHistorySchema,
} from "@/lib/ai-screening-intent";

const caseSchema = z
  .object({
    id: z.string().min(1),
    message: z.string().min(1),
    previousCriteria: criteriaSchema.default({}),
    history: screeningHistorySchema.default([]),
    hasPrevious: z.boolean().default(false),
    expected: z
      .object({
        intent: z
          .enum(["chat", "search", "compare_cost", "explain", "school_fact"])
          .optional(),
        topic: z
          .enum([
            "TUITION",
            "COST",
            "DEADLINE",
            "INTAKE",
            "LANGUAGE",
            "SCHOLARSHIP",
          ])
          .nullable()
          .optional(),
        showOther: z.boolean().optional(),
        criteria: criteriaSchema.default({}),
        replyMustMention: z.array(z.string()).default([]),
      })
      .strict(),
  })
  .strict();

type EvaluationCase = z.infer<typeof caseSchema>;

function normalizeCriteria(criteria: ChatCriteria) {
  return Object.fromEntries(
    Object.entries(criteria)
      .filter(([, value]) => value != null && value !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function checkCase(
  testCase: EvaluationCase,
  actual: Awaited<ReturnType<typeof extractScreeningIntent>>,
) {
  const failures: string[] = [];
  const expected = testCase.expected;
  if (expected.intent && actual.intent !== expected.intent) {
    failures.push(`intent=${actual.intent ?? "null"}，期望 ${expected.intent}`);
  }
  if (
    Object.prototype.hasOwnProperty.call(expected, "topic") &&
    actual.topic !== expected.topic
  ) {
    failures.push(`topic=${actual.topic ?? "null"}，期望 ${expected.topic ?? "null"}`);
  }
  if (
    expected.showOther != null &&
    Boolean(actual.showOther) !== expected.showOther
  ) {
    failures.push(
      `showOther=${String(Boolean(actual.showOther))}，期望 ${String(expected.showOther)}`,
    );
  }
  const actualCriteria = normalizeCriteria(actual.criteria);
  for (const [key, value] of Object.entries(
    normalizeCriteria(expected.criteria),
  )) {
    if (actualCriteria[key] !== value) {
      failures.push(`${key}=${String(actualCriteria[key])}，期望 ${String(value)}`);
    }
  }
  if (expected.replyMustMention.length) {
    const reply = actual.reply ?? "";
    for (const keyword of expected.replyMustMention) {
      if (!reply.includes(keyword)) failures.push(`回复缺少“${keyword}”`);
    }
  }
  return failures;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const fixturePath = resolve(
    "scripts/fixtures/ai-screening-intent-cases.json",
  );
  const parsed = z
    .array(caseSchema)
    .min(1)
    .parse(JSON.parse(await readFile(fixturePath, "utf8")));
  const selectedId = process
    .argv
    .slice(2)
    .find((argument) => argument.startsWith("--case="))
    ?.slice("--case=".length);
  const cases = selectedId
    ? parsed.filter((testCase) => testCase.id === selectedId)
    : parsed;
  if (!cases.length) throw new Error(`没有找到验收用例：${selectedId}`);
  if (args.has("--list")) {
    for (const testCase of cases) console.log(testCase.id);
    return;
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error(
      "没有配置 DEEPSEEK_API_KEY。请在服务端环境或 .env.local 中配置真实模型密钥后运行。",
    );
  }

  console.log(
    `真实模型验收：${cases.length} 个用例，模型 ${process.env.DEEPSEEK_MODEL || "deepseek-flash"}`,
  );
  let passed = 0;
  const results: Array<{
    id: string;
    ok: boolean;
    latencyMs: number;
    failures: string[];
  }> = [];
  for (const testCase of cases) {
    const startedAt = Date.now();
    try {
      const actual = await extractScreeningIntent(
        {
          message: testCase.message,
          criteria: testCase.previousCriteria,
          history: testCase.history,
          hasPrevious: testCase.hasPrevious,
        },
        { timeoutMs: 45_000 },
      );
      const failures = checkCase(testCase, actual);
      const ok = failures.length === 0;
      if (ok) passed += 1;
      results.push({
        id: testCase.id,
        ok,
        latencyMs: Date.now() - startedAt,
        failures,
      });
      console.log(
        `${ok ? "PASS" : "FAIL"} ${testCase.id} (${Date.now() - startedAt} ms)${
          ok ? "" : `\n  ${failures.join("\n  ")}`
        }`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      results.push({
        id: testCase.id,
        ok: false,
        latencyMs: Date.now() - startedAt,
        failures: [message],
      });
      console.log(`FAIL ${testCase.id}\n  ${message}`);
    }
  }
  const failed = results.length - passed;
  const averageLatency = Math.round(
    results.reduce((total, result) => total + result.latencyMs, 0) /
      results.length,
  );
  console.log(`\n结果：${passed} 通过，${failed} 失败，平均 ${averageLatency} ms`);
  if (args.has("--json")) {
    console.log(JSON.stringify({ passed, failed, averageLatency, results }, null, 2));
  }
  if (failed > 0) process.exitCode = 1;
}

void main();
