'use strict';

/**
 * Returns how many days are in the given "YYYY-MM" month string.
 */
function daysInMonth(periodStr) {
    const [year, month] = periodStr.split('-').map(Number);
    return new Date(year, month, 0).getDate();
}

/**
 * Normalises any date value (Date object or ISO string) to "YYYY-MM-DD".
 */
function toDateStr(d) {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString().split('T')[0];
    return String(d).split('T')[0];
}

/**
 * Computes period target from baseline data.
 *
 *   daily_baseline = baselineAmount / baselineDays
 *   daily_target   = daily_baseline × (1 − reductionPct / 100)
 *   period_target  = daily_target × task_days          (null when no due_date)
 *
 * @param {number}            baselineAmount  kg (or tCO₂) for the baseline month
 * @param {string}            baselinePeriod  "YYYY-MM"
 * @param {number}            reductionPct    e.g. 10 means 10 %
 * @param {string|Date}       startDate       task start date
 * @param {string|Date|null}  dueDate         task due date (null → no period target)
 * @returns {{ baselineDays, taskDays, dailyBaseline, dailyTarget, periodTarget }}
 */
function calcPeriodTarget(baselineAmount, baselinePeriod, reductionPct, startDate, dueDate) {
    const baselineDays  = daysInMonth(baselinePeriod);
    const dailyBaseline = baselineAmount / baselineDays;
    const dailyTarget   = dailyBaseline * (1 - reductionPct / 100);

    let taskDays     = null;
    let periodTarget = null;

    const startStr = toDateStr(startDate);
    const dueStr   = toDateStr(dueDate);

    if (startStr && dueStr) {
        const s = new Date(startStr);
        const d = new Date(dueStr);
        taskDays     = Math.round((d - s) / 86_400_000) + 1; // inclusive both ends
        periodTarget = parseFloat((dailyTarget * taskDays).toFixed(2));
    }

    return { baselineDays, taskDays, dailyBaseline, dailyTarget, periodTarget };
}

/**
 * Determines progress status given current vs period target.
 *
 * Thresholds (active period):
 *   current ≤ target × 0.90  → on_track
 *   current ≤ target          → at_risk
 *   current >  target         → off_track
 *
 * After deadline / completed:
 *   current ≤ target → successful
 *   current >  target → failed
 *
 * @param {number|null} current
 * @param {number|null} periodTarget
 * @param {{ deadlinePassed?: boolean, isCompleted?: boolean }} opts
 * @returns {string}
 */
function calcProgressStatus(current, periodTarget, { deadlinePassed = false, isCompleted = false } = {}) {
    if (current === null || current === undefined || current <= 0) return 'no_data';
    if (periodTarget === null || periodTarget === undefined)       return 'no_data';

    if (isCompleted || deadlinePassed) {
        return current <= periodTarget ? 'successful' : 'failed';
    }

    if (current <= periodTarget * 0.90) return 'on_track';
    if (current <= periodTarget)        return 'at_risk';
    return 'off_track';
}

module.exports = { daysInMonth, toDateStr, calcPeriodTarget, calcProgressStatus };
