import { TrackingClient } from "@/components/customer/TrackingClient";

export const dynamic = "force-dynamic";

export default async function TrackingPage({
  params,
  searchParams
}: {
  params: Promise<{ trackingCode: string }>;
  searchParams: Promise<{ review?: string | string[] }>;
}) {
  const { trackingCode } = await params;
  const { review } = await searchParams;
  // One-tap review link from a reminder: ?review=<token>. The client turns it into the
  // rating form; the token is never rendered back into the page.
  const reviewToken = typeof review === "string" && review ? review : undefined;
  return <TrackingClient trackingCode={trackingCode} reviewToken={reviewToken} />;
}
