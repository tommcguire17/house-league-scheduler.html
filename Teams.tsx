import { useState } from 'react';
import type { Season, Team } from '@league/core';
import { Team as TeamSchema, Division } from '@league/core';
import { importTeams, type ImportIssue } from '@league/io';
import { readFile } from '../lib/files';

export function Teams({ season, onChange }: { season: Season; onChange: (s: Season) => void }) {
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [note, setNote] = useState('');

  const edit = (id: string, patch: Partial<Team>) =>
    onChange({ ...season, teams: season.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const remove = (id: string) => {
    const played = season.games.some((g) => g.homeTeamId === id || g.awayTeamId === id);
    if (played && !confirm('This team has games scheduled. Remove it and them?')) return;
    onChange({
      ...season,
      teams: season.teams.filter((t) => t.id !== id),
      games: season.games.filter((g) => g.homeTeamId !== id && g.awayTeamId !== id),
      practices: season.practices.map((p) => ({ ...p, teamIds: p.teamIds.filter((x) => x !== id) })),
    });
  };

  const add = () => {
    if (!season.divisions.length) {
      setNote('Add a division on the Setup tab first — every team belongs to one.');
      return;
    }
    let n = season.teams.length + 1;
    let id = `team-${n}`;
    while (season.teams.some((t) => t.id === id)) id = `team-${++n}`;
    onChange({
      ...season,
      teams: [...season.teams, TeamSchema.parse({
        id, divisionId: season.divisions[0]!.id, name: `Team ${n}`,
      })],
    });
    setNote('');
  };

  async function importCsv() {
    const f = await readFile('.csv,text/csv');
    if (!f) return;
    try {
      const r = importTeams(f.text);
      const have = new Set(season.teams.map((t) => t.id));
      const fresh = r.teams.filter((t) => !have.has(t.id));
      const haveDiv = new Set(season.divisions.map((d) => d.id));
      const newDivs = r.divisions.filter((d) => !haveDiv.has(d.id))
        .map((d) => Division.parse({ ...d, gamesPerTeam: null, practicesPerTeam: null }));
      onChange({
        ...season,
        divisions: [...season.divisions, ...newDivs],
        teams: [...season.teams, ...fresh],
      });
      setIssues(r.issues);
      setNote(`${f.name}: added ${fresh.length} teams` +
        (newDivs.length ? ` and ${newDivs.length} divisions` : '') +
        (r.teams.length - fresh.length ? `, skipped ${r.teams.length - fresh.length} already here` : '') +
        '. Set the game targets on Setup.');
    } catch (e) {
      setIssues([]);
      setNote(e instanceof Error ? e.message : String(e));
    }
  }

  const setBlackouts = (id: string, raw: string) =>
    edit(id, { blackoutDates: raw.split(',').map((x) => x.trim()).filter(Boolean) });

  return (
    <>
      <h2>Teams</h2>
      <p className="lede">
        {season.teams.length
          ? 'Renaming a team here renames it everywhere, including on exports. Blackout dates are honoured when a schedule is generated, not just reported afterwards.'
          : 'No teams yet. Import a list, or add them one at a time.'}
      </p>

      <div className="row">
        <button className="btn go" onClick={importCsv}>Import teams from CSV</button>
        <button className="btn line" onClick={add}>Add a team</button>
        {season.teams.length > 0 &&
          <div className="field"><label>&nbsp;</label>
            <span className="muted">{season.teams.length} teams</span></div>}
      </div>

      {note && <p className="notice">{note}</p>}
      {issues.length > 0 && (
        <details className="panel" open={issues.length <= 5}>
          <summary><strong>{issues.length} rows needed attention</strong></summary>
          <ul className="problems" style={{ marginTop: 10 }}>
            {issues.slice(0, 40).map((i, k) => <li key={k}>Row {i.row}: {i.message}</li>)}
          </ul>
        </details>
      )}

      {season.teams.length === 0 ? (
        <div className="empty">
          <p>A team list is a CSV with two columns: <strong>Team name</strong> and
            <strong> Division</strong>. Divisions are created from whatever values appear, so you
            do not have to set them up first.</p>
        </div>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr><th>Team</th><th>Division</th><th>Coach</th><th>Blackout dates</th><th /></tr>
            </thead>
            <tbody>
              {season.teams.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input type="text" defaultValue={t.name} style={{ width: 210 }}
                      onBlur={(e) => edit(t.id, { name: e.target.value.trim() || t.name })} />
                  </td>
                  <td>
                    <select value={t.divisionId}
                      onChange={(e) => edit(t.id, { divisionId: e.target.value })}>
                      {season.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="text" defaultValue={t.coach} placeholder="—" style={{ width: 160 }}
                      onBlur={(e) => edit(t.id, { coach: e.target.value.trim() })} />
                  </td>
                  <td>
                    <input type="text" defaultValue={t.blackoutDates.join(', ')} placeholder="none"
                      style={{ width: '100%', minWidth: 220 }}
                      onBlur={(e) => setBlackouts(t.id, e.target.value)} />
                  </td>
                  <td><button className="btn line" onClick={() => remove(t.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
