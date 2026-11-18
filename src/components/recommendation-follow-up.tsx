"use client";

import { CalendarClock, Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { formatDate } from "@/lib/utils";

export function RecommendationFollowUp({ id, customerId, existing, canCreate }: {
  id: string;
  customerId: string;
  existing?: { id: string; nextFollowUpAt: number | null };
  canCreate: boolean;
}) {
  const [followUp, setFollowUp] = useState(existing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function create() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/ai-screening/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "跟进任务未创建，请重试。");
      setFollowUp({ id: data.id, nextFollowUpAt: data.nextFollowUpAt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "跟进任务未创建，请重试。");
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  if (followUp) {
    return <div className="plan-follow-up" role="status">
      <Check size={16} aria-hidden="true" /> 已创建跟进{followUp.nextFollowUpAt ? ` · ${formatDate(followUp.nextFollowUpAt)}` : ""}
      <Link href={`/customers/${customerId}#customer-follow-ups`}>查看客户跟进</Link>
    </div>;
  }
  if (!canCreate) return null;
  return <div className="plan-follow-up">
    <button type="button" onClick={() => void create()} disabled={pending}>
      {pending ? <LoaderCircle size={16} className="provider-spinner" aria-hidden="true" /> : <CalendarClock size={16} aria-hidden="true" />}
      {pending ? "正在创建…" : "生成跟进任务"}
    </button>
    {error && <span role="alert">{error}</span>}
  </div>;
}
