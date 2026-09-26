// Small, dependency-free feedback for adding to a cart: a light haptic tick on phones
// that support it, and the dish photo "flying" into whatever element on the page is
// marked data-cart-target (the floating cart bar, the pizza cart button, ...).

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function tapFeedback() {
  try {
    // Android only; iOS Safari has no vibration API and simply ignores this.
    navigator.vibrate?.(8);
  } catch {
    // Some browsers throw when vibration is blocked by policy.
  }
}

// Visible target nearest the bottom of the screen wins: on phones the floating bar,
// on desktop the header button.
function findCartTarget(): HTMLElement | null {
  const targets = [...document.querySelectorAll<HTMLElement>("[data-cart-target]")].filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  });
  return targets.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] ?? null;
}

function bump(target: HTMLElement) {
  target.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }],
    { duration: 320, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }
  );
}

// `from` is any element inside the tapped card; the card's photo is used as the
// flying image. Its position is read synchronously, at tap time: tapping "Add" swaps
// the button for a +/- stepper on the next render, which detaches `from` from the card.
// Falls back to just bumping the cart when there is no photo.
export function flyToCart(from: Element | null) {
  tapFeedback();
  if (typeof window === "undefined" || !from) return;
  const card = from.closest("article, [data-fly-source]");
  const image = card?.querySelector("img") ?? null;
  const start = image?.getBoundingClientRect();
  const src = image ? image.currentSrc || image.src : "";

  // The cart bar mounts on the first add, so look for it after React has painted.
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const target = findCartTarget();
    if (!target) return;
    if (!start || !start.width || !src || prefersReducedMotion()) {
      bump(target);
      return;
    }
    const end = target.getBoundingClientRect();
    if (!end.width) return bump(target);

    const size = Math.min(72, start.width, start.height);
    const ghost = document.createElement("img");
    ghost.src = src;
    ghost.alt = "";
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${start.left + start.width / 2 - size / 2}px`,
      top: `${start.top + start.height / 2 - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      objectFit: "cover",
      borderRadius: "14px",
      zIndex: "300",
      pointerEvents: "none",
      boxShadow: "0 12px 30px rgba(23,23,19,0.28)"
    });
    document.body.appendChild(ghost);

    const dx = end.left + Math.min(end.width, 56) / 2 - (start.left + start.width / 2);
    const dy = end.top + end.height / 2 - (start.top + start.height / 2);
    const flight = ghost.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 60}px) scale(0.7)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.35 }
      ],
      { duration: 620, easing: "cubic-bezier(0.45, 0, 0.25, 1)" }
    );
    flight.onfinish = () => { ghost.remove(); bump(target); };
    flight.oncancel = () => ghost.remove();
  }));
}
