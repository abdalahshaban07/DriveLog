import type { PartDefinition, PartTrackingMode } from './models';

export const PART_CATALOG_VERSION = 1;

/** Stable system id for the only DriveLog SYSTEM_RULE interval (52A). */
export const ROUTINE_CHECK_PART_ID = 'sys-routine-check-10k';

export const SYSTEM_ENGINE_OIL_ID = 'sys-engine-oil';
export const SYSTEM_TIRES_ID = 'sys-tires';
export const SYSTEM_BRAKE_PADS_ID = 'sys-brake-pads';
export const SYSTEM_BRAKE_DISCS_ID = 'sys-brake-discs';
export const SYSTEM_BATTERY_ID = 'sys-battery';

function sys(
  id: string,
  labelKey: string,
  category: PartDefinition['category'],
  trackingMode: PartTrackingMode,
  extras: Partial<PartDefinition> = {},
): PartDefinition {
  const ts = '1970-01-01T00:00:00.000Z';
  return {
    id,
    labelKey,
    category,
    source: 'system',
    trackingMode,
    active: true,
    createdAt: ts,
    updatedAt: ts,
    ...extras,
  };
}

/**
 * Built-in catalog (spec §5 minus Custom Part stub).
 * Only routine check has a system interval (52A / 99A).
 */
export const SYSTEM_PART_CATALOG: readonly PartDefinition[] = [
  sys(ROUTINE_CHECK_PART_ID, 'parts.routineCheck', 'OTHER', 'interval', {
    intervalKm: 10_000,
  }),
  // ENGINE
  sys(SYSTEM_ENGINE_OIL_ID, 'parts.engineOil', 'ENGINE', 'history'),
  sys('sys-oil-filter', 'parts.oilFilter', 'ENGINE', 'history'),
  sys('sys-air-filter', 'parts.airFilter', 'ENGINE', 'history'),
  sys('sys-cabin-filter', 'parts.cabinFilter', 'ENGINE', 'history'),
  sys('sys-spark-plugs', 'parts.sparkPlugs', 'ENGINE', 'history'),
  sys('sys-coolant', 'parts.coolant', 'ENGINE', 'history'),
  sys('sys-serpentine-belt', 'parts.serpentineBelt', 'ENGINE', 'history'),
  sys('sys-timing-belt', 'parts.timingBelt', 'ENGINE', 'history'),
  // TRANSMISSION
  sys('sys-transmission-fluid', 'parts.transmissionFluid', 'TRANSMISSION', 'history'),
  sys('sys-transmission-filter', 'parts.transmissionFilter', 'TRANSMISSION', 'history'),
  // BRAKES
  sys(SYSTEM_BRAKE_PADS_ID, 'parts.brakePads', 'BRAKES', 'measurement'),
  sys(SYSTEM_BRAKE_DISCS_ID, 'parts.brakeDiscs', 'BRAKES', 'measurement'),
  sys('sys-brake-fluid', 'parts.brakeFluid', 'BRAKES', 'history'),
  // TIRES
  sys(SYSTEM_TIRES_ID, 'parts.tires', 'TIRES', 'history'),
  sys('sys-tire-rotation', 'parts.tireRotation', 'TIRES', 'history'),
  sys('sys-wheel-alignment', 'parts.wheelAlignment', 'TIRES', 'history'),
  // ELECTRICAL
  sys(SYSTEM_BATTERY_ID, 'parts.battery', 'ELECTRICAL', 'condition'),
  sys('sys-alternator', 'parts.alternator', 'ELECTRICAL', 'history'),
  sys('sys-starter', 'parts.starter', 'ELECTRICAL', 'history'),
  // COOLING
  sys('sys-radiator', 'parts.radiator', 'COOLING', 'history'),
  sys('sys-thermostat', 'parts.thermostat', 'COOLING', 'history'),
  sys('sys-water-pump', 'parts.waterPump', 'COOLING', 'history'),
  sys('sys-hoses', 'parts.hoses', 'COOLING', 'history'),
  // DRIVETRAIN
  sys('sys-cv-axle', 'parts.cvAxle', 'DRIVETRAIN', 'history'),
  sys('sys-cv-joint', 'parts.cvJoint', 'DRIVETRAIN', 'history'),
  sys('sys-engine-mount', 'parts.engineMount', 'DRIVETRAIN', 'history'),
  sys('sys-transmission-mount', 'parts.transmissionMount', 'DRIVETRAIN', 'history'),
  sys('sys-wheel-bearing', 'parts.wheelBearing', 'DRIVETRAIN', 'history'),
  // STEERING / SUSPENSION
  sys('sys-steering-rack', 'parts.steeringRack', 'STEERING_SUSPENSION', 'history'),
  sys('sys-steering-column', 'parts.steeringColumn', 'STEERING_SUSPENSION', 'history'),
  sys('sys-shock-strut', 'parts.shockStrut', 'STEERING_SUSPENSION', 'history'),
  sys('sys-strut-top-mount', 'parts.strutTopMount', 'STEERING_SUSPENSION', 'history'),
  sys('sys-control-arm', 'parts.controlArm', 'STEERING_SUSPENSION', 'history'),
  sys('sys-ball-joint', 'parts.ballJoint', 'STEERING_SUSPENSION', 'history'),
  sys('sys-tie-rod', 'parts.tieRod', 'STEERING_SUSPENSION', 'history'),
  sys('sys-stabilizer-link', 'parts.stabilizerLink', 'STEERING_SUSPENSION', 'history'),
  sys('sys-bushings', 'parts.bushings', 'STEERING_SUSPENSION', 'history'),
  // EXHAUST
  sys('sys-catalytic-converter', 'parts.catalyticConverter', 'EXHAUST', 'history'),
  sys('sys-exhaust-components', 'parts.exhaustComponents', 'EXHAUST', 'history'),
  // VISIBILITY
  sys('sys-wiper-blades', 'parts.wiperBlades', 'VISIBILITY', 'history'),
  sys('sys-headlight-bulbs', 'parts.headlightBulbs', 'VISIBILITY', 'history'),
];

export function systemPartById(id: string): PartDefinition | undefined {
  return SYSTEM_PART_CATALOG.find((p) => p.id === id);
}

/** Merge system catalog with custom parts (custom wins on id collision). */
export function mergePartCatalog(
  customParts: readonly PartDefinition[],
): PartDefinition[] {
  const byId = new Map<string, PartDefinition>();
  for (const p of SYSTEM_PART_CATALOG) {
    byId.set(p.id, p);
  }
  for (const p of customParts) {
    byId.set(p.id, p);
  }
  return [...byId.values()];
}
