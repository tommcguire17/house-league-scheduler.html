import type { Season } from '@league/core';
import { weekKey } from '@league/core';

export interface WeekBar { week: string; label: string; slots: number; games: number; }

/** Ice booked against ice used, week by week. The shape of the season. */
export function weekBars(season: Season, startsOn: Parameters<typeof weekKey>[1]): WeekBar[] {
  const slotById = new Map(season.slots.map((s) => [s.id, s]));
  const m = new Map<string, WeekBar>();
  const touch = (date: string): WeekBar => {
    const k = weekKey(date, startsOn);
    const [, mm, dd] = k.split('-') as [string, string, string];
    return m.get(k) ?? m.set(k, { week: k, label: `${+mm}/${+dd}`, slots: 0, games: 0 }).get(k)!;
  };
  for (const s of season.slots) touch(s.date).slots++;
  for (const g of season.games) {
    const s = g.slotId ? slotById.get(g.slotId) : undefined;
    if (s) touch(s.date).games++;
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week));
}
