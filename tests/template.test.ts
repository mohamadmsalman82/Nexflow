import assert from "node:assert/strict";
import { interpolateTemplate } from "../src/lib/template";

const mockResults = {
  priceFetch: {
    status: 200,
    body: {
      price: 42000.5,
      meta: { currency: "USD" }
    }
  }
};

const message = interpolateTemplate(
  "Current BTC price: ${priceFetch.body.price} ${priceFetch.body.meta.currency}",
  mockResults
);
assert.equal(message, "Current BTC price: 42000.5 USD");

const missing = interpolateTemplate("Value: ${missing.step}", mockResults);
assert.equal(missing, "Value: [missing missing.step]");

const objectMessage = interpolateTemplate(
  "Payload: ${priceFetch.body}",
  mockResults
);
assert.equal(objectMessage, 'Payload: {"price":42000.5,"meta":{"currency":"USD"}}');

console.log("template interpolation tests passed");

