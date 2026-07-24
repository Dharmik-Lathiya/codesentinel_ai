/** Minimal JSONC parser: strips // and /* *\/ comments then JSON.parse. */
export function parseJsonc(raw: string): Record<string, unknown> {
  const placeholders: string[] = [];
  let masked = raw.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    placeholders.push(match);
    return `\x00STR${placeholders.length - 1}\x00`;
  });
  masked = masked.replace(/\/\*[\s\S]*?\*\//g, "");
  masked = masked.replace(/(^|[^:])\/\/.*$/gm, "$1");
  masked = masked.replace(/\x00STR(\d+)\x00/g, (_, i) => placeholders[Number(i)]);
  return JSON.parse(masked);
}
