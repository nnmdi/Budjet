import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCSV,
  stringifyCSV,
  moneyFromCSV,
  dateFromCSV,
} from "../src/domain/csv";
test("CSV round trip preserves commas, escaped quotes, multiline fields and BOM", () => {
  const rows = [
    ["Budget", "Description"],
    ["Food, family", 'A "quoted" merchant\nand another line'],
  ];
  assert.deepEqual(parseCSV("\uFEFF" + stringifyCSV(rows)), rows);
});
test("CSV rejects unclosed quotes and malformed money/dates instead of inventing values", () => {
  assert.throws(() => parseCSV('a,"b'));
  assert.throws(() => moneyFromCSV("oops"));
  assert.throws(() => moneyFromCSV("10junk"));
  assert.throws(() => moneyFromCSV("0"));
  assert.throws(() => dateFromCSV("not a date"));
  assert.throws(() => dateFromCSV("2026-02-30"));
  assert.equal(dateFromCSV("1/31/2026"), "2026-01-31");
  assert.equal(moneyFromCSV("($1,234.56)"), -1234.56);
});
test("CSV export neutralizes spreadsheet formulas in text without changing numeric amounts", () => {
  assert.equal(
    stringifyCSV([["=1+1", -100, "@SUM(A:A)"]]),
    '"\'=1+1",-100,"\'@SUM(A:A)"',
  );
});
