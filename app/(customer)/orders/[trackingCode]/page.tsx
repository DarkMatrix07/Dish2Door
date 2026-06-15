import { TrackingClient } from "@/components/customer/TrackingClient";

export const dynamic = "force-dynamic";

export default async function TrackingPage({ params }: { params: Promise<{ trackingCode: string }> }) {
  const { trackingCode } = await params;
  return <TrackingClient trackingCode={trackingCode} />;
}
