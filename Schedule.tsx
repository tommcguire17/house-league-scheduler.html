import { useMemo, useState } from 'react';
import type {
  Season, LeagueManifest, Game, Practice, Slot, RepurposeSuggestion,
} from '@league/core';
import {
  applySuggestions, evaluationReadiness, evaluationStatus, fmtDate, fmtDay, gameWhen,
} from '@league/core';
import {
  generateSchedule, assignPractices, type GenerateReport, type PracticeReport,
} from '@league/engine';
import { GameEditor } from './GameEditor';

/**
 * Everything that happens on the ice, in one list.
 *
 * It used to show games only, which made a season look half-empty: the
 * practices were not there to show, and the booked ice sitting idle was
 * invisible exactly when you most want to see it. Now every kind of row is
 * here and the Show filter takes out what you are not looking at.
 */

type Kind = 'game' | 'practice' | 'evaluation' | 'free';

interface Row {
  key: string;
  kind: Kind;
  date: string;
  start: string;
  rink: string;
  minutes: number;
  divisionId: string;
  teamIds: string[];
  away: boolean;
  game?: Game;
  practice?: Practice;
  slot?: Slot;
}

const SHOW: { v: Kind | 'all' | 'booked'; label: string }[] = [
  { v: 'booked', label: 'Everything booked' },
  { v: 'all', label: 'Everything, including free ice' },
  { v: 'game', label: 'Games only' },
  { v: 'practice', label: 'Practices only' },
  { v: 'evaluation', label: 'Evaluations only' },
  { v: 'free', label: 'Unused ice only' },
];

