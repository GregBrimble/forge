/** Select operation projections before passing an OpenAPI document to Forge. */
type ObjectValue = Record<string, unknown>;

function object(value: unknown): value is ObjectValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Missing audiences include every consumer; an explicit list opts in consumers. */
export function includesAudience(audiences: unknown, audience: string): boolean {
  if (audiences === undefined || audiences === null) {
    return true;
  }
  if (typeof audiences === 'string') {
    return audiences === audience;
  }
  return Array.isArray(audiences) && audiences.includes(audience);
}

/**
 * Select an audience in place. Alias audiences override the parent's, or inherit
 * them when omitted. Mapped aliases supplement the primary operation; ordinary
 * aliases keep their replacement semantics. Returns the number of removed operations.
 */
export function selectAudience(source: ObjectValue, audience: string): number {
  let excluded = 0;
  if (!object(source.paths)) {
    return excluded;
  }
  for (const item of Object.values(source.paths)) {
    if (!object(item)) {
      continue;
    }
    for (const verb of ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']) {
      const operation = item[verb];
      if (!object(operation)) {
        continue;
      }
      const parent = includesAudience(operation['x-fern-audiences'], audience);
      const declarations = operation['x-forge-aliases'];
      if (!Array.isArray(declarations)) {
        if (!parent) {
          delete item[verb];
          excluded++;
        }
        continue;
      }
      const mapped = declarations.some((a) => object(a) && a['x-forge-request-transform'] !== undefined);
      const selected = declarations.filter(
        (a): a is ObjectValue =>
          object(a) &&
          includesAudience(
            Object.hasOwn(a, 'x-fern-audiences') ? a['x-fern-audiences'] : operation['x-fern-audiences'],
            audience,
          ),
      );
      const inherited = Object.fromEntries(
        Object.entries(operation).filter(
          ([key]) => key.startsWith('x-') && key !== 'x-forge-aliases' && key !== 'x-forge-args',
        ),
      );
      const aliases = selected.map((alias) =>
        alias['x-forge-request-transform'] === undefined ? alias : { ...inherited, ...alias },
      );
      if (mapped && parent && operation['x-fern-sdk-group-name'] && operation['x-fern-sdk-method-name']) {
        const primary = Object.fromEntries(
          Object.entries(operation).filter(([key]) => key.startsWith('x-') && key !== 'x-forge-aliases'),
        );
        if (
          !aliases.some(
            (a) =>
              JSON.stringify(a['x-fern-sdk-group-name']) === JSON.stringify(primary['x-fern-sdk-group-name']) &&
              a['x-fern-sdk-method-name'] === primary['x-fern-sdk-method-name'],
          )
        ) {
          aliases.unshift(primary);
        }
      }
      if (aliases.length === 0) {
        delete item[verb];
        excluded++;
        continue;
      }
      operation['x-forge-aliases'] = aliases;
    }
  }
  return excluded;
}
