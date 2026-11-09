// v1.189: the Apartment location code is 090; Unit Number offers DNA; Persons Present Not Arrested
// has a Relationship. Synthetic data only (Doe / Roe, Example City).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const RD = require('../js/reference/ref-data.js');
const RF = require('../js/report-fields.js');

test('Apartment is location code 090, and no code is 909', () => {
  const codes = RD.LOCATION_CODES.flatMap((g) => g.codes);
  assert.deepStrictEqual(codes.find(([, d]) => d === 'Apartment'), ['090', 'Apartment']);
  assert.ok(!codes.some(([c]) => c === '909'));
});

test('a report saved with 909 opens with 090', () => {
  assert.strictEqual(RF.normalize({ locationCode: '909', locationType: 'Apartment' }).locationCode, '090');
  assert.strictEqual(RF.normalize({ locationCode: '290', locationType: 'Residence' }).locationCode, '290');
});

test('Persons Present Not Arrested has a Relationship, on the PDF line too', () => {
  assert.deepStrictEqual(RF.LISTS.notArrested.fields.map(([k]) => k), ['name', 'relation', 'phone', 'address']);
  assert.strictEqual(RF.itemLine('notArrested', { name: 'Jane Roe', relation: 'Girlfriend', phone: '', address: '' }), 'Jane Roe, Relationship: Girlfriend');
});

test('Unit Number offers DNA, like Arrest Unit', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js/report-fields-ui.js'), 'utf8'), /\['methodCode', 'unit', 'safeMethod', 'arrestUnit', 'residence', 'irNumber', 'cbNumber'\]\.includes\(key\)/);
});
