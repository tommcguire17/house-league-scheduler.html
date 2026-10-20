import { useMemo, useState } from 'react';
import type { Season, LeagueManifest, Game, Division } from '@league/core';
import {
  BRACKET_SIZES, bracketGameCount, bracketProgress, bracketRounds, clearPlayoffs,
  codeOfGameId, fmtDate, fmtDay, gameWhen, isBracketSize, isPlayed, playoffGames,
  resolveBracket, ROUND_LABELS, standings,
} from '@league/core';
import { generatePlayoffs, playoffIceAvailable, type PlayoffReport } from '@league/engine';

/**
 * Brackets.
 *
 * Seeds are live: they come from the standings as they stand, so the bracket
 * is readable the moment a division has a table, and it firms up as the last
 * results go in. Nothing here is hand-typed twice.
 */
export function Playoffs(
  { season, manifest, onChange }:
  { season: Season; manifest: LeagueManifest; onChange: (s: Season) => void },
) {
  const [consolation, setConsolation] = useState(false);
  const [restDays, setRestDays] = useState(0);
  const [report, setReport] = useState<PlayoffReport | null>(null);
  const [busy, setBusy] = useState(false);

  const slot = useMemo(() => new Map(season.slots.map((s) => [s.id, s])), [season]);
  const name = useMemo(() => new Map(season.teams.map((t) => [t.id, t.name])), [season]);
  const table = useMemo(() => standings(season, manifest), [season, manifest]);
  const bracket = playoffGames(season);

  const qualifying = season.divisions.filter((d) => d.playoffTeams > 0);
  const wanted = qualifying.reduce((n, d) =>
    n + (isBracketSize(d.playoffTeams) ? bracketGameCount(d.playoffTeams, consolation) : 0), 0);

  function setDivision(id: string, patch: Partial<Division>) {
    onChange({
      ...season,
      divisions: season.divisions.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
  }

  function build() {
    setBusy(true);
    setTimeout(() => {
      try {
        const { games, report: r } = generatePlayoffs(season, manifest, { consolation, restDays });
        setReport(r);
        onChange({ ...season, games });
      } finally { setBusy(false); }
    }, 16);
  }

  function clear() {
    setReport(null);
    onChange(clearPlayoffs(season));
  }

  if (!manifest.capabilities.playoffs) {
    return (
      <>
        <h2>Playoffs</h2>
        <div className="empty">
          <p><strong>{manifest.name}</strong> does not run playoffs — the regular-season table
            decides it. That is a league rule, held in the league manifest, not a setting on this
            season.</p>
          <p className="muted">To change it, set <code>capabilities.playoffs</code> for{' '}
            <code>{manifest.id}</code> in <code>packages/core/src/manifest.ts</code>.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <h2>Playoffs</h2>
      <p className="lede">
        Pick how many teams qualify in each division and the bracket builds itself, seeded off the
        standings and fitted into the ice left after the regular season. Finals go as late as the
        booked ice allows; every earlier round lands before the round it feeds.
      </p>

      <div className="panel">
        <h3>Who qualifies</h3>
        <table>
          <thead>
            <tr><th>Division</th><th className="num">Teams</th><th>Qualify</th>
              <th className="num">Games</th><th>Ice free after their season</th></tr>
          </thead>
          <tbody>
            {season.divisions.map((d) => {
              const teams = season.teams.filter((t) => t.divisionId === d.id).length;
              const ice = playoffIceAvailable(season, manifest, d.id);
              const slots = ice.reduce((n, x) => n + x.slots, 0);
              const need = isBracketSize(d.playoffTeams)
                ? bracketGameCount(d.playoffTeams, consolation) : 0;
              return (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong></td>
                  <td className="num">{teams}</td>
                  <td>
                    <select value={d.playoffTeams} aria-label={`${d.name} playoff teams`}
                      onChange={(e) => setDivision(d.id, { playoffTeams: +e.target.value })}>
                      <option value={0}>No playoffs</option>
                      {BRACKET_SIZES.filter((n) => n <= Math.max(teams, 2)).map((n) => (
                        <option key={n} value={n}>Top {n}</option>
                      ))}
                    </select>
                  </td>
                  <td className="num">{need || <span className="muted">—</span>}</td>
                  <td className={slots < need ? 'flag wrn' : 'muted'}>
                    {slots} slot{slots === 1 ? '' : 's'} over {ice.length} night
                    {ice.length === 1 ? '' : 's'}
                    {slots < need ? ' — short' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ margin: '10px 0 0' }}>
          Those nights are the same ice: divisions share it, so the counts overlap and the
          totals do not add up. Build the brackets to see what actually fits.
        </p>
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="cons">Third-place game</label>
          <select id="cons" value={consolation ? 'yes' : 'no'}
            onChange={(e) => setConsolation(e.target.value === 'yes')}>
            <option value="no">No — beaten semifinalists are done</option>
            <option value="yes">Yes — losers play for third</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="rest">Rest between rounds</label>
          <select id="rest" value={restDays} onChange={(e) => setRestDays(+e.target.value)}>
            <option value={0}>None — next day is fine</option>
            <option value={1}>1 clear day</option>
            <option value={2}>2 clear days</option>
          </select>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button className="btn go" onClick={build} disabled={busy || !qualifying.length}>
            {busy ? 'Working…' : bracket.length ? 'Rebuild brackets' : 'Build brackets'}
          </button>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button className="btn line" onClick={() => {
            if (confirm('Remove every bracket game? The ice they hold goes back in the pool.')) clear();
          }} disabled={!bracket.length}>Clear brackets</button>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <span className="muted">
            {bracket.length ? `${bracket.length} bracket games` : `${wanted} games to build`}
          </span>
        </div>
      </div>

      {report && (
        <div className="panel">
          <h3>Last run</h3>
          <table>
            <tbody>
              {report.byDivision.map((d) => (
                <tr key={d.divisionId}>
                  <td style={{ width: 170 }}><span className="chip div">{d.divisionId}</span>{' '}
                    top {d.size}</td>
                  <td>
                    <span className={d.placed < d.needed ? 'flag err' : 'flag ok'}>
                      {d.placed} of {d.needed} placed
                    </span>{' '}{d.note}
                  </td>
                </tr>
              ))}
              {report.finalsOn && (
                <tr><td>Finals</td><td>{fmtDate(report.finalsOn)}, {fmtDay(report.finalsOn)}</td></tr>
              )}
              <tr><td>Ice still free</td><td>{report.spareSlots} game slot
                {report.spareSlots === 1 ? '' : 's'} with nothing on {report.spareSlots === 1 ? 'it' : 'them'}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {!bracket.length ? (
        <div className="empty">
          <p>No brackets yet. Set how many teams qualify above, then build.</p>
          <p className="muted">Seeds read straight off the standings, so you can build the bracket
            now and watch it settle as results come in.</p>
        </div>
      ) : season.divisions.filter((d) => bracketRounds(season, d.id).length).map((d) => {
        const rounds = bracketRounds(season, d.id);
        const prog = bracketProgress(season, d.id);
        const seeds = table.filter((r) => r.divisionId === d.id).slice(0, d.playoffTeams);
        return (
          <div className="panel" key={d.id}>
            <div className="editor-head">
              <h3>{d.name}</h3>
              <span className="muted">
                {prog.champion
                  ? <span className="flag ok">{prog.champion} wins it</span>
                  : prog.pendingRegular
                    ? `${prog.pendingRegular} regular-season game${prog.pendingRegular === 1 ? '' : 's'} still to play — seeds can move`
                    : 'seeds final'}
              </span>
            </div>

            {seeds.length > 0 && (
              <p className="muted" style={{ margin: '0 0 10px' }}>
                {seeds.map((r, i) => (
                  <span key={r.teamId}>{i ? ' · ' : ''}<strong>{i + 1}</strong> {r.teamName}</span>
                ))}
              </p>
            )}

            <div className="bracket">
              {rounds.map((round, ri) => (
                <div className="round" key={ri}>
                  <h4>{round.length === 1 || round[0]!.type !== 'final'
                    ? ROUND_LABELS[round[0]!.type] ?? `Round ${ri + 1}`
                    : 'Final'}</h4>
                  {round.map((g) => <Tie key={g.id} game={g} season={season} name={name} slot={slot} />)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** One bracket game: who, when, where, and the score if it has been played. */
function Tie(
  { game: g, name, slot }:
  {
    game: Game; season: Season; name: Map<string, string>;
    slot: Map<string, import('@league/core').Slot>;
  },
) {
  const w = gameWhen(g, slot);
  const played = isPlayed(g) && g.homeTeamId && g.awayTeamId;
  const winner = played && g.homeGoals !== g.awayGoals
    ? (g.homeGoals! > g.awayGoals! ? g.homeTeamId : g.awayTeamId) : null;
  const side = (id: string | null, label: string, goals: number | null) => (
    <div className={`side${id && winner === id ? ' won' : ''}${id ? '' : ' tbd'}`}>
      <span className="who">{id ? name.get(id) ?? id : label}</span>
      <span className="goals">{goals ?? ''}</span>
    </div>
  );
  return (
    <div className="tie">
      <div className="tie-head">
        <span className="code">{codeOfGameId(g.id).toUpperCase()}</span>
        {w ? <span>{fmtDate(w.date)} · {w.start} · {w.rink}</span>
          : <span className="flag err">no ice</span>}
      </div>
      {side(g.homeTeamId, g.homeLabel, g.homeGoals)}
      {side(g.awayTeamId, g.awayLabel, g.awayGoals)}
    </div>
  );
}

/** Re-seeds a season's brackets. Exported so Results can call it on each edit. */
export const reseed = resolveBracket;
