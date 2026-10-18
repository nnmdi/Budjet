import { dateOnly } from "./ledger";
export function parseCSV(source: string): string[][] {
  if (source.length > 10_000_000)
    throw new Error("CSV exceeds the 10 MB limit.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell.trim() || closed) throw new Error("Invalid CSV quoting.");
      quoted = true;
      cell = "";
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some((x) => x.trim())) rows.push(row);
        row = [];
        if (rows.length > 50001) throw new Error("CSV exceeds 50,000 rows.");
      }
    } else {
      if (closed && !/\s/.test(c))
        throw new Error("Unexpected text after CSV quote.");
      if (!closed) cell += c;
    }
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export function moneyFromCSV(raw: string): number {
  let value = raw.trim().replace(/[$,\s]/g, "");
  if (/^\(.*\)$/.test(value)) value = "-" + value.slice(1, -1);
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(value)) throw new Error("Invalid amount.");
  const amount = Number(value);
  if (!Number.isFinite(amount) || !amount)
    throw new Error("Amount must be nonzero.");
  return amount;
}
export function dateFromCSV(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return dateOnly(raw.trim());
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) throw new Error("Use YYYY-MM-DD or M/D/YYYY dates.");
  return dateOnly(`${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
}
export function csvCell(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid numeric CSV value.");
    return String(value);
  }
  const safe = /^\s*[=+@-]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export const stringifyCSV = (rows: (string | number)[][]) =>
  rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
