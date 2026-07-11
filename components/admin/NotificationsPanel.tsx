"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Check, CheckCircle2, ChevronDown, Clock3, Mail, MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

type Log = {
  id: string;
  channel: "EMAIL" | "WHATSAPP" | "TELEGRAM";
  event: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  errorMessage: string | null;
  sentAt: string | Date;
  retryCount: number;
  nextRetryAt: string | Date | null;
  lastRetryAt: string | Date | null;
  resolvedAt: string | Date | null;
  order: {
    trackingCode: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
  } | null;
};

const MAX_AUTO_RETRIES = 3;

function dateTime(value: string | Date | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function relativeTime(value: string | Date | null, now: number) {
  if (!value) return "No more automatic retries";
  const difference = new Date(value).getTime() - now;
  if (difference <= 0) return "Retry due now";
  const minutes = Math.max(1, Math.ceil(difference / 60_000));
  return `Automatic retry in ${minutes} min`;
}

function channelIcon(channel: Log["channel"]) {
  if (channel === "EMAIL") return Mail;
  if (channel === "WHATSAPP") return MessageCircle;
  return Send;
}

function failureSummary(message: string | null) {
  if (!message) return "The provider did not return an error description.";
  const lower = message.toLowerCase();
  if (lower.includes("scan_qr_code")) return "WhatsApp is disconnected and needs its QR code scanned.";
  if (lower.includes("session status") || lower.includes("working")) return "The WhatsApp session is not connected or ready.";
  if (lower.includes("smtp") || lower.includes("auth")) return "The email provider rejected the SMTP connection.";
  if (lower.includes("timeout")) return "The notification provider took too long to respond.";
  return "The provider rejected this notification attempt.";
}

function StatusMark({ log }: { log: Log }) {
  const recovered = log.status === "SUCCESS" && log.retryCount > 0;
  const styles = log.status === "FAILED"
    ? "bg-[#fee9e7] text-[#9d342b]"
    : recovered
      ? "bg-[#e1f4e9] text-[#286444]"
      : log.status === "SUCCESS"
        ? "bg-[#e9f6ef] text-[#286444]"
        : "bg-[#eceef1] text-[#676a72]";
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-black ${styles}`}>{log.status === "FAILED" ? <AlertTriangle size={12} /> : <Check size={12} />}{recovered ? "RECOVERED" : log.status}</span>;
}

export function NotificationsPanel({ failedLogs, recentLogs }: { failedLogs: Log[]; recentLogs: Log[] }) {
  const router = useRouter();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    const scheduled = failedLogs.filter((log) => log.nextRetryAt).length;
    const exhausted = failedLogs.filter((log) => !log.nextRetryAt && log.retryCount >= MAX_AUTO_RETRIES).length;
    const recovered = recentLogs.filter((log) => log.status === "SUCCESS" && log.retryCount > 0).length;
    const completed = recentLogs.filter((log) => log.status !== "SKIPPED");
    const delivered = completed.filter((log) => log.status === "SUCCESS").length;
    return { scheduled, exhausted, recovered, successRate: completed.length ? Math.round((delivered / completed.length) * 100) : 100 };
  }, [failedLogs, recentLogs]);

  async function retry(logId: string) {
    setRetryingId(logId);
    try {
      const response = await fetch("/api/admin/notifications/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Retry failed");
      if (data.outcome === "recovered") toast.success("Notification delivered on retry");
      else if (data.outcome === "already_running") toast.info("This retry is already running");
      else toast.info("The notification no longer needs a retry");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
      router.refresh();
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 min-[460px]:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-[#171713] p-5 text-white"><p className="text-xs font-bold text-white/45">Current failures</p><div className="mt-3 flex items-end justify-between"><strong className="text-4xl font-black tracking-[-0.05em] tabular-nums">{failedLogs.length}</strong><AlertTriangle className="text-[#f6b73c]" size={21} /></div><p className="mt-3 text-xs text-white/45">Email and WhatsApp</p></div>
        <div className="rounded-xl bg-white p-5 shadow-[0_10px_35px_rgba(30,32,38,0.05)]"><p className="text-xs font-bold text-[#85878e]">Scheduled retries</p><div className="mt-3 flex items-end justify-between"><strong className="text-4xl font-black tracking-[-0.05em] tabular-nums">{stats.scheduled}</strong><Clock3 className="text-[#b65a20]" size={21} /></div><p className="mt-3 text-xs text-[#96989e]">Runs automatically after 10 min</p></div>
        <div className="rounded-xl bg-white p-5 shadow-[0_10px_35px_rgba(30,32,38,0.05)]"><p className="text-xs font-bold text-[#85878e]">Recovered</p><div className="mt-3 flex items-end justify-between"><strong className="text-4xl font-black tracking-[-0.05em] tabular-nums">{stats.recovered}</strong><CheckCircle2 className="text-[#34705a]" size={21} /></div><p className="mt-3 text-xs text-[#96989e]">Within the latest activity</p></div>
        <div className="rounded-xl bg-white p-5 shadow-[0_10px_35px_rgba(30,32,38,0.05)]"><p className="text-xs font-bold text-[#85878e]">Delivery health</p><div className="mt-3 flex items-end justify-between"><strong className="text-4xl font-black tracking-[-0.05em] tabular-nums">{stats.successRate}%</strong><ArrowUpRight className="text-[#34705a]" size={21} /></div><p className="mt-3 text-xs text-[#96989e]">Success across recent attempts</p></div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl bg-white shadow-[0_10px_35px_rgba(30,32,38,0.05)]">
          <header className="border-b border-black/8 p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-black tracking-[-0.03em]">Needs attention</h2><p className="mt-1 text-sm text-[#777981]">Failures retry automatically after ten minutes. You can retry immediately at any time.</p></div>{stats.exhausted ? <span className="text-xs font-bold text-[#9d342b]">{stats.exhausted} exhausted</span> : null}</div></header>
          <div className="divide-y divide-black/8">
            {failedLogs.map((log) => {
              const Icon = channelIcon(log.channel);
              const exhausted = !log.nextRetryAt && log.retryCount >= MAX_AUTO_RETRIES;
              return (
                <article key={log.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><StatusMark log={log} /><span className="inline-flex items-center gap-1.5 text-xs font-black text-[#555860]"><Icon size={14} /> {log.channel}</span><span className="text-xs font-semibold text-[#8a8c93]">{log.event.replaceAll("_", " ")}</span></div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <div><p className="font-black text-[#202126]">{log.order?.customerName ?? "Unknown customer"}</p><p className="mt-1 font-mono text-xs font-bold text-[#b65a20]">{log.order?.trackingCode ?? "NO ORDER"}</p><p className="mt-2 break-words text-sm leading-6 text-[#70727a]">{log.order?.customerPhone ?? "No phone"}{log.order?.customerEmail ? ` / ${log.order.customerEmail}` : ""}</p></div>
                        <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs lg:min-w-64"><div><dt className="text-[#999ba1]">Failed at</dt><dd className="mt-1 font-bold text-[#45474e]">{dateTime(log.sentAt)}</dd></div><div><dt className="text-[#999ba1]">Retries</dt><dd className="mt-1 font-bold text-[#45474e]">{log.retryCount} total</dd></div>{log.lastRetryAt ? <div><dt className="text-[#999ba1]">Last retry</dt><dd className="mt-1 font-bold text-[#45474e]">{dateTime(log.lastRetryAt)}</dd></div> : null}<div><dt className="text-[#999ba1]">Next action</dt><dd className={`mt-1 font-bold ${exhausted ? "text-[#9d342b]" : "text-[#286444]"}`}>{exhausted ? "Manual retry required" : relativeTime(log.nextRetryAt, now)}</dd></div></dl>
                      </div>
                      <div className="mt-4 rounded-lg border border-[#9d342b]/12 bg-[#fff4f2] p-3"><p className="text-sm font-bold text-[#8b332c]">{failureSummary(log.errorMessage)}</p>{log.errorMessage ? <details className="mt-2"><summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-bold text-[#a05a54]">Technical details <ChevronDown size={13} /></summary><pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md bg-white/70 p-3 font-mono text-[11px] leading-5 text-[#7a4540]">{log.errorMessage}</pre></details> : null}</div>
                    </div>
                    <button type="button" disabled={retryingId === log.id} onClick={() => retry(log.id)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#171713] px-4 text-sm font-black text-white transition hover:bg-[#b65a20] active:scale-[0.98] disabled:cursor-wait disabled:opacity-55"><RefreshCw size={15} className={retryingId === log.id ? "animate-spin" : ""} />{retryingId === log.id ? "Retrying" : "Retry now"}</button>
                  </div>
                </article>
              );
            })}
            {!failedLogs.length ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e9f6ef] text-[#286444]"><CheckCircle2 size={21} /></span><h3 className="mt-4 text-lg font-black">All channels are healthy</h3><p className="mt-2 text-sm text-[#777981]">There are no unresolved email or WhatsApp failures.</p></div></div> : null}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl bg-white shadow-[0_10px_35px_rgba(30,32,38,0.05)]">
          <header className="border-b border-black/8 p-5"><h2 className="text-xl font-black tracking-[-0.03em]">Activity</h2><p className="mt-1 text-sm text-[#777981]">Latest delivery attempts and retry outcomes.</p></header>
          <div className="divide-y divide-black/8">
            {recentLogs.map((log) => {
              const Icon = channelIcon(log.channel);
              return <article key={log.id} className="p-4"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#555860]"><Icon size={16} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><StatusMark log={log} /><time className="text-[11px] font-medium text-[#999ba1]">{dateTime(log.resolvedAt ?? log.sentAt)}</time></div><p className="mt-2 text-sm font-bold text-[#35373d]">{log.event.replaceAll("_", " ")}</p><p className="mt-1 font-mono text-xs text-[#85878e]">{log.order?.trackingCode ?? "SYSTEM"} / {log.channel}</p>{log.retryCount > 0 ? <p className="mt-2 text-xs font-bold text-[#34705a]">Recovered after {log.retryCount} retr{log.retryCount === 1 ? "y" : "ies"}</p> : null}</div></div></article>;
            })}
            {!recentLogs.length ? <div className="p-8 text-center text-sm text-[#777981]">No notification activity yet.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
