import type { Season, LeagueManifest, ValidationResult } from '@league/core';
import {
  bracketProgress, fmtDateYear, listDays, playoffGames, readiness, titleCase,
} from '@league/core';
import { weekBars } from '../lib/strip';

export function Overview(
  { season, manifest, result }:
  { season: Season; manifest: LeagueManifest; result: ValidationResult },
) {
  const bars = weekBars(season, manifest.week.startsOn);
  if (!season.slots.length) {
    return (
      <>
        <h2>{season.name}</h2>
        <p className="lede">
          Nothing to show yet. A season needs ice and teams before it can be scheduled.
        </p>
        <div className="empty">
          <p>Start on <strong>Setup</strong> to set the dates and divisions, then
            <strong> Ice</strong> to import a Finnly export or add slots, then
            <strong> Teams</strong>.</p>
        </div>
      </>
    );
  }
  const peak = Math.max(1, ...bars.map((b) => b.slots));
  const ready = readiness(season, manifest, result);
  const bracket = playoffGames(season);
  const champions = season.divisions
    .map((d) => ({ d, champion: bracketProgress(season, d.id).champion }))
    .filter((x) => x.champion);
  const used = season.games.filter((g) => g.slotId).length;
  const booked = season.slots.length;
  const free = booked - new Set(season.games.map((g) => g.slotId)).size;

  return (
    <>
      <h2>{fmtDateYear(season.startDate)} to {fmtDateYear(season.endDate)}</h2>
      <p className="lede">
        {season.teams.length} teams across {season.divisions.length} divisions.
        {' '}{booked} slots booked, {used} games placed, {free} slots still free.
        {bracket.length ? ` ${bracket.length} of those are bracket games.` : ''}
      </p>
      {champions.length > 0 && (
        <p className="notice">
          {champions.map(({ d, champion }, i) => (
            <span key={d.id}>{i ? ' · ' : ''}<strong>{champion}</strong> win {d.name}</span>
          ))}
        </p>
      )}

      <section className="strip" aria-label="Ice booked and used, week by week">
        <div className="track">
          {bars.map((b) => (
            <div className="wk" key={b.week} title={`Week of ${b.week}: ${b.games} of ${b.slots} slots used`}>
              <div className="cap" style={{ height: `${(b.slots / peak) * 100}%` }}>
                <span className={b.games ? 'fill' : 'fill empty'}
                  style={{ height: `${b.slots ? (b.games / b.slots) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="axis">{bars.map((b) => <span key={b.week}>{b.label}</span>)}</div>
        <div className="legend">
          <span><i style={{ background: 'var(--blueline)' }} />Games placed</span>
          <span><i style={{ background: 'var(--shadow)', outline: '1px solid var(--shadow-deep)' }} />Ice booked and free</span>
        </div>
      </section>

      <section className="panel ready">
        <div className="editor-head">
          <h3>Ready to publish</h3>
          <span className={ready.ready ? 'flag ok' : 'flag wrn'}>
            {ready.percent}% — {ready.met} of {ready.total} checks met
          </span>
        </div>
        <div className="bar-track" aria-label={`${ready.percent} percent ready`}>
          <span className={ready.ready ? 'fill ok' : 'fill'} style={{ width: `${ready.percent}%` }} />
        </div>
        <div className="ready-grid">
          {[{ divisionId: '', divisionName: 'Season', criteria: ready.league,
            percent: 0, met: 0, total: 0, ready: false }, ...ready.divisions].map((d) => (
            <div className="ready-col" key={d.divisionName}>
              <h4>{d.divisionName}</h4>
              {d.criteria.map((c) => (
                <div className={`crit${c.met ? ' met' : ''}`} key={c.id} title={c.detail}>
                  <i aria-hidden="true">{c.met ? '✓' : '·'}</i>
                  <span className="k">{c.label}</span>
                  <span className="d">{c.detail}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {!ready.ready && (
          <p className="muted" style={{ margin: '12px 0 0' }}>
            {ready.blockers.length} thing{ready.blockers.length === 1 ? '' : 's'} left:{' '}
            {ready.blockers.slice(0, 3).join(' · ')}
            {ready.blockers.length > 3 ? ' · …' : ''}
          </p>
        )}
      </section>

      <div className="grid3" style={{ marginBottom: 22 }}>
        <div className={`stat${result.errorCount ? ' bad' : ''}`}>
          <div className="v">{result.errorCount}</div>
          <div className="k">{result.errorCount ? 'errors to fix before publishing' : 'errors — safe to publish'}</div>
        </div>
        <div className="stat"><div className="v">{result.warningCount}</div><div className="k">warnings to review</div></div>
        <div className="stat"><div className="v">{free}</div><div className="k">slots you are not using</div></div>
      </div>

      <div className="panel">
        <h3>Divisions</h3>
        <table>
          <thead>
            <tr>
              <th>Division</th><th className="num">Teams</th><th className="num">Target</th>
              <th className="num">Scheduled</th><th className="num">Short</th>
            </tr>
          </thead>
          <tbody>
            {season.divisions.map((d) => {
              const ts = result.teams.filter((t) => t.divisionId === d.id);
              const target = (d.gamesPerTeam ?? manifest.scheduling.defaultGamesPerTeam) * ts.length / 2;
              const got = ts.reduce((n, t) => n + t.games, 0) / 2;
              return (
                <tr key={d.id}>
                  <td><span className="chip div">{d.name}</span></td>
                  <td className="num">{ts.length}</td>
                  <td className="num">{target}</td>
                  <td className="num">{got}</td>
                  <td className="num">
                    {got < target ? <span className="flag wrn">{target - got}</span> : <span className="muted">0</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Rules in force</h3>
        <table>
          <tbody>
            <Rule k="Practices" v={manifest.capabilities.practices ? 'Yes' : 'No'} />
            <Rule k="Week starts" v={titleCase(manifest.week.startsOn)} />
            <Rule k="Plays on" v={manifest.scheduling.onlyWeekdays.length
              ? listDays(manifest.scheduling.onlyWeekdays)
              : manifest.scheduling.blockedWeekdays.length
                ? `Any day except ${listDays(manifest.scheduling.blockedWeekdays)}`
                : 'Any day'} />
            <Rule k="Games per week" v={String(manifest.scheduling.maxGamesPerWeek)} />
            <Rule k="Same-day doubleheaders" v={manifest.scheduling.allowSameDayDoubleheader ? 'Allowed' : 'Not allowed'} />
            <Rule k="Play across divisions" v={manifest.scheduling.interDivisionPlay ? 'Allowed' : 'Not allowed'} />
            <Rule k="Family conflicts" v={manifest.capabilities.familyConstraints ? 'Checked within this league' : 'Not checked'} />
            <Rule k="League blackout dates" v={season.blackoutDates.length
              ? season.blackoutDates.map(fmtDateYear).join(', ') : 'None set'} />
          </tbody>
        </table>
      </div>
    </>
  );
}

const Rule = ({ k, v }: { k: string; v: string }) => (
  <tr><td style={{ width: 220, color: 'var(--ink-soft)' }}>{k}</td><td>{v}</td></tr>
);
