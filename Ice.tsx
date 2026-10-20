import { useMemo, useState } from 'react';
import type { IceRule, OwnerPolicy, Season, Slot, SlotUse, Weekday } from '@league/core';
import {
  FORMAT_LABEL, applyIceRules, describeRule, fmtDate, fmtDay, isRepurposed,
  repurposeSlot, repurposedSlots, revertSlot, slotHolds, slotIsBusy, suggestIceRules,
} from '@league/core';
import { importIceSlots, type ImportIssue } from '@league/io';
import { readFile } from '../lib/files';

const WEEKDAYS: Weekday[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

const USES: { v: SlotUse; label: string }[] = [
  { v: 'game', label: 'Game' },
  { v: 'practice', label: 'Practice' },
  { v: 'evaluation', label: 'Evaluation' },
  { v: 'unused', label: 'Out of play' },
];

export function Ice({ season, onChange }: { season: Season; onChange: (s: Season) => void }) {
  const [rink, setRink] = useState('all');
  const [use, setUse] = useState('all');
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [note, setNote] = useState('');
  const [showRules, setShowRules] = useState(false);

  const usedSlots = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of season.games) if (g.slotId) m.set(g.slotId, (m.get(g.slotId) ?? 0) + 1);
    for (const p of season.practices) if (p.teamIds.length) m.set(p.slotId, (m.get(p.slotId) ?? 0) + p.teamIds.length);
    return m;
  }, [season]);

  const rinks = useMemo(() => [...new Set(season.slots.map((s) => s.rink))].sort(), [season]);
  const moved = repurposedSlots(season);
  const rows = season.slots.filter((s) =>
    (rink === 'all' || s.rink === rink)
    && (use === 'all' || (use === 'repurposed' ? isRepurposed(s) : s.use === use)));

  const edit = (id: string, patch: Partial<Slot>) =>
    onChange({ ...season, slots: season.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  /**
   * Changing what a slot is for is a decision, not a typo fix: it is recorded
   * against what the building booked, protected from the rules pass, and
   * listed in the handback to whoever keeps Finnly.
   */
  const changeUse = (slot: Slot, use: SlotUse) => {
    if (use === slot.use) return;
    if (slotIsBusy(season, slot.id)
      && !confirm('Something is booked on this slot. Change what it is for anyway?')) return;
    const booked = slot.bookedUse ?? slot.use;
    const note = use === booked ? '' : (prompt(
      `This slot was booked as ${booked}. Why is it being used for ${use}?`,
      slot.repurposeNote || '') ?? '');
    onChange(repurposeSlot(season, slot.id, use, { note }));
  };

  const remove = (id: string) => {
    if (usedSlots.has(id) && !confirm('Something is booked in this slot. Remove it anyway?')) return;
    onChange({
      ...season,
      slots: season.slots.filter((s) => s.id !== id),
      games: season.games.map((g) => (g.slotId === id ? { ...g, slotId: null } : g)),
      practices: season.practices.filter((p) => p.slotId !== id),
    });
  };

  /** A blank slot you fill in, dated today or the season start. */
  const add = () => {
    const date = season.startDate;
    let n = 1;
    let id = `manual-${date}-${n}`;
    while (season.slots.some((s) => s.id === id)) id = `manual-${date}-${++n}`;
    const slot: Slot = {
      id, date, start: '18:00', minutes: 60,
      rink: rinks[0] ?? 'Red Hawk', use: 'game', capacity: 0, practiceTeams: 0,
      ownerDivisionId: null, ownerPolicy: 'priority',
      bookedUse: 'game', repurposeNote: '', tag: 'added by hand',
    };
    onChange({ ...season, slots: [...season.slots, slot] });
    setNote(`Added a slot on ${fmtDate(date)}. Change its date, time and rink below.`);
    setIssues([]);
  };

  async function importCsv() {
    const f = await readFile('.csv,text/csv');
    if (!f) return;
    try {
      const r = importIceSlots(f.text, {
        defaultUse: 'game',
        divisionIds: season.divisions.map((d) => d.id),
      });
      const key = (s: { date: string; start: string; rink: string }) =>
        `${s.date}|${s.start}|${s.rink}`;
      const byKey = new Map(season.slots.map((s) => [key(s), s]));
      const fresh = r.items.filter((s) => !byKey.has(key(s)));
      const dupes = r.items.length - fresh.length;

      // A slot we deliberately repurposed keeps our use, as agreed: the file
      // says what the building booked, we say what is happening on the ice.
      // The difference is reported rather than silently resolved either way.
      const conflicts = r.items
        .map((s) => ({ incoming: s, have: byKey.get(key(s)) }))
        .filter((x) => x.have && x.have.use !== x.incoming.use);

      onChange({
        ...season,
        slots: [...season.slots, ...fresh]
          .sort((a, b) => (a.date + a.start + a.rink).localeCompare(b.date + b.start + b.rink)),
      });
      setIssues([
        ...r.issues,
        ...conflicts.map((c) => ({
          row: 0,
          message: `${c.incoming.date} ${c.incoming.start} ${c.incoming.rink}: the file says `
            + `${c.incoming.use}, this season has it as ${c.have!.use}. Kept as `
            + `${c.have!.use}; it is on the ice differences export.`,
        })),
      ]);
      setNote(`${f.name}: added ${fresh.length} slots`
        + (dupes ? `, skipped ${dupes} already here` : '')
        + (conflicts.length ? `, kept ${conflicts.length} of your own changes` : '')
        + (r.skipped ? `, could not read ${r.skipped} rows` : '') + '.');
    } catch (e) {
      setIssues([]);
      setNote(e instanceof Error ? e.message : String(e));
    }
  }

  const freeCount = season.slots.filter((s) => !usedSlots.has(s.id)).length;
  const divName = (id: string) => season.divisions.find((d) => d.id === id)?.name ?? id;

  // ---- standing rules -------------------------------------------------------
  const setRules = (iceRules: IceRule[]) => onChange({ ...season, iceRules });

  const editRule = (id: string, patch: Partial<IceRule>) =>
    setRules(season.iceRules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const findRules = () => {
    const found = suggestIceRules(season);
    // Match on what a rule SELECTS, not on its id. Two rules for Wednesday at
    // 18:10 are the same rule however they were named, and deduping by id
    // quietly doubled the table every time this was pressed.
    const sig = (r: IceRule) =>
      `${[...r.weekdays].sort().join(',')}|${r.start ?? ''}|${r.rink}|${r.matchUse ?? ''}`;
    const have = new Set(season.iceRules.map(sig));
    const fresh = found.filter((r) => !have.has(sig(r)));
    setRules([...season.iceRules, ...fresh]);
    setShowRules(true);
    setNote(fresh.length
      ? `Found ${fresh.length} weekly patterns in the booked ice. Say who each one belongs to, then apply.`
      : 'No new weekly patterns found. Every repeating day and time already has a rule.');
  };

  /** A blank rule, for ice that does not repeat weekly. */
  const addRule = () => {
    let n = season.iceRules.length + 1;
    while (season.iceRules.some((r) => r.id === `rule-${n}`)) n++;
    setRules([...season.iceRules, {
      id: `rule-${n}`, weekdays: [], start: null, rink: '', matchUse: null,
      setUse: null, divisionId: null, policy: 'priority',
      capacity: 0, practiceTeams: 0, note: 'added by hand',
    }]);
    setShowRules(true);
  };

  const runRules = () => {
    const { season: next, applied } = applyIceRules(season);
    onChange(next);
    const total = applied.reduce((n, a) => n + a.matched, 0);
    const idle = applied.filter((a) => !a.matched).length;
    setNote(`Applied ${season.iceRules.length} rules to ${total} slots`
      + (idle ? `. ${idle} matched nothing — check the day, time and rink.` : '.'));
  };

  return (
    <>
      <h2>Booked ice</h2>
      <p className="lede">
        {season.slots.length
          ? `${season.slots.length} slots, ${freeCount} of them unused`
            + (moved.length
              ? `, ${moved.length} being used for something other than what the building booked. `
              : '. ')
            + 'Change what a slot is for and every count updates.'
          : 'No ice yet. Import a Finnly export, or add slots one at a time.'}
      </p>

      <div className="row">
        <button className="btn go" onClick={importCsv}>Import ice from CSV</button>
        <button className="btn line" onClick={add}>Add a slot</button>
        {season.slots.length > 0 && (
          <button className="btn line" onClick={() => setShowRules((v) => !v)}>
            {showRules ? 'Hide' : 'Who gets which ice'}
            {season.iceRules.length ? ` (${season.iceRules.length})` : ''}
          </button>
        )}
        {season.slots.length > 0 && (
          <>
            <div className="field">
              <label htmlFor="rink">Rink</label>
              <select id="rink" value={rink} onChange={(e) => setRink(e.target.value)}>
                <option value="all">All rinks</option>
                {rinks.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="use">Use</label>
              <select id="use" value={use} onChange={(e) => setUse(e.target.value)}>
                <option value="all">All</option>
                {USES.map((u) => <option key={u.v} value={u.v}>{u.label}</option>)}
                <option value="repurposed">Used differently from booked</option>
              </select>
            </div>
            <div className="field"><label>&nbsp;</label><span className="muted">{rows.length} shown</span></div>
          </>
        )}
      </div>

      {showRules && (
        <div className="panel">
          <h3>Who gets which ice</h3>
          <p className="lede" style={{ marginBottom: 12 }}>
            A rink thinks in standing bookings: Wednesday at 18:10 is 8U practice, 7am Sunday is
            8U games. Set them here once and apply, instead of tagging {season.slots.length} rows
            by hand and hoping none were missed. Later rules win, so put the broad one first.
          </p>
          <div className="row">
            <button className="btn line" onClick={findRules}>Find the weekly patterns</button>
            <button className="btn line" onClick={addRule}>Add a rule</button>
            <button className="btn go" onClick={runRules} disabled={!season.iceRules.length}>
              Apply to the ice
            </button>
            {season.iceRules.length > 0 && (
              <button className="btn line" onClick={() => {
                if (confirm('Remove every rule? The slots keep whatever they are set to now.')) setRules([]);
              }}>Clear rules</button>
            )}
          </div>
          {season.iceRules.length === 0 ? (
            <p className="muted">
              No rules yet. <strong>Find the weekly patterns</strong> reads the booked ice and
              proposes one rule per repeating day and time.
            </p>
          ) : (
            <div className="scroll-x">
              <table>
                <thead>
                  <tr><th>Day</th><th>Start</th><th>Is for</th><th>Reserved for</th>
                    <th>When the owner is done</th><th className="num">At once</th>
                    <th className="num">Teams</th><th>Slots</th><th /></tr>
                </thead>
                <tbody>
                  {season.iceRules.map((r) => {
                    const hits = season.slots.filter((sl) => {
                      const wd = fmtDay(sl.date).toLowerCase();
                      return (!r.weekdays.length || r.weekdays.some((d) => d.startsWith(wd)))
                        && (!r.start || r.start === sl.start)
                        && (!r.rink || r.rink === sl.rink);
                    }).length;
                    return (
                      <tr key={r.id} title={describeRule(r, divName)}>
                        <td>
                          <select value={r.weekdays[0] ?? ''} aria-label={`${r.id} day`}
                            onChange={(e) => editRule(r.id, {
                              weekdays: e.target.value ? [e.target.value as Weekday] : [],
                            })}>
                            <option value="">Any day</option>
                            {WEEKDAYS.map((d) => (
                              <option key={d} value={d}>{d[0]!.toUpperCase() + d.slice(1)}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input type="time" value={r.start ?? ''} style={{ width: 96 }}
                            aria-label={`${r.id} start`}
                            onChange={(e) => editRule(r.id, { start: e.target.value || null })} />
                        </td>
                        <td>
                          <select value={r.setUse ?? ''} aria-label={`${r.id} use`}
                            onChange={(e) => editRule(r.id, { setUse: (e.target.value || null) as SlotUse | null })}>
                            <option value="">Leave as is</option>
                            {USES.map((u) => <option key={u.v} value={u.v}>{u.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={r.divisionId ?? ''} aria-label={`${r.id} division`}
                            onChange={(e) => editRule(r.id, { divisionId: e.target.value || null })}>
                            <option value="">Anyone</option>
                            {season.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td>
                          {r.divisionId ? (
                            <select value={r.policy} aria-label={`${r.id} policy`}
                              onChange={(e) => editRule(r.id, { policy: e.target.value as OwnerPolicy })}>
                              <option value="priority">open it to everyone</option>
                              <option value="exclusive">keep it reserved</option>
                            </select>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td className="num">
                          <input type="number" min={0} max={4} className="score" value={r.capacity}
                            aria-label={`${r.id} games at once`}
                            onChange={(e) => editRule(r.id, { capacity: Math.max(0, Math.min(4, +e.target.value)) })} />
                        </td>
                        <td className="num">
                          <input type="number" min={0} max={6} className="score" value={r.practiceTeams}
                            aria-label={`${r.id} teams per practice`}
                            onChange={(e) => editRule(r.id, { practiceTeams: Math.max(0, Math.min(6, +e.target.value)) })} />
                        </td>
                        <td className={hits ? 'muted' : 'flag wrn'}>{hits || 'none'}</td>
                        <td>
                          <button className="btn line"
                            onClick={() => setRules(season.iceRules.filter((x) => x.id !== r.id))}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted" style={{ marginTop: 10 }}>
                <strong>At once</strong> is how many games share the sheet; 0 takes it from the
                division's ice format on Setup.
                <strong> Teams</strong> is how many share a practice; 0 works it out from the
                division. Both 0 means leave the slot alone.
              </p>
            </div>
          )}
        </div>
      )}

      {note && <p className="notice">{note}</p>}
      {issues.length > 0 && (
        <details className="panel" open={issues.length <= 5}>
          <summary><strong>{issues.length} rows needed attention</strong></summary>
          <ul className="problems" style={{ marginTop: 10 }}>
            {issues.slice(0, 40).map((i, k) => <li key={k}>Row {i.row}: {i.message}</li>)}
            {issues.length > 40 && <li>and {issues.length - 40} more</li>}
          </ul>
        </details>
      )}

      {season.slots.length === 0 ? (
        <div className="empty">
          <p>Export the booked ice from Finnly as CSV and import it here. The columns it needs are
            a date, a start time and a facility; end time is used for the slot length if present.</p>
          <p>Or add slots one at a time if you are building a season by hand.</p>
        </div>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Day</th><th>Start</th><th className="num">Mins</th><th>Rink</th>
                <th>Use</th><th>Reserved for</th><th className="num">Holds</th><th>Booked</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const n = usedSlots.get(s.id) ?? 0;
                return (
                  <tr key={s.id}>
                    <td>
                      <input type="date" defaultValue={s.date} style={{ width: 138 }}
                        onBlur={(e) => e.target.value && edit(s.id, { date: e.target.value })} />
                    </td>
                    <td className="muted">{fmtDay(s.date)}</td>
                    <td>
                      <input type="time" defaultValue={s.start} style={{ width: 96 }}
                        onBlur={(e) => e.target.value && edit(s.id, { start: e.target.value })} />
                    </td>
                    <td className="num">
                      <input type="number" min={10} step={5} className="score" value={s.minutes}
                        onChange={(e) => edit(s.id, { minutes: Math.max(10, +e.target.value) })} />
                    </td>
                    <td>
                      <input type="text" defaultValue={s.rink} style={{ width: 110 }}
                        onBlur={(e) => edit(s.id, { rink: e.target.value.trim() || s.rink })} />
                    </td>
                    <td>
                      <select value={s.use} aria-label={`${s.date} ${s.start} use`}
                        onChange={(e) => changeUse(s, e.target.value as SlotUse)}>
                        {USES.map((u) => <option key={u.v} value={u.v}>{u.label}</option>)}
                      </select>
                      {isRepurposed(s) && (
                        <button className="pill moved" title={s.repurposeNote
                          || `Booked as ${s.bookedUse}. Click to put it back.`}
                          onClick={() => onChange(revertSlot(season, s.id))}>
                          was {s.bookedUse}
                        </button>
                      )}
                    </td>
                    <td>
                      <select value={s.ownerDivisionId ?? ''} aria-label={`${s.date} ${s.start} reserved for`}
                        onChange={(e) => edit(s.id, { ownerDivisionId: e.target.value || null })}>
                        <option value="">Anyone</option>
                        {season.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      {s.ownerDivisionId && (
                        <select value={s.ownerPolicy} style={{ marginLeft: 4 }}
                          aria-label={`${s.date} ${s.start} policy`}
                          onChange={(e) => edit(s.id, { ownerPolicy: e.target.value as OwnerPolicy })}>
                          <option value="priority">first, then open</option>
                          <option value="exclusive">only</option>
                        </select>
                      )}
                    </td>
                    <td className="num">
                      <input type="number" min={0} max={4} className="score" value={s.capacity}
                        aria-label={`${s.date} ${s.start} games at once`}
                        onChange={(e) => edit(s.id, { capacity: Math.max(0, Math.min(4, +e.target.value)) })} />
                      {s.capacity === 0 && (() => {
                        const d = season.divisions.find((x) => x.id === s.ownerDivisionId);
                        return (
                          <span className="muted" style={{ marginLeft: 4, fontSize: 'var(--t-xs)' }}
                            title={d ? `${FORMAT_LABEL[d.iceFormat]} for ${d.name}`
                              : 'Set by whichever division plays on it'}>
                            {d ? slotHolds(s, d) : 'auto'}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      {n === 0 ? <span className="muted">free</span>
                        : n > slotHolds(s, season.divisions.find((d) => d.id === s.ownerDivisionId))
                          && s.use === 'game'
                          ? <span className="flag err">
                            over by {n - slotHolds(s, season.divisions.find((d) => d.id === s.ownerDivisionId))}
                          </span>
                        : <span className="flag ok">{n}</span>}
                    </td>
                    <td><button className="btn line" onClick={() => remove(s.id)}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
