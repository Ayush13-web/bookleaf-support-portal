const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Recursively converts snake_case keys (SQL rows) to camelCase (API payloads). */
export function toCamel(value) {
  if (Array.isArray(value)) return value.map(toCamel);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [camel(k), toCamel(v)]));
  }
  return value;
}
