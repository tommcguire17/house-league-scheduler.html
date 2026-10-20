import type { Season, ValidationResult } from '@league/core';
import { summarize } from '@league/core';

export function Checks({ season, result }: { season: Season; result: ValidationResult }) {
  const errors = result.violations.filter((v) => v.severity === 'error');
  const warnings = result.violations.filter((v) => v.severity === 'warning');

  return (
    <>
      <h2>{result.errorCount === 0 ? 'Nothing is broken' : `${result.errorCount} problems to fix`}</h2>
      <p className="lede">
        {result.errorCount === 0
          ? `Every rule in this league's manifest holds. ${result.warningCount} warnings are worth a look but will not stop you publishing.`
          : 'Errors break a rule the league has set. Fix these before the schedule goes out.'}
      </p>

      <div className="panel">
        <h3>Per team</h3>
        <table>
          <thead>
            <tr>
              <th>Team</th><th>Division</th><th className="num">Games</th><th className="num">Practices</th>
              <th className="num">Morning</th><th className="num">Midday</th><th className="num">Evening</th>
              <th className="num">Run</th><th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {result.teams.map((t) => (
              <tr key={t.teamId}>
                <td>{t.teamName}</td>
                <td><span className="chip div">{t.divisionId}</span></td>
                <td className="num">
                  <span className={t.games === t.gamesTarget ? '' : 'flag wrn'}>
                    {t.games}/{t.gamesTarget}
                  </span>
                </td>
                <td className="num">
                  {t.practicesTarget === 0 && t.practices === 0
                    ? <span className="muted">—</span>
                    : <span className={t.practices === t.practicesTarget ? '' : 'flag wrn'}>
                        {t.practices}/{t.practicesTarget}</span>}
                </td>
                <td className="num">{t.bands.morning}</td>
                <td className="num">{t.bands.midday}</td>
                <td className="num">{t.bands.evening}</td>
                <td className="num">{t.longestRepeatRun > 2
                  ? <span className="flag wrn">{t.longestRepeatRun}</span> : t.longestRepeatRun}</td>
                <td>{flagFor(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>By rule</h3>
        <table>
          <thead><tr><th>Rule</th><th>Severity</th><th className="num">Count</th></tr></thead>
          <tbody>
            {summarize(result).map((s) => (
              <tr key={s.code}>
                <td>{humanise(s.code)}</td>
                <td><span className={`flag ${s.severity === 'error' ? 'err' : 'wrn'}`}>{s.severity}</span></td>
                <td className="num">{s.count}</td>
              </tr>
            ))}
            {result.violations.length === 0 && (
              <tr><td colSpan={3} className="muted">Nothing to report.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {[['Errors', errors], ['Warnings', warnings]].map(([title, list]) => {
        const items = list as typeof errors;
        if (!items.length) return null;
        return (
          <div className="panel" key={title as string}>
            <h3>{title as string}</h3>
            <table>
              <tbody>
                {items.slice(0, 60).map((v, i) => (
                  <tr key={i}>
                    <td style={{ width: 210 }} className="muted">{humanise(v.code)}</td>
                    <td>{v.message}</td>
                  </tr>
                ))}
                {items.length > 60 && (
                  <tr><td colSpan={2} className="muted">and {items.length - 60} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}

      <p className="muted" style={{ fontSize: 12 }}>
        Checked against {season.slots.length} slots and {season.games.length} games.
      </p>
    </>
  );
}

function flagFor(t: ValidationResult['teams'][number]) {
  if (t.games > t.gamesTarget) return <span className="flag err">over on games</span>;
  if (t.sameDayGameDates.length) return <span className="flag err">plays twice in a day</span>;
  if (t.gameAndPracticeDates.length) return <span className="flag err">game and practice same day</span>;
  if (t.games < t.gamesTarget) return <span className="flag wrn">short {t.gamesTarget - t.games}</span>;
  if (t.practices < t.practicesTarget) return <span className="flag wrn">short on practices</span>;
  return <span className="flag ok">clean</span>;
}

/** Rule codes are for the engine. People get sentences. */
function humanise(code: string): string {
  const map: Record<string, string> = {
    SAME_DAY_DOUBLEHEADER: 'Two games in one day',
    GAME_AND_PRACTICE_SAME_DAY: 'Game and practice same day',
    SLOT_OVERBOOKED: 'More games than the sheet holds',
    SLOT_SPLIT_BETWEEN_DIVISIONS: 'Two divisions on one sheet',
    GAME_ON_PRACTICE_ICE: 'Game on practice ice',
    GAME_ON_UNUSED_ICE: 'Game on ice out of play',
    OVER_GAME_TARGET: 'Over the game target',
    UNDER_GAME_TARGET: 'Short of the game target',
    OVER_PRACTICE_TARGET: 'Over the practice target',
    UNDER_PRACTICE_TARGET: 'Short of the practice target',
    OVER_WEEKLY_GAMES: 'More games in a week than the league allows',
    CONSECUTIVE_DAYS: 'Back-to-back days',
    REPEAT_OPPONENT_RUN: 'Same opponent several times running',
    BLACKOUT_VIOLATED: 'Team blackout date used',
    LEAGUE_BLACKOUT_VIOLATED: 'League blackout date used',
    TEAM_WEEKDAY_VIOLATED: 'Team playing on a day it cannot',
    LEAGUE_WEEKDAY_BLOCKED: 'League does not play that weekday',
    LEAGUE_WEEKDAY_NOT_ALLOWED: 'Outside the league playing days',
    OUTSIDE_SEASON: 'Outside the season window',
    PLAYOFFS_OVERLAP_REGULAR: 'Playoffs start before the season ends',
    CROSS_DIVISION_GAME: 'Divisions that are not set to cross over',
    CROSSOVER_UNKNOWN_DIVISION: 'Crossover points at a division that is gone',
    CROSSOVER_FORMAT_MISMATCH: 'Crossover between different ice formats',
    CROSSOVER_NO_PARTNER: 'Crossover games with nobody to play',
    CROSSOVER_OVER_TARGET: 'More crossover games than games',
    GAME_DIVISION_MISMATCH: 'Game filed under the wrong division',
    HOUSEHOLD_OVERLOADED: 'One family at the rink too often in a day',
    TIME_BAND_IMBALANCE: 'Uneven share of early and late games',
    CONSERVATION_FAILED: 'Game and team counts do not reconcile',
    DUPLICATE_ID: 'Duplicate id',
    MANIFEST_UNKNOWN: 'Rule not confirmed yet',
    PRACTICES_NOT_SUPPORTED: 'This league has no practices',
    CROSS_ICE_NOT_SUPPORTED: 'This league does not play cross-ice',
    PLAYOFFS_NOT_ALLOWED: 'This league does not run playoffs',
    PLAYOFF_SIZE_UNSUPPORTED: 'Bracket size not supported',
    PLAYOFF_SIZE_EXCEEDS_TEAMS: 'More qualifiers than teams',
    PLAYOFF_BRACKET_MISSING: 'No bracket built yet',
    PLAYOFF_BRACKET_ORPHAN: 'Bracket with nobody qualifying',
    PLAYOFF_NO_ICE: 'Bracket game with no ice',
    PLAYOFF_FEEDER_MISSING: 'Bracket refers to a game that is gone',
    PLAYOFF_ORDER: 'Round played before the round that decides it',
    PLAYOFF_SEEDS_PROVISIONAL: 'Seeds can still move',
  };
  return map[code] ?? code.toLowerCase().replace(/_/g, ' ');
}
