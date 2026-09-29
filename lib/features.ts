// Feature switches. Turning one off hides and blocks the feature without deleting its
// code, so bringing it back is a one-line change here plus a deploy.
export const FEATURES = {
  // Delivery-staff portal: the /delivery pages and their APIs, delivery-staff login,
  // the admin "Delivery" page, and the "Assign for delivery" action. Off while every
  // campus runs gate pickup only (hostel delivery is switched off per campus).
  deliveryPortal: false
} as const;
