import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRow, packRow } from '../../src/commands/plans.js';

test('planRow：json 金额为元，停用套餐标注仅可续费', () => {
  const row = planRow(
    { id: 'pro', name: 'Pro', monthly_price: 12500, yearly_price: 125000, monthly_credits: 500, min_image_cost: 2, is_active: false },
    'json',
  );
  assert.equal(row.monthlyPrice, 125);
  assert.equal(row.yearlyPrice, 1250);
  assert.equal(row.approxImages, 250);
  assert.match(row.note, /仅可续费/);
});

test('packRow：取后端按会员身份算好的 price，并标注价格口径', () => {
  const row = packRow(
    { id: 'pack_100', credits: 100, price: 2500, validity_days: 90, is_member: true, min_image_cost: 1 },
    'table',
  );
  assert.equal(row.price, '¥25');
  assert.equal(row.validityDays, 90);
  assert.match(row.note, /会员价/);
});
