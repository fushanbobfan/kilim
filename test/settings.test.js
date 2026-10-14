import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, sanitize, toQuery, fromQuery, encodeBitmap, decodeBitmap, encodePins, decodePins } from '../src/settings.js';
import { sampleById } from '../src/samples.js';

test('defaults produce an empty query', () => {
  assert.equal(toQuery(defaults()), '');
  assert.deepEqual(fromQuery(''), defaults());
});

test('changed settings round-trip through a query', () => {
  const s = { ...defaults(), sample: 'maze', N: 2, symmetry: 2, periodicOutput: true, width: 64, seed: 12345, recovery: 'stop' };
  const q = toQuery(s);
  assert.match(q, /s=maze/);
  assert.doesNotMatch(q, /h=/);
  assert.deepEqual(fromQuery(q), s);
});

test('sanitize clamps ranges and rejects bad values', () => {
  const s = sanitize({ N: 9, symmetry: 3, width: 2, height: 'x', speed: -4, sample: '../x' });
  assert.equal(s.N, 4);
  assert.equal(s.symmetry, 8);
  assert.equal(s.width, 8);
  assert.equal(s.height, 48);
  assert.equal(s.speed, 1);
  assert.equal(s.sample, 'kilim');
  assert.equal(sanitize({ recovery: 'pray' }).recovery, 'backtrack');
});

test('a painted sample round-trips and replaces the sample id', () => {
  const custom = sampleById('maze').bitmap;
  const q = toQuery({ ...defaults(), sample: 'maze', custom });
  assert.doesNotMatch(q, /s=/);
  const back = fromQuery(q);
  assert.deepEqual(back.custom.palette, custom.palette);
  assert.deepEqual([...back.custom.pixels], [...custom.pixels]);
  assert.equal(back.custom.width, custom.width);
});

test('malformed painted samples are dropped', () => {
  const good = encodeBitmap({ width: 2, height: 2, palette: ['#000000', '#ffffff'], pixels: Uint8Array.from([0, 1, 1, 0]) });
  assert.ok(decodeBitmap(good));
  assert.equal(decodeBitmap('2.2.000000-ffffff.012'), null);
  assert.equal(decodeBitmap('2.2.000000-ffffff.0120'), null);
  assert.equal(decodeBitmap('1.1.000000.0'), null);
  assert.equal(decodeBitmap('30.2.000000.' + '0'.repeat(60)), null);
  assert.equal(decodeBitmap('nonsense'), null);
});

test('pins round-trip through a query', () => {
  const pins = [[0, 0, 1], [47, 12, 3], [5, 47, 0]];
  const back = fromQuery(toQuery({ ...defaults(), pins }));
  assert.deepEqual(back.pins, pins);
  assert.deepEqual(fromQuery('').pins, []);
});

test('pins outside the output, with unknown colours, repeated or malformed are dropped', () => {
  const text = encodePins([[1, 1, 0], [9, 1, 0], [1, 9, 0], [2, 2, 5], [1, 1, 1]]) + '_x.1.2_3.3';
  assert.deepEqual(decodePins(text, 8, 8, 4), [[1, 1, 0]]);
  assert.deepEqual(decodePins('', 8, 8, 4), []);
});
