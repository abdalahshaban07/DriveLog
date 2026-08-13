import {
  addCustomMaintenanceType,
  costFromPartLabor,
  maintenanceDetailFields,
  normalizeCustomTypes,
  optionalNumber,
  optionalText,
} from './maintenance-fields';

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}

/** Runnable self-check for maintenance extras + custom types. */
export function runMaintenanceFieldsSelfCheck(): void {
  assert(optionalText(undefined) === undefined, 'missing text');
  assert(optionalText('  bolt  ') === 'bolt', 'trim text');
  assert(optionalText('   ') === undefined, 'blank text');
  assert(optionalNumber(undefined) === undefined, 'missing number');
  assert(optionalNumber('') === undefined, 'empty number');
  assert(optionalNumber('1.5') === 1.5, 'decimal number');
  assert(optionalNumber(0) === 0, 'zero kept');

  assert(normalizeCustomTypes(undefined).length === 0, 'missing list');
  assert(normalizeCustomTypes([' A ', 'a', '', 'B']).join() === 'A,B', 'dedupe');

  const empty = addCustomMaintenanceType([], '  ');
  assert(!empty.ok && empty.reason === 'empty', 'empty name');
  const dup = addCustomMaintenanceType(['Oil'], 'oil');
  assert(!dup.ok && dup.reason === 'duplicate', 'case-insensitive dup');
  const add = addCustomMaintenanceType(['Oil'], 'Battery');
  assert(add.ok && add.name === 'Battery' && add.list.length === 2, 'add');
  const builtin = addCustomMaintenanceType([], 'oil');
  assert(!builtin.ok && builtin.reason === 'duplicate', 'builtin key');
  const other = addCustomMaintenanceType([], 'Other');
  assert(!other.ok && other.reason === 'duplicate', 'other reserved');

  assert(costFromPartLabor('', '') === null, 'leave total');
  assert(costFromPartLabor('10', '5') === '15', 'sum');
  assert(costFromPartLabor('10', '') === '10', 'part only');

  const old = maintenanceDetailFields({ type: 'oil' });
  assert(old.centerName === undefined && old.otherLabel === undefined, 'old backup');
  const named = maintenanceDetailFields({
    type: 'other',
    otherLabel: '  Belt  ',
    partCost: 20,
  });
  assert(named.otherLabel === 'Belt' && named.partCost === 20, 'other extras');
  const stripped = maintenanceDetailFields({ type: 'oil', otherLabel: 'Belt' });
  assert(stripped.otherLabel === undefined, 'otherLabel only on other');
}
