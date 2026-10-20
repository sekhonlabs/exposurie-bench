export function toCsvRow(values: string[]): string {
  return values.map((v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',') + '\n';
}
