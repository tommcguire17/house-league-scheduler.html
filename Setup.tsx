import type { Season, LeagueManifest, IceFormat } from '@league/core';
import { Division, MANIFESTS } from '@league/core';
import { importBlackouts } from '@league/io';
import { readFile } from '../lib/files';

/** The season's own settings: who it is, when it runs, and its divisions. */
export function Setup(
  { season, manifest, onChange }:
  { season: Season; manifest: LeagueManifest; onChange: (s: Season) => void },
) {
  const set = (patch: Partial<Season>) => onChange({ ...season, ...patch });

  const setDivision = (id: string, patch: Partial<Division>) =>
    set({ divisions: season.divisions.map((d) => (d.id === id ? { ...d, ...patch } : d)) });

  /**
   * Crossover is a relationship, so it is written on both divisions. Setting
   * it one-way would read as done while only half the pair knew about it.
   */
  const toggleCrossover = (aId: string, bId: string) => {
    const a = season.divisions.find((d) => d.id === aId);
    const on = !!a && !a.playsAcross.includes(bId);
    set({
      divisions: season.divisions.map((d) => {
        if (d.id !== aId && d.id !== bId) return d;
        const other = d.id === aId ? bId : aId;
        const next = on
          ? [...new Set([...d.playsAcross, other])]
          : d.playsAcross.filter((x) => x !== other);
        // Turning the last partner off turns the count off with it.
        return { ...d, playsAcross: next, crossGamesPerTeam: next.length ? d.crossGamesPerTeam : 0 };
      }),
    });
  };

  const addDivision = () => {
    let n = season.divisions.length + 1;
    while (season.divisions.some((d) => d.id === `D${n}`)) n++;
    set({ divisions: [...season.divisions, Division.parse({ id: `D${n}`, name: `Division ${n}` })] });
  };

  const removeDivision = (id: string) => {
    const teams = season.teams.filter((t) => t.divisionId === id);
    if (teams.length && !confirm(
      `${teams.length} teams are in this division. Remove it and them?`)) return;
    set({
      divisions: season.divisions.filter((d) => d.id !== id),
      teams: season.teams.filter((t) => t.divisionId !== id),
      games: season.games.filter((g) => g.divisionId !== id),
      practices: season.practices.filter((p) => p.divisionId !== id),
    });
  };

  async function importBlackoutCsv() {
    const f = await readFile('.csv,text/csv');
    if (!f) return;
    try {
      const { dates } = importBlackouts(f.text);
      set({ blackoutDates: [...new Set([...season.blackoutDates, ...dates])].sort() });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <h2>Setup</h2>
      <p className="lede">
        The season's name, dates and divisions. Rules come from the league and are shown on
        Overview.
      </p>

      <div className="panel" style={{ maxWidth: 620 }}>
        <h3>This season</h3>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="sn">Name</label>
          <input id="sn" type="text" defaultValue={season.name}
            onBlur={(e) => set({ name: e.target.value.trim() || season.name })} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="sl">League</label>
            <select id="sl" value={season.leagueId} onChange={(e) => set({ leagueId: e.target.value })}>
              {Object.values(MANIFESTS).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s1">First day</label>
            <input id="s1" type="date" defaultValue={season.startDate}
              onBlur={(e) => e.target.value && set({ startDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s2">Last day</label>
            <input id="s2" type="date" defaultValue={season.endDate}
              onBlur={(e) => e.target.value && set({ endDate: e.target.value })} />
          </div>
        </div>
        <div className="row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="s3">Venue</label>
            <input id="s3" type="text" defaultValue={season.venue}
              onBlur={(e) => set({ venue: e.target.value.trim() })} />
          </div>
          <div className="field">
            <label htmlFor="s4">City</label>
            <input id="s4" type="text" defaultValue={season.city}
              onBlur={(e) => set({ city: e.target.value.trim() })} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Divisions</h3>
        <p className="lede" style={{ marginBottom: 10 }}>
          Leave a target blank to use the league default
          ({manifest.scheduling.defaultGamesPerTeam} games
          {manifest.capabilities.practices
            ? `, ${manifest.scheduling.defaultPracticesPerTeam} practices` : ''}).
        </p>
        {season.divisions.length === 0 ? (
          <p className="lede">No divisions yet. Add one, or import a team list on the Teams tab —
            divisions are created from it automatically.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th className="num">Teams</th><th className="num">Games each</th>
                {manifest.capabilities.practices && <th className="num">Practices each</th>}
                <th className="num" title="Sessions this level needs before it plays. Zero means it does not run evaluations; tick it up when signups need more than one sheet.">
                  Evaluations
                </th>
                <th title="How this level splits a sheet. Every team in the division plays the same way.">
                  Ice format
                </th>
                <th title="Divisions this one may also play, and how many of its games are against them. Both divisions must split the ice the same way.">
                  Crosses over with
                </th>
                <th className="num">Playoff teams</th><th /></tr>
            </thead>
            <tbody>
              {season.divisions.map((d) => (
                <tr key={d.id}>
                  <td>
                    <input type="text" defaultValue={d.name} style={{ width: 160 }}
                      onBlur={(e) => setDivision(d.id, { name: e.target.value.trim() || d.name })} />
                  </td>
                  <td className="num">{season.teams.filter((t) => t.divisionId === d.id).length}</td>
                  <td className="num">
                    <input type="number" min={0} className="score" value={d.gamesPerTeam ?? ''}
                      placeholder={String(manifest.scheduling.defaultGamesPerTeam)}
                      onChange={(e) => setDivision(d.id, {
                        gamesPerTeam: e.target.value === '' ? null : Math.max(0, +e.target.value) })} />
                  </td>
                  {manifest.capabilities.practices && (
                    <td className="num">
                      <input type="number" min={0} className="score" value={d.practicesPerTeam ?? ''}
                        placeholder={String(manifest.scheduling.defaultPracticesPerTeam)}
                        onChange={(e) => setDivision(d.id, {
                          practicesPerTeam: e.target.value === '' ? null : Math.max(0, +e.target.value) })} />
                    </td>
                  )}
                  <td className="num">
                    <input type="number" min={0} max={6} step={1} className="score"
                      value={d.evaluationSessions} aria-label={`${d.name} evaluation sessions`}
                      onChange={(e) => setDivision(d.id, {
                        evaluationSessions: Math.max(0, Math.min(6, +e.target.value)) })} />
                  </td>
                  <td>
                    <select value={d.iceFormat} aria-label={`${d.name} ice format`}
                      onChange={(e) => setDivision(d.id, { iceFormat: e.target.value as IceFormat })}>
                      <option value="full">Full ice — 1 game</option>
                      <option value="half">Half ice — 2 games</option>
                      <option value="cross">Cross ice — 3 games</option>
                    </select>
                  </td>
                  <td>
                    <div className="crossers">
                      {season.divisions.filter((x) => x.id !== d.id).map((x) => {
                        const on = d.playsAcross.includes(x.id);
                        const clash = x.iceFormat !== d.iceFormat;
                        return (
                          <button key={x.id} type="button" className="pill cross"
                            aria-pressed={on} disabled={clash}
                            title={clash
                              ? `${x.name} plays ${x.iceFormat} ice and ${d.name} plays ${d.iceFormat} ice`
                              : `${d.name} and ${x.name} may play each other`}
                            onClick={() => toggleCrossover(d.id, x.id)}>
                            {x.name}
                          </button>
                        );
                      })}
                      {season.divisions.length < 2 && <span className="muted">—</span>}
                    </div>
                    {d.playsAcross.length > 0 && (
                      <label className="crossnum">
                        <input type="number" min={0} max={d.gamesPerTeam
                          ?? manifest.scheduling.defaultGamesPerTeam}
                          className="score" value={d.crossGamesPerTeam}
                          aria-label={`${d.name} crossover games`}
                          onChange={(e) => setDivision(d.id, {
                            crossGamesPerTeam: Math.max(0, +e.target.value) })} />
                        <span className="muted">of its games</span>
                      </label>
                    )}
                  </td>
                  <td className="num">
                    <input type="number" min={0} className="score" value={d.playoffTeams}
                      onChange={(e) => setDivision(d.id, { playoffTeams: Math.max(0, +e.target.value) })} />
                  </td>
                  <td>
                    <button className="btn line" onClick={() => removeDivision(d.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
          <button className="btn line" onClick={addDivision}>Add division</button>
        </div>
      </div>

      <div className="panel">
        <h3>League blackout dates</h3>
        <p className="lede" style={{ marginBottom: 10 }}>
          Dates nobody plays: school breaks, holidays. The generator works around them.
          Comma separated, YYYY-MM-DD.
        </p>
        <input type="text" style={{ width: '100%', maxWidth: 680 }}
          placeholder="2026-12-24, 2026-12-25"
          defaultValue={season.blackoutDates.join(', ')}
          onBlur={(e) => set({
            blackoutDates: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).sort() })} />
        <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
          <button className="btn line" onClick={importBlackoutCsv}>Import blackout dates from CSV</button>
        </div>
      </div>
    </>
  );
}
