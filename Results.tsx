import { useMemo, useState } from 'react';
import type { Season, LeagueManifest } from '@league/core';
import {
  PLAYOFF_TYPES, ROUND_LABELS, codeOfGameId, fmtDate, fmtDay, gameWhen, isPlayed,
  resultProgress, standings,
} from '@league/core';

/** Entering scores, and the standings they produce. */
export function Results(
  { season, manifest, onChange }:
  { season: Season; manifest: LeagueManifest; onChange: (s: Season) => void },
) {
  const [div, setDiv] = useState('all');
  const [only, setOnly] = useState<'all' | 'open'>('all');

  const slot = useMemo(() => new Map(season.slots.map((s) => [s.id, s])), [season]);
  const name = useMemo(() => new Map(season.teams.map((t) => [t.id, t.name])), [season]);
  const table = useMemo(() => standings(season, manifest), [season, manifest]);
  const progress = resultProgress(season);

  const setScore = (id: string, side: 'homeGoals' | 'awayGoals', raw: string) => {
    const v = raw.trim() === '' ? null : Math.max(0, Math.floor(Number(raw)));
    if (v !== null && !Number.isFinite(v)) return;
    onChange({ ...season, games: season.games.map((g) => (g.id === id ? { ...g, [side]: v } : g)) });
  };

  const rows = season.games
    .map((g) => ({ g, w: gameWhen(g, slot) }))
    .filter((x) => x.w)
    .filter((x) => div === 'all' || x.g.divisionId === div)
    .filter((x) => only === 'all' || !isPlayed(x.g))
    .sort((a, b) => (a.w!.date + a.w!.start).localeCompare(b.w!.date + b.w!.start));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <h2>Results</h2>
      <p className="lede">
        {progress.played} of {progress.total} regular-season games have a score.
        Standings below update as you type.
      </p>

      <div className="row">
        <div className="field">
          <label htmlFor="rdiv">Division</label>
          <select id="rdiv" value={div} onChange={(e) => setDiv(e.target.value)}>
            <option value="all">All divisions</option>
            {season.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ronly">Show</label>
          <select id="ronly" value={only} onChange={(e) => setOnly(e.target.value as 'all' | 'open')}>
            <option value="all">Every game</option>
            <option value="open">Still waiting on a score</option>
          </select>
        </div>
        <div className="field"><label>&nbsp;</label><span className="muted">{rows.length} games</span></div>
      </div>

      <div className="scroll-x">
        <table>
          <thead>
            <tr><th>Date</th><th>Day</th><th>Time</th><th>Division</th><th>Home</th>
              <th className="num">Goals</th><th className="num">Goals</th><th>Visitor</th><th>Result</th></tr>
          </thead>
          <tbody>
            {rows.map(({ g, w }) => {
              const played = isPlayed(g);
              const past = w!.date <= today;
              // A bracket game with an unknown side cannot take a score: there
              // is nobody to credit it to, and typing one in would only look
              // like a result.
              const pending = PLAYOFF_TYPES.has(g.type) && !(g.homeTeamId && g.awayTeamId);
              return (
                <tr key={g.id}>
                  <td>{fmtDate(w!.date)}</td>
                  <td className="muted">{fmtDay(w!.date)}</td>
                  <td>{w!.start}</td>
                  <td><span className="chip div">{g.divisionId}</span>
                    {PLAYOFF_TYPES.has(g.type) && (
                      <span className="chip po" title={ROUND_LABELS[g.type]}>
                        {codeOfGameId(g.id).toUpperCase()}</span>
                    )}</td>
                  <td>{name.get(g.homeTeamId ?? '') ?? g.homeLabel}</td>
                  <td className="num">
                    <input type="number" min={0} className="score" value={g.homeGoals ?? ''}
                      disabled={pending} title={pending ? 'Waiting on the round before this one' : undefined}
                      aria-label={`${name.get(g.homeTeamId ?? '') ?? 'home'} goals`}
                      onChange={(e) => setScore(g.id, 'homeGoals', e.target.value)} />
                  </td>
                  <td className="num">
                    <input type="number" min={0} className="score" value={g.awayGoals ?? ''}
                      disabled={pending} title={pending ? 'Waiting on the round before this one' : undefined}
                      aria-label={`${name.get(g.awayTeamId ?? '') ?? 'visitor'} goals`}
                      onChange={(e) => setScore(g.id, 'awayGoals', e.target.value)} />
                  </td>
                  <td>{name.get(g.awayTeamId ?? '') ?? g.awayLabel}</td>
                  <td>{pending ? <span className="muted">bracket</span>
                    : resultOf(g, name, played, past)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {manifest.capabilities.standings && (
        <>
          <h2 style={{ marginTop: 26 }}>Standings</h2>
          {season.divisions.map((d) => {
            const rs = table.filter((r) => r.divisionId === d.id);
            if (!rs.length) return null;
            return (
              <div className="panel" key={d.id}>
                <h3>{d.name}</h3>
                <table>
                  <thead>
                    <tr><th className="num">#</th><th>Team</th><th className="num">GP</th>
                      <th className="num">W</th><th className="num">L</th><th className="num">T</th>
                      <th className="num">Pts</th><th className="num">GF</th><th className="num">GA</th>
                      <th className="num">+/-</th><th>Last 5</th></tr>
                  </thead>
                  <tbody>
                    {rs.map((r) => (
                      <tr key={r.teamId}>
                        <td className="num muted">{r.rank}</td>
                        <td><strong>{r.teamName}</strong></td>
                        <td className="num">{r.played}</td><td className="num">{r.won}</td>
                        <td className="num">{r.lost}</td><td className="num">{r.tied}</td>
                        <td className="num"><strong>{r.points}</strong></td>
                        <td className="num">{r.goalsFor}</td><td className="num">{r.goalsAgainst}</td>
                        <td className="num">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                        <td>{r.form.slice(0, 5).map((f, i) => (
                          <i key={i} className={`form f${f}`}>{f}</i>
                        ))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

function resultOf(
  g: { homeTeamId: string | null; awayTeamId: string | null; homeGoals: number | null; awayGoals: number | null },
  name: Map<string, string>, played: boolean, past: boolean,
) {
  if (!played) {
    return past ? <span className="flag wrn">needs a score</span> : <span className="muted">to come</span>;
  }
  if (g.homeGoals === g.awayGoals) return <span className="muted">tie</span>;
  const winner = g.homeGoals! > g.awayGoals! ? g.homeTeamId : g.awayTeamId;
  return <span className="flag ok">{name.get(winner ?? '') ?? 'winner'}</span>;
}
