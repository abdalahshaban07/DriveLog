import { MILESTONE_INTERVAL_KM } from '../core/config';
import type { DateOnly, MaintenanceMilestone, MaintenanceTask } from './models';

export function nextTargetKm(odometer: number, interval = MILESTONE_INTERVAL_KM): number {
  if (odometer <= 0) {
    return interval;
  }
  return Math.ceil(odometer / interval) * interval;
}

export function defaultTasks(): MaintenanceTask[] {
  const kinds = ['oil', 'filter', 'tires', 'brakes', 'labor'] as const;
  return kinds.map((kind) => ({
    id: crypto.randomUUID(),
    kind,
    intervalKm: kind === 'labor' ? undefined : MILESTONE_INTERVAL_KM,
  }));
}

export function seedMilestone(
  carId: string,
  odometer: number,
  scheduledDate?: DateOnly,
): MaintenanceMilestone {
  const targetKm = nextTargetKm(odometer);
  return {
    id: crypto.randomUUID(),
    carId,
    targetKm,
    scheduledDate,
    tasks: defaultTasks(),
  };
}

export function kmRemaining(targetKm: number, currentOdometer: number): number {
  return Math.max(0, targetKm - currentOdometer);
}

export function taskKmRemaining(
  task: MaintenanceTask,
  milestone: MaintenanceMilestone,
  currentOdometer: number,
): number {
  if (task.maintenanceId) {
    return 0;
  }
  if (task.intervalKm != null && task.lastDoneKm != null) {
    return Math.max(0, task.lastDoneKm + task.intervalKm - currentOdometer);
  }
  return kmRemaining(milestone.targetKm, currentOdometer);
}

export function sortMilestones(
  milestones: readonly MaintenanceMilestone[],
): MaintenanceMilestone[] {
  return [...milestones].sort((a, b) => a.targetKm - b.targetKm);
}

export function nextMilestone(
  milestones: readonly MaintenanceMilestone[],
  currentOdometer: number,
): MaintenanceMilestone | null {
  const open = sortMilestones(milestones).find((m) =>
    m.tasks.some((t) => !t.maintenanceId) && m.targetKm >= currentOdometer - MILESTONE_INTERVAL_KM,
  );
  return open ?? sortMilestones(milestones).find((m) => m.tasks.some((t) => !t.maintenanceId)) ?? null;
}

export function completeTask(
  milestone: MaintenanceMilestone,
  taskId: string,
  maintenanceId: string,
  doneKm: number,
): MaintenanceMilestone {
  return {
    ...milestone,
    tasks: milestone.tasks.map((t) =>
      t.id === taskId
        ? { ...t, maintenanceId, lastDoneKm: doneKm }
        : t,
    ),
  };
}

export function addMilestoneAfter(
  carId: string,
  existing: readonly MaintenanceMilestone[],
  currentOdometer: number,
): MaintenanceMilestone {
  const maxTarget = existing.reduce((m, x) => Math.max(m, x.targetKm), 0);
  const targetKm =
    maxTarget > 0 ? maxTarget + MILESTONE_INTERVAL_KM : nextTargetKm(currentOdometer);
  return {
    id: crypto.randomUUID(),
    carId,
    targetKm,
    tasks: defaultTasks(),
  };
}
