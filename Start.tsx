import { useState } from 'react';
import { Season, MANIFESTS, manifestFor } from '@league/core';
import { loadSeason } from '@league/io';
import { readFile } from '../lib/files';

/** What you see before there is anything to work on. Two ways in, not one. */
export function Start(
  { onOpen, onProblem }: { onOpen: (s: Season, fileName: string) => void; onProblem: (m: string) => void },
) {
  const [mode, setMode] = useState<'choose' | 'new'>('choose');
  const [leagueId, setLeagueId] = useState(Object.keys(MANIFESTS)[0]!);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [venue, setVenue] = useState('Montclair State University Ice Arena');
  const [city, setCity] = useState('Little Falls');

  async function open() {
    const f = await readFile('.json,application/json');
    if (!f) return;
    try {
      const s = loadSeason(f.text);
      manifestFor(s.leagueId);
      onOpen(s, f.name);
    } catch (e) {
      onProblem(describe(e));
    }
  }

  function create() {
    const problems: string[] = [];
    if (!name.trim()) problems.push('Give the season a name.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) problems.push('Start date must be YYYY-MM-DD.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) problems.push('End date must be YYYY-MM-DD.');
    if (start && end && end < start) problems.push('The end date is before the start date.');
    if (problems.length) { onProblem(problems.join(' ')); return; }
    const season = Season.parse({
      id: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'season',
      name: name.trim(), leagueId, startDate: start, endDate: end,
      venue: venue.trim(), city: city.trim(),
      divisions: [], teams: [], slots: [], games: [], practices: [], people: [], changes: [],
    });
    onOpen(season, `${season.id}.season.json`);
  }

  if (mode === 'new') {
    return (
      <>
        <h2>Start a new season</h2>
        <p className="lede">
          This sets the basics. Ice, teams and divisions come next, either from a Finnly export
          or typed in by hand.
        </p>
        <div className="panel" style={{ maxWidth: 560 }}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="lg">League</label>
            <select id="lg" value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
              {Object.values(MANIFESTS).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="nm">Season name</label>
            <input id="nm" type="text" value={name} placeholder="MSU Middle School League 2026-27"
              onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="sd">First day</label>
              <input id="sd" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ed">Last day</label>
              <input id="ed" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="vn">Venue</label>
              <input id="vn" type="text" value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ct">City</label>
              <input id="ct" type="text" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 6, marginBottom: 0 }}>
            <button className="btn go" onClick={create}>Create season</button>
            <button className="btn line" onClick={() => setMode('choose')}>Back</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h2>Start here</h2>
      <p className="lede">
        Everything stays on this computer. Nothing is uploaded, and no account is needed.
      </p>
      <div className="grid2">
        <div className="panel">
          <h3>Open a season you already have</h3>
          <p className="lede">
            A <code>.season.json</code> file saved from this console before.
          </p>
          <button className="btn go" onClick={open}>Open season file</button>
        </div>
        <div className="panel">
          <h3>Start a new season</h3>
          <p className="lede">
            Name it and set the dates, then bring in ice and teams from a Finnly export or add
            them by hand.
          </p>
          <button className="btn go" onClick={() => setMode('new')}>Start a new season</button>
        </div>
      </div>
    </>
  );
}

function describe(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('Unknown league')) return `${msg}`;
  if (msg.startsWith('[')) return `That file is not in the season format. ${msg.slice(0, 300)}`;
  return msg;
}
