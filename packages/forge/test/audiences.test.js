import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectAudience } from '../plugin/audiences.js';

const source = (parent, alias) => ({
  paths: {
    '/things': {
      patch: {
        'x-fern-sdk-group-name': 'things',
        'x-fern-sdk-method-name': 'edit',
        'x-fern-audiences': parent,
        'x-fern-availability': 'beta',
        'x-forge-aliases': [
          {
            'x-fern-sdk-group-name': 'things.labels',
            'x-fern-sdk-method-name': 'remove',
            ...(alias === undefined ? {} : { 'x-fern-audiences': alias }),
            'x-forge-request-transform': { arguments: [], requestBody: { object: [] } },
          },
        ],
      },
    },
  },
});

test('mapped aliases supplement the primary operation and inherit metadata', () => {
  const s = source(undefined, ['cli']);
  selectAudience(s, 'cli');
  const aliases = s.paths['/things'].patch['x-forge-aliases'];
  assert.deepEqual(
    aliases.map((a) => a['x-fern-sdk-method-name']),
    ['edit', 'remove'],
  );
  assert.equal(aliases[1]['x-fern-availability'], 'beta');
});
test('aliases select audiences independently of the parent', () => {
  const s = source(['sdk'], ['cli']);
  selectAudience(s, 'cli');
  assert.deepEqual(
    s.paths['/things'].patch['x-forge-aliases'].map((a) => a['x-fern-sdk-method-name']),
    ['remove'],
  );
});
test('an omitted alias audience inherits the parent, including an empty list', () => {
  for (const audience of [[], ['sdk']]) {
    const s = source(audience);
    assert.equal(selectAudience(s, 'cli'), 1);
    assert.equal(s.paths['/things'].patch, undefined);
  }
});
test('SDK selection keeps the primary operation', () => {
  const s = source(['sdk'], ['cli']);
  selectAudience(s, 'sdk');
  assert.deepEqual(
    s.paths['/things'].patch['x-forge-aliases'].map((a) => a['x-fern-sdk-method-name']),
    ['edit'],
  );
});
test('ordinary aliases retain replacement semantics and independent audiences', () => {
  const s = source(['sdk'], ['cli']);
  delete s.paths['/things'].patch['x-forge-aliases'][0]['x-forge-request-transform'];
  selectAudience(s, 'cli');
  assert.deepEqual(
    s.paths['/things'].patch['x-forge-aliases'].map((a) => a['x-fern-sdk-method-name']),
    ['remove'],
  );
});
