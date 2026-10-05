import assert from "node:assert/strict";
import test from "node:test";
import { isTestCheckoutAllowed } from "../lib/test-checkout";

test("test checkout needs the switch", () => {
  assert.equal(isTestCheckoutAllowed(undefined, "https://d2d.divyeshdev.online"), false);
  assert.equal(isTestCheckoutAllowed("0", "https://d2d.divyeshdev.online"), false);
  assert.equal(isTestCheckoutAllowed("1", "https://d2d.divyeshdev.online"), true);
  assert.equal(isTestCheckoutAllowed("1", "http://localhost:3100"), true);
});

test("test checkout never runs on the live domain", () => {
  assert.equal(isTestCheckoutAllowed("1", "https://www.dish2door.store"), false);
  assert.equal(isTestCheckoutAllowed("1", "https://dish2door.store"), false);
  assert.equal(isTestCheckoutAllowed("1", "https://WWW.Dish2Door.Store/"), false);
  assert.equal(isTestCheckoutAllowed("1", undefined), false);
  assert.equal(isTestCheckoutAllowed("1", "not a url"), false);
});
