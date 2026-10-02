// Pure decisions for retrying an ORDER_CREATED message.
//
// The passcode is only known in plain text at the moment an order is confirmed; after
// that only its hash exists. So if the very first message (the only one carrying it)
// failed on every channel, a plain resend would leave the customer without a passcode.
// The retry therefore issues a new passcode, unless some other message already
// delivered one. Database work is in lib/notifications.ts.

export type PasscodeChannel = "EMAIL" | "WHATSAPP";

export type PasscodeRetryPlan =
  | { kind: "rotate" }
  | { kind: "already_sent"; channels: PasscodeChannel[] };

// `deliveredChannels` are the channels of OTHER ORDER_CREATED messages for this order
// that were sent successfully. Telegram goes to the staff group and never carries the
// customer's passcode, so callers must not pass it in.
export function planOrderCreatedRetry(deliveredChannels: readonly PasscodeChannel[]): PasscodeRetryPlan {
  const channels = (["EMAIL", "WHATSAPP"] as const).filter((channel) => deliveredChannels.includes(channel));
  return channels.length > 0 ? { kind: "already_sent", channels } : { kind: "rotate" };
}

function channelLabel(channel: PasscodeChannel) {
  return channel === "EMAIL" ? "email" : "WhatsApp";
}

export function passcodeSentNote(channels: readonly PasscodeChannel[]) {
  const labels = channels.map(channelLabel);
  return `Your passcode was sent to you earlier by ${labels.join(" and ")}.`;
}

// Body text for the retried confirmation, matching what the message actually contains.
export function orderCreatedRetryBody(kind: PasscodeRetryPlan["kind"]) {
  return kind === "rotate"
    ? "We have received your order. Use the tracking link and the new passcode below to check progress."
    : "We have received your order. Use the tracking link below to check progress.";
}
