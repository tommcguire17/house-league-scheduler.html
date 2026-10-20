import { useMemo, useState } from 'react';
import type { Season, Game, LeagueManifest } from '@league/core';
import { REASON_LABELS, describeMove, fmtDate, fmtDay, gameWhen, placementOf, type ChangeReason, validateSeason, slotHolds } from '@league/core';

/**
 * Editing one game. Every change is validated against the whole season before
 * it is offered, so a move that would break a rule says so before you take it.
 */
export function GameEditor(
  { season, manifest, game, onApply, onClose }:
  { season: Season; manifest: LeagueManifest; game: Game;
    onApply: (s: Season) => void; onClose: () => void },
) {
  const [mode, setMode] = useState<'home' | 'away'>(game.away ? 'away' : 'home');
  const [facility, setFacility] = useState(game.away?.facility ?? '');
  const [awayDate, setAwayDate] = useState(game.away?.date ?? '');
  const [awayStart, setAwayStart] = useState(game.away?.start ?? '19:00');
  const [awayMins, setAwayMins] = useState(game.away?.minutes ?? 60);
  const [reason, setReason] = useState<ChangeReason>('rink-conflict');
  const [note, setNote] = useState('');

  const slotById = useMemo(() => new Map(season.slots.map((s) => [s.id, s])), [season]);
  const name = useMemo(() => new Map(season.teams.map((t) => [t.id, t.name])), [season]);
  const taken = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of season.games) if (g.slotId) m.set(g.slotId, (m.get(g.slotId) ?? 0) + 1);
    for (const p of season.practices) if (p.teamIds.length) m.set(p.slotId, (m.get(p.slotId) ?? 0) + 1);
    return m;
  }, [season]);

  const apply = (patch: Partial<Game>): Season => ({
    ...season,
    games: season.games.map((g) => (g.id === game.id ? { ...g, ...patch } : g)),
  });

  /**
   * Applying a move also records it. Overwriting where a game used to be, with
   * no trace, is how "it changed and nobody knows why" happens.
   */
  const commit = (next: Season) => {
    const before = new Map(season.slots.map((s) => [s.id, s]));
    const after = new Map(next.slots.map((s) => [s.id, s]));
    const changes = [...next.changes];
    for (const g of next.games) {
      const was = season.games.find((x) => x.id === g.id);
      if (!was) continue;
      const c = describeMove(g.id, placementOf(was, before), placementOf(g, after), reason, note.trim());
      if (c) changes.push(c);
    }
    onApply({ ...next, changes });
    setNote('');
  };

  /** Errors this change would introduce that do not already exist. */
  const newErrors = (next: Season): string[] => {
    const before = new Set(validateSeason(season, manifest)
      .violations.filter((v) => v.severity === 'error').map((v) => v.code + v.message));
    return validateSeason(next, manifest).violations
      .filter((v) => v.severity === 'error' && !before.has(v.code + v.message))
      .map((v) => v.message);
  };

  /** Trade places with the game already sitting in that slot. */
  const swapWith = (other: Game): Season => ({
    ...season,
    games: season.games.map((g) =>
      g.id === game.id ? { ...g, slotId: other.slotId, away: null }
      : g.id === other.id ? { ...other, slotId: game.slotId, away: null }
      : g),
  });

  // Every game slot, and what it would cost to go there. A full slot is not a
  // dead end: on a tight schedule the only useful move is a straight swap.
  const options = useMemo(() => season.slots
    .filter((s) => s.use === 'game')
    .map((s) => {
      const current = s.id === game.slotId;
      const occupied = (taken.get(s.id) ?? 0) - (current ? 1 : 0);
      const div = season.divisions.find((d) => d.id === game.divisionId);
      const full = occupied >= slotHolds(s, div);
      const sitting = season.games.find((g) => g.slotId === s.id && g.id !== game.id);
      return {
        slot: s, current, occupied, full, sitting,
        problems: current ? [] : full ? [] : newErrors(apply({ slotId: s.id, away: null })),
        swapProblems: current || !full || !sitting || !game.slotId ? ['no swap possible']
          : sitting.locked ? [`${label(sitting)} is locked.`]
          : newErrors(swapWith(sitting)),
      };
    }), [season, game, taken]);

  function label(g: Game): string {
    return `${name.get(g.homeTeamId ?? '') ?? g.homeLabel} v ${name.get(g.awayTeamId ?? '') ?? g.awayLabel}`;
  }

  const free = options.filter((o) => !o.full && !o.problems.length && !o.current);
  const swappable = options.filter((o) => o.full && !o.swapProblems.length);
  const when = gameWhen(game, slotById);

  const awayProblems = (): string[] => {
    if (!facility.trim()) return ['Name the rink this game is played at.'];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(awayDate)) return ['Give the date as YYYY-MM-DD.'];
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(awayStart)) return ['Give the time as HH:MM, 24 hour.'];
    return newErrors(apply({
      slotId: null,
      away: { facility: facility.trim(), city: '', date: awayDate, start: awayStart, minutes: awayMins },
    }));
  };

  return (
    <div className="editor">
      <div className="editor-head">
        <div>
          <strong>{name.get(game.homeTeamId ?? '') ?? game.homeLabel}</strong>
          {' v '}
          <strong>{name.get(game.awayTeamId ?? '') ?? game.awayLabel}</strong>
          <span className="chip div" style={{ marginLeft: 8 }}>{game.divisionId}</span>
        </div>
        <button className="btn line" onClick={onClose}>Close</button>
      </div>

      <p className="lede" style={{ marginBottom: 12 }}>
        {when
          ? `Currently ${when.away ? 'away at' : 'at'} ${when.rink}, ${fmtDay(when.date)} ${fmtDate(when.date)} at ${when.start}.`
          : 'This game has no date yet.'}
      </p>

      <div className="row">
        <div className="field">
          <label htmlFor="why">Why it is moving</label>
          <select id="why" value={reason} onChange={(e) => setReason(e.target.value as ChangeReason)}>
            {(Object.keys(REASON_LABELS) as ChangeReason[]).map((k) =>
              <option key={k} value={k}>{REASON_LABELS[k]}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label htmlFor="note">Note for the record</label>
          <input id="note" type="text" value={note} placeholder="Optional"
            onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div className="row">
        <label className="toggle">
          <input type="checkbox" checked={game.locked}
            onChange={(e) => onApply(apply({ locked: e.target.checked }))} />
          Lock this game so generating leaves it alone
        </label>
      </div>

      <div className="row">
        <button className={`btn ${mode === 'home' ? 'go' : 'line'}`}
          aria-pressed={mode === 'home'} onClick={() => setMode('home')}>Our ice</button>
        <button className={`btn ${mode === 'away' ? 'go' : 'line'}`}
          aria-pressed={mode === 'away'} onClick={() => setMode('away')}>Away at another rink</button>
      </div>

      {mode === 'home' ? (
        <>
          <p className="lede" style={{ marginBottom: 10 }}>
            {free.length} empty {free.length === 1 ? 'slot takes' : 'slots take'} this game, and{' '}
            {swappable.length} occupied {swappable.length === 1 ? 'slot can' : 'slots can'} trade
            places with it. Anything else says why not.
          </p>
          <div className="scroll-y">
            <table>
              <thead>
                <tr><th>Date</th><th>Day</th><th>Time</th><th>Rink</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {options.map((o) => (
                  <tr key={o.slot.id} className={o.current ? 'is-current' : ''}>
                    <td>{fmtDate(o.slot.date)}</td>
                    <td className="muted">{fmtDay(o.slot.date)}</td>
                    <td>{o.slot.start}</td>
                    <td>{o.slot.rink}</td>
                    <td>
                      {o.current ? <span className="flag ok">here now</span>
                        : o.full
                          ? (o.swapProblems.length
                              ? <span className="flag err">{o.swapProblems[0]}</span>
                              : <span className="muted">holds {label(o.sitting!)}</span>)
                          : o.problems.length
                            ? <span className="flag err">{o.problems[0]}</span>
                            : <span className="flag ok">empty</span>}
                    </td>
                    <td>
                      {o.current ? null : o.full ? (
                        <button className="btn line" disabled={o.swapProblems.length > 0}
                          onClick={() => { commit(swapWith(o.sitting!)); onClose(); }}>
                          Swap
                        </button>
                      ) : (
                        <button className="btn line" disabled={o.problems.length > 0}
                          onClick={() => { commit(apply({ slotId: o.slot.id, away: null })); onClose(); }}>
                          Move here
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <AwayForm
          facility={facility} setFacility={setFacility}
          date={awayDate} setDate={setAwayDate}
          start={awayStart} setStart={setAwayStart}
          minutes={awayMins} setMinutes={setAwayMins}
          problems={awayProblems()}
          onSave={() => {
            commit(apply({
              slotId: null,
              away: { facility: facility.trim(), city: '', date: awayDate, start: awayStart, minutes: awayMins },
            }));
            onClose();
          }}
        />
      )}
    </div>
  );
}

function AwayForm(p: {
  facility: string; setFacility: (v: string) => void;
  date: string; setDate: (v: string) => void;
  start: string; setStart: (v: string) => void;
  minutes: number; setMinutes: (v: number) => void;
  problems: string[]; onSave: () => void;
}) {
  return (
    <>
      <p className="lede" style={{ marginBottom: 12 }}>
        An away game uses none of our ice, but both teams still count it and stay busy that day.
      </p>
      <div className="row">
        <div className="field">
          <label htmlFor="fac">Rink</label>
          <input id="fac" type="text" value={p.facility} style={{ width: 220 }}
            placeholder="Codey Arena" onChange={(e) => p.setFacility(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ad">Date</label>
          <input id="ad" type="text" value={p.date} style={{ width: 130 }}
            placeholder="2027-01-16" onChange={(e) => p.setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="as">Start</label>
          <input id="as" type="text" value={p.start} style={{ width: 90 }}
            placeholder="19:00" onChange={(e) => p.setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="am">Minutes</label>
          <input id="am" type="number" value={p.minutes} style={{ width: 90 }}
            onChange={(e) => p.setMinutes(Math.max(1, +e.target.value))} />
        </div>
      </div>
      {p.problems.length > 0 && (
        <ul className="problems">{p.problems.map((x, i) => <li key={i}>{x}</li>)}</ul>
      )}
      <button className="btn go" onClick={p.onSave} disabled={p.problems.length > 0}>
        Save as an away game
      </button>
    </>
  );
}