export function Schedule(
  { season, manifest, onChange, fresh }:
  { season: Season; manifest: LeagueManifest; onChange: (s: Season) => void; fresh: boolean },
) {
  const [team, setTeam] = useState('all');
  const [div, setDiv] = useState('all');
  const [show, setShow] = useState<Kind | 'all' | 'booked'>('booked');
  const [seed, setSeed] = useState(20262027);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<GenerateReport | null>(null);
  const [practiceReport, setPracticeReport] = useState<PracticeReport | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RepurposeSuggestion[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const slot = useMemo(() => new Map(season.slots.map((s) => [s.id, s])), [season]);
  const name = useMemo(() => new Map(season.teams.map((t) => [t.id, t.name])), [season]);

  /**
   * Teams in the chosen division, and nothing else. Offering all sixteen
   * teams after picking 8U is a list of fourteen wrong answers.
   */
  const teamsForDiv = useMemo(
    () => season.teams.filter((t) => div === 'all' || t.divisionId === div),
    [season, div]);

  /** Changing the division drops a team filter that no longer belongs to it. */
  function pickDivision(next: string) {
    setDiv(next);
    if (team !== 'all' && next !== 'all'
      && !season.teams.some((t) => t.id === team && t.divisionId === next)) setTeam('all');
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const taken = new Map<string, number>();

    for (const g of season.games) {
      const w = gameWhen(g, slot);
      if (!w) continue;
      if (g.slotId) taken.set(g.slotId, (taken.get(g.slotId) ?? 0) + 1);
      out.push({
        key: `g:${g.id}`, kind: 'game', date: w.date, start: w.start, rink: w.rink,
        minutes: w.minutes, divisionId: g.divisionId,
        teamIds: [g.homeTeamId, g.awayTeamId].filter(Boolean) as string[],
        away: w.away, game: g, slot: g.slotId ? slot.get(g.slotId) : undefined,
      });
    }

    for (const p of season.practices) {
      const s = slot.get(p.slotId);
      if (!s) continue;
      taken.set(s.id, (taken.get(s.id) ?? 0) + 1);
      out.push({
        key: `p:${p.id}`, kind: p.kind === 'evaluation' ? 'evaluation' : 'practice',
        date: s.date, start: s.start, rink: s.rink, minutes: s.minutes,
        divisionId: p.divisionId, teamIds: p.teamIds, away: false, practice: p, slot: s,
      });
    }

    for (const s of season.slots) {
      if (taken.has(s.id) || s.use === 'unused') continue;
      out.push({
        key: `f:${s.id}`, kind: 'free', date: s.date, start: s.start, rink: s.rink,
        minutes: s.minutes, divisionId: s.ownerDivisionId ?? '', teamIds: [], away: false, slot: s,
      });
    }

    return out.sort((a, b) =>
      (a.date + a.start + a.rink).localeCompare(b.date + b.start + b.rink));
  }, [season, slot]);

  const shown = rows
    .filter((r) => (show === 'all' ? true : show === 'booked' ? r.kind !== 'free' : r.kind === show))
    .filter((r) => div === 'all' || r.divisionId === div)
    // Free ice belongs to nobody, so a team filter hides it rather than
    // pretending the slot is that team's.
    .filter((r) => team === 'all' || r.teamIds.includes(team));

  /**
   * Evaluations are the first thing a division does, and everything else
   * waits on them, so where they sit is worth showing rather than leaving
   * someone to work it out from the rows.
   */
  const evals = useMemo(() => evaluationStatus(season), [season]);
  const ready = useMemo(() => evaluationReadiness(season), [season]);
  // Only worth a panel once a division asks for evaluations, or has some.
  const showEvals = evals.some((e) => e.wanted > 0 || e.dates.length > 0);

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { game: 0, practice: 0, evaluation: 0, free: 0 };
    for (const r of rows) c[r.kind]++;
    return c;
  }, [rows]);

  function run() {
    setBusy(true);
    // let the button paint before the engine blocks the thread
    setTimeout(() => {
      try {
        const { games, report: r } = generateSchedule(season, manifest, { seed });
        const withGames = { ...season, games };
        const { practices, report: pr } = assignPractices(withGames, manifest);
        setReport(r);
        setPracticeReport(pr);
        // Proposals only. Nothing is repurposed until the button below is pressed.
        const all = [...r.suggestions, ...pr.suggestions]
          .filter((s2, i, list) => list.findIndex((x) => x.slotId === s2.slotId) === i);
        setSuggestions(all);
        setPicked(new Set(all.map((s2) => s2.slotId)));
        onChange({ ...withGames, practices });
      } finally { setBusy(false); }
    }, 16);
  }

  return (
    <>
      <h2>Schedule</h2>
      <p className="lede">
        Generating replaces every game and practice in this season. The same seed always produces
        the same schedule, so change the seed to see a different one. Games that are locked, away
        or part of a bracket stay where they are.
      </p>

      <div className="row">
        <div className="field">
          <label htmlFor="seed">Seed</label>
          <input id="seed" type="number" value={seed} style={{ width: 120 }}
            onChange={(e) => setSeed(+e.target.value)} />
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button className="btn go" onClick={run} disabled={busy}>
            {busy ? 'Working…' : season.games.length ? 'Generate again' : 'Generate schedule'}
          </button>
        </div>
        <div className="field">
          <label htmlFor="show">Show</label>
          <select id="show" value={show} onChange={(e) => setShow(e.target.value as Kind)}>
            {SHOW.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="d">Division</label>
          <select id="d" value={div} onChange={(e) => pickDivision(e.target.value)}>
            <option value="all">All divisions</option>
            {season.divisions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t">Team</label>
          <select id="t" value={team} onChange={(e) => setTeam(e.target.value)}
            disabled={!teamsForDiv.length}>
            <option value="all">{div === 'all' ? 'All teams' : `All ${div} teams`}</option>
            {teamsForDiv.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div className="field"><label>&nbsp;</label><span className="muted">{shown.length} shown</span></div>
      </div>

      <p className="muted" style={{ margin: '-6px 0 16px' }}>
        {counts.game} games · {counts.practice} practices · {counts.evaluation} evaluations ·{' '}
        <strong className={counts.free ? 'flag wrn' : ''}>{counts.free} slots with nothing on them</strong>
      </p>

      {report && (
        <div className="panel">
          <h3>Last run</h3>
          <table>
            <tbody>
              {report.byDivision.map((d) => {
                const p = practiceReport?.byDivision.find((x) => x.divisionId === d.divisionId);
                return (
                  <tr key={d.divisionId}>
                    <td style={{ width: 140 }}><span className="chip div">{d.divisionId}</span></td>
                    <td>
                      {d.placed} of {d.fixtures} games placed at {d.gamesPerTeam} per team
                      {p && p.target > 0 && (
                        <>
                          {' · '}
                          <span className={p.min < p.target ? 'flag wrn' : ''}>
                            {p.min === p.max ? `${p.min}` : `${p.min}-${p.max}`} of {p.target} practices
                          </span>
                          {p.patterns.length ? ` on ${p.patterns.join(', ')}` : ''}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {report.unplaced.length > 0 && (
                <tr><td colSpan={2}>
                  <span className="flag err">{report.unplaced.length} games could not be placed.</span>{' '}
                  {report.unplaced.slice(0, 3).map((u) => `${u.homeId} v ${u.awayId}`).join('; ')}
                  {report.unplaced.length > 3 ? ' …' : ''}
                  {' '}Free up ice or relax a blackout date.
                </td></tr>
              )}
              <tr><td>Longest repeat run</td><td>{report.longestRepeatRun} — a team meeting the same
                opponent this many times in a row</td></tr>
              {report.crossGames > 0 && (
                <tr><td>Crossover games</td><td>
                  {report.crossGames} against another division
                  {report.crossShort.length > 0 && (
                    <> — <span className="flag wrn">
                      {report.crossShort.length} team{report.crossShort.length === 1 ? '' : 's'} got
                      fewer than asked for; the divisions are different sizes
                    </span></>
                  )}
                </td></tr>
              )}
              {report.busyWeeks.total > 0 && (
                <tr><td>Two games in a week</td><td>
                  {report.busyWeeks.total} team-week{report.busyWeeks.total === 1 ? '' : 's'},
                  no team more than {report.busyWeeks.worstTeam}
                  {Object.keys(report.busyWeeks.byMonth).length > 0 && (
                    <> — {Object.entries(report.busyWeeks.byMonth).sort()
                      .map(([mo, n]) => `${mo} ${n}`).join(', ')}</>
                  )}
                </td></tr>
              )}
              {report.ownerFirst > 0 && (
                <tr><td>Reserved ice</td><td>
                  {report.ownerFirst} games went to the division the slot is held for
                  {report.ownerReleased > 0
                    ? `, and ${report.ownerReleased} slots opened up once that division had its games`
                    : ''}
                </td></tr>
              )}
              {practiceReport && (
                <tr><td>Practices</td><td>
                  {practiceReport.practices} booked, {practiceReport.evaluations} evaluations
                  {practiceReport.unusedPracticeSlots > 0
                    ? `, ${practiceReport.unusedPracticeSlots} practice slots left over` : ''}
                </td></tr>
              )}
              {report.kept + report.keptPlayoff > 0 && (
                <tr><td>Left alone</td><td>
                  {report.kept > 0 && `${report.kept} away or locked games`}
                  {report.kept > 0 && report.keptPlayoff > 0 && ', '}
                  {report.keptPlayoff > 0 && `${report.keptPlayoff} bracket games`}
                  {' kept exactly where they were'}
                </td></tr>
              )}
              {practiceReport?.issues.map((t, i) => (
                <tr key={`pi${i}`}><td /><td><span className="flag wrn">{t}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showEvals && (
        <div className="panel">
          <div className="editor-head">
            <h3>Evaluations</h3>
            <span className={ready.fulfilled ? 'flag ok' : 'flag wrn'}>
              {ready.percent}% ready — {ready.ready} of {ready.total} division
              {ready.total === 1 ? '' : 's'}
            </span>
          </div>
          <p className="lede" style={{ marginBottom: 12 }}>
            Evaluations come first. A division plays nothing — no game, no practice — until its
            last session is done, so these dates set when each level's season can start. A
            division is ready when it has the sessions it asked for and nothing is scheduled
            before them. Set how many each level needs on Setup; zero means it does not run them.
          </p>
          <table>
            <thead>
              <tr><th>Division</th><th>Ready</th><th>When</th>
                <th>Plays from</th><th className="num">Sheets</th></tr>
            </thead>
            <tbody>
              {evals.filter((e) => e.wanted > 0 || e.dates.length > 0).map((e) => (
                <tr key={e.divisionId}>
                  <td><span className="chip div">{e.divisionId}</span></td>
                  <td>
                    {e.fulfilled
                      ? <span className="flag ok">Ready</span>
                      : <span className="flag wrn">{e.blockers.join('; ')}</span>}
                  </td>
                  <td>{e.dates.length
                    ? e.dates.map((d) => `${fmtDate(d)} (${fmtDay(d)})`).join(', ')
                    : <span className="muted">—</span>}</td>
                  <td>{e.playsFrom
                    ? <>{fmtDate(e.playsFrom)}</>
                    : <span className="muted">anytime</span>}</td>
                  <td className="num muted">{e.booked} of {e.wanted || e.booked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="panel" style={{ borderLeft: '3px solid var(--warn)' }}>
          <h3>Ice that could fill the gaps</h3>
          <p className="lede" style={{ marginBottom: 12 }}>
            Nothing here has been changed. These are slots that could be used for something other
            than what they were booked as, cheapest first — out-of-play ice before empty ice,
            empty ice before ice somebody is on. Untick anything you want left alone.
          </p>
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th /><th>Date</th><th>Day</th><th>Time</th><th>Rink</th>
                  <th>Booked as</th><th>Would become</th><th>Why this one</th></tr>
              </thead>
              <tbody>
                {suggestions.map((s2) => (
                  <tr key={s2.slotId}>
                    <td>
                      <input type="checkbox" checked={picked.has(s2.slotId)}
                        aria-label={`use ${s2.date} ${s2.start} for ${s2.to}`}
                        onChange={(e) => setPicked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(s2.slotId); else next.delete(s2.slotId);
                          return next;
                        })} />
                    </td>
                    <td>{fmtDate(s2.date)}</td>
                    <td className="muted">{fmtDay(s2.date)}</td>
                    <td>{s2.start}</td>
                    <td>{s2.rink}</td>
                    <td className="muted">{s2.from}</td>
                    <td><strong>{s2.to}</strong>{s2.divisionId
                      ? <span className="chip div" style={{ marginLeft: 6 }}>{s2.divisionId}</span> : null}</td>
                    <td className="muted">{s2.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="btn go" disabled={!picked.size} onClick={() => {
              const take = suggestions.filter((s2) => picked.has(s2.slotId));
              onChange(applySuggestions(season, take,
                'Repurposed to fill a gap in the schedule'));
              setSuggestions([]);
              setPicked(new Set());
            }}>
              Use {picked.size} slot{picked.size === 1 ? '' : 's'} this way
            </button>
            <button className="btn line" onClick={() => { setSuggestions([]); setPicked(new Set()); }}>
              Leave the ice as it is
            </button>
            <span className="muted">Then generate again to fill them.</span>
          </div>
        </div>
      )}

      {editing && (() => {
        const g = season.games.find((x) => x.id === editing);
        return g ? (
          <GameEditor season={season} manifest={manifest} game={g}
            onApply={onChange} onClose={() => setEditing(null)} />
        ) : null;
      })()}

      {shown.length === 0 ? (
        <div className="empty">
          <p>{rows.length
            ? 'Nothing matches those filters. Widen Show, or pick a different division.'
            : 'No ice booked yet. Import a Finnly export on Ice, then generate.'}</p>
        </div>
      ) : (
        <div className="scroll-x"><table className={fresh ? 'fresh' : ''}>
          <thead>
            <tr><th className="num">#</th><th>Date</th><th>Day</th><th>Time</th><th>Rink</th>
              <th>What</th><th>Division</th><th>Who</th><th /></tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.key} className={editing === r.game?.id ? 'is-current' : ''}>
                <td className="num muted">{i + 1}</td>
                <td>{fmtDate(r.date)}</td>
                <td className="muted">{fmtDay(r.date)}</td>
                <td>{r.start}</td>
                <td>
                  {r.rink}
                  {r.away && <span className="chip away" title="Played at another rink">away</span>}
                  {r.game?.locked && <span className="chip lock" title="The generator will not move this">locked</span>}
                </td>
                <td><Kind row={r} /></td>
                <td>
                  {r.divisionId
                    ? <span className="chip div">{r.divisionId}</span>
                    : <span className="muted">—</span>}
                </td>
                <td>{who(r, name)}</td>
                <td>
                  {r.game && (
                    <button className="btn line" onClick={() => setEditing(r.game!.id)}>Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}

function Kind({ row }: { row: Row }) {
  if (row.kind === 'game') {
    const t = row.game?.type ?? 'regular';
    return t === 'regular'
      ? <span className="chip kind game">Game</span>
      : <span className="chip kind po">{t}</span>;
  }
  if (row.kind === 'practice') return <span className="chip kind prac">Practice</span>;
  if (row.kind === 'evaluation') return <span className="chip kind eval">Evaluation</span>;
  return <span className="chip kind free">Free</span>;
}

function who(r: Row, name: Map<string, string>) {
  if (r.kind === 'game') {
    const h = r.game!.homeTeamId ? name.get(r.game!.homeTeamId) ?? r.game!.homeTeamId : r.game!.homeLabel;
    const a = r.game!.awayTeamId ? name.get(r.game!.awayTeamId) ?? r.game!.awayTeamId : r.game!.awayLabel;
    return <>{h} <span className="muted">v</span> {a}</>;
  }
  if (r.kind === 'free') {
    const s = r.slot!;
    if (s.ownerDivisionId) {
      return (
        <span className="muted">
          held for {s.ownerDivisionId}
          {s.ownerPolicy === 'priority' ? ', releases when they are done' : ', reserved'}
        </span>
      );
    }
    return <span className="muted">{s.use === 'game' ? 'game ice, nothing on it' : `${s.use} ice, nothing on it`}</span>;
  }
  if (!r.teamIds.length) return <span className="flag wrn">nobody assigned</span>;
  return <>{r.teamIds.map((t) => name.get(t) ?? t).join(', ')}</>;
}
