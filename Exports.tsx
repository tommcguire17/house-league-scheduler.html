import type { Season, LeagueManifest } from '@league/core';
import { repurposedSlots } from '@league/core';
import {
  exportSportNinja, exportScheduleCsv, exportUnusedIceCsv, exportChangesCsv,
  exportIceDifferencesCsv, publicPage, saveSeason, unusedIceSummary,
} from '@league/io';
import { download } from '../lib/files';

export function Exports({ season, manifest }: { season: Season; manifest: LeagueManifest }) {
  const placed = season.games.filter((g) => g.slotId || g.away).length;
  const free = unusedIceSummary(season);
  const stem = season.id;
  const get = (suffix: string, body: string, type: string) =>
    () => download(`${stem}-${suffix}`, body, type);

  const schedule = get('schedule.csv', exportScheduleCsv(season), 'text/csv');
  const sportninja = get('sportninja.csv',
    exportSportNinja(season, { venue: season.venue, city: season.city }), 'text/csv');
  const unused = get('unused-ice.csv', exportUnusedIceCsv(season), 'text/csv');
  const changelog = get('changes.csv', exportChangesCsv(season), 'text/csv');
  const page = get('schedule.html', publicPage(season, manifest), 'text/html');
  const json = get(`${''}season.json`, saveSeason(season), 'application/json');
  const moved = repurposedSlots(season);
  const differences = get('ice-differences.csv', exportIceDifferencesCsv(season), 'text/csv');



  return (
    <>
      <h2>Export</h2>
      <p className="lede">
        Files download to this computer. The season file never carries player names or contact
        details unless you ask for them.
      </p>

      <div className="panel">
        <h3>Schedule for people</h3>
        <p className="lede" style={{ marginBottom: 12 }}>
          {placed} games, in date order, with day names. The one to send coaches.
        </p>
        <button className="btn line" onClick={schedule} disabled={!placed}>Download schedule CSV</button>
      </div>

      <div className="panel">
        <h3>Schedule for SportNinja</h3>
        <p className="lede" style={{ marginBottom: 12 }}>
          The exact column order and date format SportNinja's importer expects. Upload a few rows
          as a test before the whole file.
        </p>
        <button className="btn line" onClick={sportninja} disabled={!placed}>Download SportNinja CSV</button>
      </div>

      <div className="panel">
        <h3>Ice you are not using</h3>
        <p className="lede" style={{ marginBottom: 12 }}>
          {free.slots} slots, {free.hours.toFixed(1)} hours. Release it or sell it.
        </p>
        <button className="btn line" onClick={unused} disabled={!free.slots}>Download unused ice CSV</button>
      </div>

      <div className="panel">
        <h3>Ice used differently from how it was booked</h3>
        <p className="lede" style={{ marginBottom: 12 }}>
          {moved.length
            ? `${moved.length} slot${moved.length === 1 ? '' : 's'} where the booking and the `
              + 'schedule disagree — a game sheet running an evaluation, say. Send this to '
              + 'whoever keeps the booking system so the front desk is not surprised.'
            : 'Nothing is being used for anything other than what it was booked as.'}
        </p>
        <button className="btn line" onClick={differences} disabled={!moved.length}>
          Download ice differences CSV
        </button>
      </div>

      <div className="panel">
        <h3>Schedule for families</h3>
        <p className="lede" style={{ marginBottom: 12 }}>
          One web page with the schedule, results, standings and every change so far.
          It filters by team and prints cleanly. No player names, nothing loaded from
          anywhere else, so it is safe to post publicly.
        </p>
        <button className="btn line" onClick={page} disabled={!placed}>Download schedule page</button>
      </div>

      <div className="panel">
        <h3>Change log</h3>
        <p className="lede" style={{ marginBottom: 12 }}>
          {season.changes.length
            ? `${season.changes.length} ${season.changes.length === 1 ? 'game has' : 'games have'} moved, with the reason recorded.`
            : 'Nothing has moved yet. Moves made in the schedule editor are recorded here.'}
        </p>
        <button className="btn line" onClick={changelog} disabled={!season.changes.length}>
          Download change log CSV
        </button>
      </div>

      <div className="panel">
        <h3>Season file</h3>
        <p className="lede" style={{ marginBottom: 12 }}>
          Everything above plus the rules, so you can reopen exactly this state later.
        </p>
        <button className="btn line" onClick={json}>Download season JSON</button>
      </div>
    </>
  );
}
