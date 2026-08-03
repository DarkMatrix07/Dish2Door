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
  totalPaise: number;
};

export function calculatePaymentFee(basePaise: number, settings: FeeConfig) {
  const percentFee = Math.ceil((basePaise * settings.paymentChargePercentBps) / 10_000);
  return percentFee + settings.paymentChargeFixedPaise;
}

export function calculateTotals(
  subtotalPaise: number,
  deliveryType: "GATE" | "HOSTEL",
  settings: FeeConfig,
  includePaymentFee: boolean,
  couponDiscountPaise = 0
): FeeBreakdown {
  const platformFeePaise = settings.platformFeePaise;
  const hostelFeePaise = deliveryType === "HOSTEL" ? settings.hostelDeliveryFeePaise : 0;
  const discountedSubtotalPaise = Math.max(0, subtotalPaise - couponDiscountPaise);
  const basePaise = discountedSubtotalPaise + platformFeePaise + hostelFeePaise;
  const paymentFeePaise = includePaymentFee ? calculatePaymentFee(basePaise, settings) : 0;

  return {
    subtotalPaise,
    platformFeePaise,
    hostelFeePaise,
    couponDiscountPaise,
    paymentFeePaise,
    totalPaise: basePaise + paymentFeePaise
  };
}
