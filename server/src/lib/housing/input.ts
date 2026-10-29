import { z } from 'zod';
import type { CaseHousing, Prisma } from '@prisma/client';
import { badRequest } from '../http.js';
import { BRING_ITEMS, HOUSING_STEPS, applyTicks, berlinWallToUtc, dayToDate } from './core.js';

/** Request shapes shared by the client (/api/housing) and staff (/api/admin/housing) routes. */

const DAY = 24 * 60 * 60 * 1000;
export const MOVE_IN_PAST_DAYS = 180;
export const MOVE_IN_FUTURE_DAYS = 365;
export const APPOINTMENT_MAX_DAYS = 180;

export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'INVALID_DATE');
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const blank = (max: number) => z.string().trim().max(max).nullable().optional();

export const appointmentSchema = z
  .object({ date: daySchema, time: timeSchema, address: z.string().trim().min(3).max(300), note: blank(500) })
  .nullable();

const ticksSchema = (keys: readonly string[]) => z.record(z.string(), z.boolean()).refine((o) => Object.keys(o).every((k) => keys.includes(k)), 'UNKNOWN_STEP');

export const housingPatchSchema = z
  .object({
    caseId: z.string().max(40).optional(),
    city: blank(80),
    budgetMax: z.coerce.number().int().min(100).max(10000).nullable().optional(),
    moveInDate: daySchema.nullable().optional(),
    steps: ticksSchema(HOUSING_STEPS).optional(),
    bring: ticksSchema(BRING_ITEMS).optional(),
    appointment: appointmentSchema.optional(),
  })
  .strict();

export type HousingPatch = z.infer<typeof housingPatchSchema>;

/** Turns a validated patch into an update; throws 400 for dates out of range. */
export const housingPatchData = (h: CaseHousing, body: Omit<HousingPatch, 'caseId'>, actorId: string, now = new Date()) => {
  const data: Prisma.CaseHousingUpdateInput = {};
  if (body.city !== undefined) data.city = body.city?.trim() ? body.city.trim() : null;
  if (body.budgetMax !== undefined) data.budgetMax = body.budgetMax;
  if (body.moveInDate !== undefined) {
    if (body.moveInDate) {
      const d = dayToDate(body.moveInDate);
      if (d.getTime() < now.getTime() - MOVE_IN_PAST_DAYS * DAY) throw badRequest('MOVE_IN_TOO_OLD');
      if (d.getTime() > now.getTime() + MOVE_IN_FUTURE_DAYS * DAY) throw badRequest('MOVE_IN_TOO_FAR');
      data.moveInDate = d;
    } else data.moveInDate = null;
  }
  if (body.steps) data.housingSteps = applyTicks(h.housingSteps, body.steps, HOUSING_STEPS, now);
  if (body.bring) data.bringItems = applyTicks(h.bringItems, body.bring, BRING_ITEMS, now);
  let appointmentChanged = false;
  if (body.appointment !== undefined) {
    if (body.appointment) {
      const at = berlinWallToUtc(body.appointment.date, body.appointment.time);
      if (at.getTime() <= now.getTime()) throw badRequest('APPOINTMENT_IN_PAST');
      if (at.getTime() > now.getTime() + APPOINTMENT_MAX_DAYS * DAY) throw badRequest('APPOINTMENT_TOO_FAR');
      const address = body.appointment.address.trim();
      const note = body.appointment.note?.trim() || null;
      appointmentChanged = h.appointmentAt?.getTime() !== at.getTime() || h.appointmentAddress !== address;
      Object.assign(data, { appointmentAt: at, appointmentAddress: address, appointmentNote: note });
      if (appointmentChanged) Object.assign(data, { appointmentSetAt: now, appointmentSetById: actorId });
    } else if (h.appointmentAt) {
      Object.assign(data, { appointmentAt: null, appointmentAddress: null, appointmentNote: null, appointmentSetAt: null, appointmentSetById: null });
    }
  }
  return { data, appointmentChanged };
};
