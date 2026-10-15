import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRequestTransform, validateRequestTransformArguments } from '../plugin/request-transform.js';

const projection = () => ({
  arguments: [{ name: 'name', description: 'Label name.', type: 'string', required: true, positional: true }],
  requestBody: { object: [{ key: 'labels', value: { object: [{ key: { arg: 'name' }, value: { literal: null } }] } }] },
});

test('validates references, computed keys and literal nulls', () => {
  const alias = parseRequestTransform(projection());
  validateRequestTransformArguments(alias, alias.arguments);
  assert.deepEqual(alias.requestBody, projection().requestBody);
});

test('accepts literal array request bodies', () => {
  for (const body of [[], ['label', null, { enabled: false }]]) {
    const alias = parseRequestTransform({ ...projection(), arguments: [], requestBody: { literal: body } });
    validateRequestTransformArguments(alias, alias.arguments);
    assert.deepEqual(alias.requestBody, { literal: body });
  }
});

for (const [name, change, message] of [
  [
    'unknown reference',
    (a) => {
      a.requestBody.object[0].value.object[0].key.arg = 'missing';
    },
    /Unknown.*missing/,
  ],
  [
    'optional map key',
    (a) => {
      a.arguments[0].required = false;
      a.arguments[0].positional = false;
    },
    /required, nonsensitive/,
  ],
  [
    'sensitive map key',
    (a) => {
      a.arguments[0].sensitive = true;
      a.arguments[0].positional = false;
    },
    /required, nonsensitive/,
  ],
  [
    'unused input',
    (a) => {
      a.arguments.push({ name: 'extra', description: 'Extra.', type: 'string' });
    },
    /Unused/,
  ],
  [
    'duplicate input',
    (a) => {
      a.arguments.push(a.arguments[0]);
    },
    /unique/,
  ],
  [
    'unknown mapping syntax',
    (a) => {
      a.requestBody.script = 'run()';
    },
    /Unknown/,
  ],
]) {
  test(`rejects ${name}`, () => {
    const value = projection();
    change(value);
    assert.throws(() => {
      const a = parseRequestTransform(value);
      validateRequestTransformArguments(a, a.arguments);
    }, message);
  });
}
