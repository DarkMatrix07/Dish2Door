import assert from "node:assert/strict";
import test from "node:test";
import { orderCreatedRetryBody, passcodeSentNote, planOrderCreatedRetry } from "../lib/passcode-retry";

test("with no other delivered confirmation the retry issues a new passcode", () => {
  assert.deepEqual(planOrderCreatedRetry([]), { kind: "rotate" });
});

test("if email already delivered, the retry does not rotate", () => {
  assert.deepEqual(planOrderCreatedRetry(["EMAIL"]), { kind: "already_sent", channels: ["EMAIL"] });
});

test("if WhatsApp already delivered, the retry does not rotate", () => {
  assert.deepEqual(planOrderCreatedRetry(["WHATSAPP"]), { kind: "already_sent", channels: ["WHATSAPP"] });
});

test("both channels are listed once, email first, whatever the input order", () => {
  assert.deepEqual(planOrderCreatedRetry(["WHATSAPP", "EMAIL", "WHATSAPP"]), {
    kind: "already_sent",
    channels: ["EMAIL", "WHATSAPP"]
  });
});

test("the passcode note names the channel(s) in plain English", () => {
  assert.equal(passcodeSentNote(["EMAIL"]), "Your passcode was sent to you earlier by email.");
  assert.equal(passcodeSentNote(["WHATSAPP"]), "Your passcode was sent to you earlier by WhatsApp.");
  assert.equal(passcodeSentNote(["EMAIL", "WHATSAPP"]), "Your passcode was sent to you earlier by email and WhatsApp.");
});

test("the retry body matches whether a passcode is included", () => {
  assert.match(orderCreatedRetryBody("rotate"), /new passcode below/);
  assert.doesNotMatch(orderCreatedRetryBody("already_sent"), /passcode/);
});
