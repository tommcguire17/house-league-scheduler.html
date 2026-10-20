import { useMemo, useState } from 'react';
import type { Season } from '@league/core';
import { manifestFor, resolveBracket, validateSeason } from '@league/core';
import { saveSeason } from '@league/io';
import { download } from './lib/files';
import { Start } from './views/Start';
import { Setup } from './views/Setup';
import { Overview } from './views/Overview';
import { Ice } from './views/Ice';
import { Teams } from './views/Teams';
import { Schedule } from './views/Schedule';
import { Results } from './views/Results';
import { Playoffs } from './views/Playoffs';
import { Checks } from './views/Checks';
import { Exports } from './views/Exports';

const VIEWS = ['Overview', 'Setup', 'Ice', 'Teams', 'Schedule', 'Results', 'Playoffs',
  'Checks', 'Export'] as const;
type View = (typeof VIEWS)[number];

export function App() {
  const [season, setSeason] = useState<Season | null>(null);
  const [view, setView] = useState<View>('Overview');
  const [fileName, setFileName] = useState('season.json');
  const [problem, setProblem] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);

  const manifest = useMemo(() => {
    if (!season) return null;
    try { return manifestFor(season.leagueId); } catch { return null; }
  }, [season]);
  const result = useMemo(
    () => (season && manifest ? validateSeason(season, manifest) : null), [season, manifest]);

  /**
   * Every edit goes through here, so a bracket is always consistent with the
   * results behind it. resolveBracket is pure and returns the same object when
   * nothing moved, so this costs nothing on an edit that is not a result.
   */
  function commit(s: Season) {
    if (!manifest) { setSeason(s); return; }
    setSeason(resolveBracket(s, manifest));
  }

  function start(s: Season, name: string) {
    setSeason(s); setFileName(name); setProblem(null);
    // A brand-new season has nothing to look at, so open where the work starts.
    setView(s.slots.length ? 'Overview' : 'Setup');
  }

  return (
    <div className="app">
      <header className="bar">
        <h1>MSU ARENA</h1>
        {season ? (
          <>
            <span className="season">{season.name}</span>
            <span className="league">{manifest?.name ?? season.leagueId}</span>
          </>
        ) : <span className="season">League operations</span>}
        <span className="spacer" />
        {season && (
          <button className="btn ghost" onClick={() => {
            if (confirm('Close this season? Anything unsaved is lost.')) {
              setSeason(null); setView('Overview');
            }
          }}>Close</button>
        )}
        <button className="btn" onClick={() => season && download(fileName, saveSeason(season),
          'application/json')} disabled={!season}>Save season</button>
      </header>

      <div className="body">
        <aside className="rail">
          <nav>
            {VIEWS.map((v) => (
              <button key={v} aria-current={view === v} disabled={!season}
                onClick={() => setView(v)}>{v}</button>
            ))}
          </nav>
          {result && (
            <div className="status">
              <div className={result.errorCount ? 'err' : 'ok'}>
                <span>Errors</span><span className="n">{result.errorCount}</span>
              </div>
              <div className="wrn"><span>Warnings</span><span className="n">{result.warningCount}</span></div>
              <div className="ok"><span>Games</span><span className="n">{season!.games.length}</span></div>
            </div>
          )}
        </aside>

        <main className="main">
          {problem && (
            <div className="panel" style={{ borderLeft: '3px solid var(--redline)' }}>
              <h3>That did not work</h3>
              <p className="lede" style={{ marginBottom: 0 }}>{problem}</p>
            </div>
          )}

          {!season ? (
            <Start onOpen={start} onProblem={setProblem} />
          ) : !manifest ? (
            <>
              <h2>This season names a league I do not know</h2>
              <p className="lede">
                It asks for <code>{season.leagueId}</code>. Pick a different league on Setup, or add
                a manifest for it in <code>packages/core/src/manifest.ts</code>.
              </p>
            </>
          ) : view === 'Overview' ? (
            <Overview season={season} manifest={manifest} result={result!} />
          ) : view === 'Setup' ? (
            <Setup season={season} manifest={manifest} onChange={setSeason} />
          ) : view === 'Ice' ? (
            <Ice season={season} onChange={setSeason} />
          ) : view === 'Teams' ? (
            <Teams season={season} onChange={setSeason} />
          ) : view === 'Schedule' ? (
            <Schedule season={season} manifest={manifest}
              onChange={(s) => { commit(s); setFresh(true); }} fresh={fresh} />
          ) : view === 'Results' ? (
            <Results season={season} manifest={manifest} onChange={commit} />
          ) : view === 'Playoffs' ? (
            <Playoffs season={season} manifest={manifest} onChange={commit} />
          ) : view === 'Checks' ? (
            <Checks season={season} result={result!} />
          ) : (
            <Exports season={season} manifest={manifest} />
          )}
        </main>
      </div>
    </div>
  );
}
