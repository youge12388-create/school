import { AiScreeningChat } from "@/components/ai-screening-chat";
import { requireUser } from "@/lib/auth";

export default async function AiScreeningPage() {
  const user = await requireUser();
  return <AiScreeningChat canManageWorkbook={user.role === "ADMIN"} />;
}
