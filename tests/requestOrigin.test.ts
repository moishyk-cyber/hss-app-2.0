import test from "node:test";
import assert from "node:assert/strict";
import { hasSameOrigin } from "../src/lib/requestOrigin";

test("browser CSV imports use the public Host even when Next has an internal URL", () => {
  assert.equal(hasSameOrigin(new Request("http://localhost:3001/api/phonebook/csv", {
    headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001" },
  })), true);
  assert.equal(hasSameOrigin(new Request("http://internal:3000/api/phonebook/csv", {
    headers: { host: "internal:3000", "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https", origin: "https://app.example.com" },
  })), true);
});

test("CSV origin validation still rejects foreign hosts, ports, protocols and malformed origins", () => {
  for (const origin of ["https://other.example.com", "http://app.example.com", "https://app.example.com:444", "null", "garbage", "https://app.example.com/path"]) {
    assert.equal(hasSameOrigin(new Request("http://internal:3000/api/phonebook/csv", {
      headers: { host: "internal:3000", "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https", origin },
    })), false, origin);
  }
});
