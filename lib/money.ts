// Fees are per-campus, so the calculators take just the fee fields rather than a whole
// SystemSettings row. Both Campus and SystemSettings satisfy this shape structurally.
export type FeeConfig = {
  platformFeePaise: number;
  hostelDeliveryFeePaise: number;
  paymentChargePercentBps: number;
  paymentChargeFixedPaise: number;
};

export type FeeBreakdown = {
  subtotalPaise: number;
  platformFeePaise: number;
  hostelFeePaise: number;
  couponDiscountPaise: number;
  paymentFeePaise: number;
  taxPaise: number;
  totalPaise: number;
};

// GST on restaurant food. Charged on the food value only — fees and delivery are not
// part of the taxable supply here — and rounded up to the paisa.
export const GST_RATE_BPS = 500;

export function calculateGst(taxableBasePaise: number, rateBps: number) {
  return Math.ceil((Math.max(0, taxableBasePaise) * rateBps) / 10_000);
}

export function calculatePaymentFee(basePaise: number, settings: FeeConfig) {
  const percentFee = Math.ceil((basePaise * settings.paymentChargePercentBps) / 10_000);
  return percentFee + settings.paymentChargeFixedPaise;
}

export function calculateTotals(
  subtotalPaise: number,
  deliveryType: "GATE" | "HOSTEL",
  settings: FeeConfig,
  includePaymentFee: boolean,
  couponDiscountPaise = 0,
  // Shops that charge GST pass their rate; 0 (the default) leaves every existing
  // caller — and every existing order total — exactly as it was.
  gstRateBps = 0
): FeeBreakdown {
  const platformFeePaise = settings.platformFeePaise;
  const hostelFeePaise = deliveryType === "HOSTEL" ? settings.hostelDeliveryFeePaise : 0;
  const discountedSubtotalPaise = Math.max(0, subtotalPaise - couponDiscountPaise);
  const taxPaise = calculateGst(discountedSubtotalPaise, gstRateBps);
  const basePaise = discountedSubtotalPaise + platformFeePaise + hostelFeePaise + taxPaise;
  const paymentFeePaise = includePaymentFee ? calculatePaymentFee(basePaise, settings) : 0;

  return {
    subtotalPaise,
    platformFeePaise,
    hostelFeePaise,
    couponDiscountPaise,
    paymentFeePaise,
    taxPaise,
    totalPaise: basePaise + paymentFeePaise
  };
}
