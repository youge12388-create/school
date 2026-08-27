import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { saveProgramFields } from "@/lib/program-editor";
import { asText } from "@/lib/utils";

function optionalText(value: unknown) {
  const text = asText(value);
  return text || null;
}

function optionalNumber(value: unknown) {
  const text = asText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

// 详情页"项目卡片"就地编辑：只保存单个项目的字段
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(["ADMIN", "DATA_MANAGER", "CHANNEL_RESOURCE"]);
  const { id } = await context.params;
  const program = sqlite
    .prepare("SELECT id, school_id FROM programs WHERE id = ? AND archived = 0")
    .get(id) as { id: string; school_id: string } | undefined;
  if (!program) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const name = asText(body.name);
  const programType = asText(body.programType);
  const teachingLanguage = asText(body.teachingLanguage);
  if (!name || !programType || !teachingLanguage) {
    return Response.json(
      { error: "项目名称、申请学历和授课语言不能为空" },
      { status: 400 },
    );
  }
  try {
    await saveProgramFields(user.id, id, {
      name,
      programType,
      teachingLanguage,
      majorText: optionalText(body.majorText),
      requirementsText: optionalText(body.requirementsText),
      applicationTimeText: optionalText(body.applicationTimeText),
      tuitionText: asText(body.tuitionText) || "",
      accommodationText: optionalText(body.accommodationText),
      firstYearCostMax: optionalNumber(body.firstYearCostMax),
      deadlineDate: optionalText(body.deadlineDate),
      duration: optionalText(body.duration),
      introduction: optionalText(body.introduction),
      scholarshipContent: optionalText(body.scholarshipContent),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message }, { status: 400 });
  }
  revalidatePath(`/schools/${program.school_id}`);
  revalidatePath("/schools");
  return Response.json({ id, schoolId: program.school_id });
}
