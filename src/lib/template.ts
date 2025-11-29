const PLACEHOLDER_REGEX = /\$\{([^}]+)\}/g;

export function interpolateTemplate(
  template: string | undefined,
  results: Record<string, unknown>
): string {
  if (!template) return "";
  return template.replace(PLACEHOLDER_REGEX, (_, expr: string) => {
    const value = getDeepValue(results, expr.trim());
    if (value === undefined || value === null) {
      return `[missing ${expr.trim()}]`;
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  });
}

export function interpolateJsonPayload(
  raw: string,
  results: Record<string, unknown>
): string {
  return interpolateTemplate(raw, results);
}

function getDeepValue(obj: any, path: string): any {
  if (!path) return undefined;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

