import { requireRole } from "@/lib/auth";
import { SCHOOL_UPDATE_MANAGER_ROLES } from "@/lib/permissions";
import { buildSchoolUpdateTemplateBuffer } from "@/lib/school-update-import";

export async function GET() {
  await requireRole([...SCHOOL_UPDATE_MANAGER_ROLES]);

  const buffer = buildSchoolUpdateTemplateBuffer();

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
