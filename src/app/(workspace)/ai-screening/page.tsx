import { AiScreeningChat } from "@/components/ai-screening-chat";
import { getUserPermissions } from "@/lib/access-control";
import { requirePermission } from "@/lib/auth";

export default async function AiScreeningPage() {
  const user = await requirePermission("SCREENING_VIEW");
  const permissions = getUserPermissions(user);
  return (
    <AiScreeningChat
      userId={user.id}
      canManageWorkbook={user.role === "ADMIN"}
      canSavePlans={permissions.includes("RECOMMENDATION_MANAGE")}
    />
  );
}
