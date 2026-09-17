import { requirePermission } from "@/lib/auth";
import { userHasPermission } from "@/lib/access-control";
import { buildSchoolUpdateTemplateBuffer } from "@/lib/school-update-import";

export async function GET() {
  const user = await requirePermission("SCHOOL_UPDATE_MANAGE");

  const buffer = buildSchoolUpdateTemplateBuffer(
    userHasPermission(user, "SCHOOL_VIEW_CONFIDENTIAL"),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        "attachment; filename*=UTF-8''school-updates-template.xlsx",
      "Cache-Control": "no-store",
    },
  });
}
