import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { makeT } from "@/lib/i18n/dict";
import { getUiLocale } from "@/lib/i18n/server";

import { WeComAccessWorkspace } from "../wecom-access-workspace";
import { previewDepartments, previewMembers } from "../wecom-preview-data";

export default async function WeComAccessPreviewPage() {
  await requireRole(["ADMIN"]);
  const t = makeT(await getUiLocale());

  return (
    <>
      <PageHeading
        title={t("企业微信成员与权限")}
        description={t("查看虚构权限示例。")}
        action={(
          <Link className="button" href="/admin/users">
            <ArrowLeft aria-hidden="true" />
            {t("返回账号管理")}
          </Link>
        )}
      />
      <div className="wecom-preview-notice">
        <strong>{t("虚构演示数据")}</strong>
        <span>{t("示例部门与成员均为虚构内容；此预览不会读取或保存真实账号和权限。")}</span>
      </div>
      <section className="card wecom-admin-card">
        <div className="card-body">
          <WeComAccessWorkspace departments={previewDepartments} members={previewMembers} preview />
        </div>
      </section>
    </>
  );
}
