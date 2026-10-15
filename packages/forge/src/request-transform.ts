/** A small declarative language for constructing one JSON request body. */
export type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

export type RequestBodyTransform =
  | { arg: string }
  | { literal: JsonValue }
  | {
      object: {
        key: string | { arg: string };
        value: RequestBodyTransform;
        omitIfUnset?: string;
      }[];
    };

export interface RequestTransform {
  arguments: {
    name: string;
    description?: string;
    type: 'string' | 'number' | 'boolean';
    required?: boolean;
    positional?: boolean;
    sensitive?: boolean;
  }[];
  requestBody: RequestBodyTransform;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** Argument facts shared by Forge validation and the CLI's final argument derivation. */
export interface RequestTransformArgumentInfo {
  name: string;
  type: string;
  required?: boolean;
  sensitive?: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: string[]): void {
  assert(
    Object.keys(value).every((key) => keys.includes(key)),
    `Unknown request transform field: ${Object.keys(value)
      .filter((key) => !keys.includes(key))
      .join(', ')}`,
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return record(value) && Object.values(value).every(isJsonValue);
}

function validateTransform(value: unknown): asserts value is RequestBodyTransform {
  assert(record(value), 'Request transform mapping must be an object.');
  if ('arg' in value) {
    onlyKeys(value, ['arg']);
    assert(nonEmptyString(value.arg), 'Request transform argument reference is empty.');
  } else if ('literal' in value) {
    onlyKeys(value, ['literal']);
    assert(isJsonValue(value.literal), 'Request transform literal must be JSON.');
  } else {
    onlyKeys(value, ['object']);
    assert(Array.isArray(value.object), 'Request transform mapping needs object entries.');
    const staticKeys = new Set<string>();
    for (const entry of value.object) {
      assert(record(entry), 'Request transform object entry must be an object.');
      onlyKeys(entry, ['key', 'value', 'omitIfUnset']);
      if (typeof entry.key === 'string') {
        assert(!staticKeys.has(entry.key), `Duplicate request transform body key: ${entry.key}`);
        staticKeys.add(entry.key);
      } else {
        assert(record(entry.key), 'Request transform map key must be a string or argument.');
        onlyKeys(entry.key, ['arg']);
        assert(nonEmptyString(entry.key.arg), 'Request transform map key reference is empty.');
      }
      assert(
        entry.omitIfUnset === undefined || nonEmptyString(entry.omitIfUnset),
        'Request transform omission condition must name an argument.',
      );
      validateTransform(entry.value);
    }
  }
}

export function parseRequestTransform(value: unknown): RequestTransform {
  assert(record(value), 'Request transform must be an object.');
  onlyKeys(value, ['arguments', 'requestBody']);
  assert(Array.isArray(value.arguments), 'Request transform needs an arguments array.');
  for (const arg of value.arguments) {
    assert(record(arg), 'Request transform argument must be an object.');
    onlyKeys(arg, ['name', 'description', 'type', 'required', 'positional', 'sensitive']);
    assert(nonEmptyString(arg.name), 'Request transform argument needs a name.');
    assert(
      arg.description === undefined || typeof arg.description === 'string',
      'Request transform argument description must be a string.',
    );
    assert(
      arg.type === 'string' || arg.type === 'number' || arg.type === 'boolean',
      'Request transform arguments must be scalar.',
    );
    for (const field of ['required', 'positional', 'sensitive']) {
      assert(
        arg[field] === undefined || typeof arg[field] === 'boolean',
        `Request transform ${field} must be boolean.`,
      );
    }
    assert(
      !arg.sensitive || (arg.type === 'string' && !arg.positional),
      'Sensitive request transform arguments must be string options.',
    );
  }
  validateTransform(value.requestBody);
  return value as unknown as RequestTransform;
}

/** Check references against the final CLI names, including inherited parameters. */
export function validateRequestTransformArguments(
  alias: RequestTransform,
  args: readonly RequestTransformArgumentInfo[],
): void {
  const byName = new Map(args.map((arg) => [arg.name, arg]));
  assert(byName.size === args.length, 'Request transform arguments must have unique names.');
  const lookup = (name: string): RequestTransformArgumentInfo => {
    const arg = byName.get(name);
    assert(arg, `Unknown request transform argument reference: ${name}`);
    return arg;
  };
  const used = new Set<string>();
  const visit = (node: RequestBodyTransform): void => {
    if ('arg' in node) {
      lookup(node.arg);
      used.add(node.arg);
    } else if ('object' in node) {
      for (const entry of node.object) {
        if (typeof entry.key !== 'string') {
          const arg = lookup(entry.key.arg);
          assert(
            arg.required && arg.type === 'string' && !arg.sensitive,
            'Request transform map keys require a required, nonsensitive string argument.',
          );
          used.add(entry.key.arg);
        }
        if (entry.omitIfUnset) {
          lookup(entry.omitIfUnset);
          used.add(entry.omitIfUnset);
        }
        visit(entry.value);
      }
    }
  };
  visit(alias.requestBody);
  for (const arg of alias.arguments) {
    assert(used.has(arg.name), `Unused request transform argument: ${arg.name}`);
  }
}
