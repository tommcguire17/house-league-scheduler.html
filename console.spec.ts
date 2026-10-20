import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const SEASON = new URL('../../../fixtures/mini.season.json', import.meta.url).pathname;

async function openFixture(page: import('@playwright/test').Page) {
  await page.goto('/');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open season' }).first().click(),
  ]);
  await chooser.setFiles(SEASON);
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
}

test('offers both ways in, not just a file', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Start here' })).toBeVisible();
  // The console used to be unusable without a season file somebody else made.
  await expect(page.getByRole('button', { name: 'Open season file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a new season' })).toBeVisible();
  // navigation is unusable until there is something to navigate
  await expect(page.getByRole('button', { name: 'Schedule', exact: true })).toBeDisabled();
});

test('opens a season and shows what is in it', async ({ page }) => {
  await openFixture(page);
  await expect(page.getByText('Fixture League 2027')).toBeVisible();
  await expect(page.getByText('4 teams across 1 divisions', { exact: false })).toBeVisible();
});

test('every view renders without a console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Script errors are the signal. A blocked font CDN or a missing favicon is
  // the environment, not the app.
  const noise = /favicon|Failed to load resource|ERR_TUNNEL|fonts\.(googleapis|gstatic)/;
  page.on('console', (m) => {
    if (m.type() === 'error' && !noise.test(m.text())) errors.push(m.text());
  });
  await openFixture(page);
  for (const v of ['Ice', 'Teams', 'Schedule', 'Results', 'Playoffs', 'Checks', 'Export', 'Overview']) {
    await page.getByRole('button', { name: v, exact: true }).click();
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('the season strip actually draws bars', async ({ page }) => {
  // This is the regression that shipped once: percentage heights with no basis.
  await openFixture(page);
  const bars = page.locator('.strip .cap');
  await expect(bars.first()).toBeVisible();
  const h = await bars.first().evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThan(10);
});

test('generates a schedule and the counts land', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: /Generate/ }).click();
  await expect(page.getByText(/placed/)).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Checks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nothing is broken' })).toBeVisible();
});

test('offers a real move on a full schedule, by swapping', async ({ page }) => {
  // Every slot in the fixture is taken, so "move" is impossible and the only
  // useful action is a trade. If this regresses the editor becomes a dead end.
  await openFixture(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.locator('.editor')).toBeVisible();
  const swaps = page.getByRole('button', { name: 'Swap' });
  await expect(swaps.first()).toBeEnabled();
  // The schedule table is the last one on the page; panels sit above it.
  const sched = page.locator('table').last();
  const before = await sched.locator('tbody tr').first().textContent();
  await swaps.first().click();
  await expect(page.locator('.editor')).toHaveCount(0);
  expect(await page.locator('table').last().locator('tbody tr').first().textContent())
    .not.toBe(before);
  // and the swap left the season legal
  await page.getByRole('button', { name: 'Checks', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Nothing is broken|problems to fix/ })).toBeVisible();
});

test('records an away game and keeps it out of the ice count', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByRole('button', { name: 'Away at another rink' }).click();
  await page.getByLabel('Rink').fill('Codey Arena');
  await page.getByLabel('Date').fill('2027-01-23');
  await page.getByLabel('Start').fill('18:00');
  await page.getByRole('button', { name: 'Save as an away game' }).click();
  await expect(page.locator('.chip.away').first()).toBeVisible();
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  // the away game freed a slot back up
  await expect(page.getByText(/of them unused/)).toBeVisible();
});

test('works on a phone without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('entering a score fills the standings', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Results', exact: true }).click();
  await expect(page.getByText(/0 of 4 regular-season games/)).toBeVisible();
  const scores = page.locator('input.score');
  await scores.nth(0).fill('5');
  await scores.nth(1).fill('2');
  await expect(page.getByText(/1 of 4 regular-season games/)).toBeVisible();
  // the winner appears in the standings with points
  const standings = page.locator('.panel table').last();
  await expect(standings.getByText('Aces')).toBeVisible();
  await expect(page.locator('i.fW').first()).toBeVisible();
});

test('a move is recorded with a reason', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByLabel('Why it is moving').selectOption('ice-failure');
  await page.getByLabel('Note for the record').fill('Compressor down');
  await page.getByRole('button', { name: 'Swap' }).first().click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByText(/have moved, with the reason recorded|has moved, with the reason recorded/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download change log CSV' })).toBeEnabled();
});

test('the public page downloads and carries no player data', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download schedule page' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.html$/);
  const path = await dl.path();
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(path!, 'utf8');
  expect(html).toContain('Aces');
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).not.toMatch(/<script[^>]+src=/);
});

const ICE_CSV = new URL('../../../fixtures/sample-ice.csv', import.meta.url).pathname;
const TEAMS_CSV = new URL('../../../fixtures/sample-teams.csv', import.meta.url).pathname;

test('builds a whole season from nothing but a Finnly CSV', async ({ page }) => {
  await page.goto('/');

  // 1. start a new season, no file needed
  await page.getByRole('button', { name: 'Start a new season' }).click();
  await page.getByLabel('League').selectOption('middle_school');
  await page.getByLabel('Season name').fill('Test League 2027');
  await page.getByLabel('First day').fill('2027-01-01');
  await page.getByLabel('Last day').fill('2027-03-31');
  await page.getByRole('button', { name: 'Create season' }).click();
  await expect(page.getByRole('heading', { name: 'Setup' })).toBeVisible();

  // 2. ice from a CSV export
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  await expect(page.getByText('No ice yet', { exact: false })).toBeVisible();
  const [iceChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import ice from CSV' }).click(),
  ]);
  await iceChooser.setFiles(ICE_CSV);
  await expect(page.getByText(/added \d+ slots/)).toBeVisible();

  // 3. a slot added by hand, which is the other thing a real season needs
  const before = await page.locator('tbody tr').count();
  await page.getByRole('button', { name: 'Add a slot' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(before + 1);

  // 4. teams from a CSV, divisions created from it
  await page.getByRole('button', { name: 'Teams', exact: true }).click();
  const [teamChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import teams from CSV' }).click(),
  ]);
  await teamChooser.setFiles(TEAMS_CSV);
  await expect(page.getByText(/added 4 teams/)).toBeVisible();

  // 5. set a game target and schedule it
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.locator('input.score').first().fill('2');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: /Generate/ }).click();
  await expect(page.getByText(/placed/)).toBeVisible({ timeout: 20000 });
  await expect(page.locator('tbody tr').first()).toBeVisible();
});


test('builds a bracket and seeds it off the standings', async ({ page }) => {
  await openFixture(page);

  // Scores first, so the table has an order to seed from.
  await page.getByRole('button', { name: 'Results', exact: true }).click();
  const scores = page.locator('input.score:not([disabled])');
  const goals = ['6', '1', '5', '0', '4', '2', '3', '1'];
  for (let i = 0; i < goals.length; i++) await scores.nth(i).fill(goals[i]!);

  await page.getByRole('button', { name: 'Playoffs', exact: true }).click();
  await page.getByLabel('A playoff teams').selectOption('2');
  await page.getByRole('button', { name: /Build brackets|Rebuild brackets/ }).click();

  // A seeded final, with real team names rather than "Seed 1".
  const tie = page.locator('.tie').first();
  await expect(tie).toBeVisible({ timeout: 20000 });
  await expect(tie.locator('.side.tbd')).toHaveCount(0);
  await expect(page.getByText('seeds final')).toBeVisible();

  // and the season is still legal with the bracket in it
  await page.getByRole('button', { name: 'Checks', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Nothing is broken|problems to fix/ })).toBeVisible();
});

test('a bracket game cannot take a score until it has two teams', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Playoffs', exact: true }).click();
  await page.getByLabel('A playoff teams').selectOption('4');
  await page.getByRole('button', { name: /Build brackets|Rebuild brackets/ }).click();
  await expect(page.locator('.tie').first()).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Results', exact: true }).click();
  // The final waits on both semifinals, so its score boxes are shut.
  await expect(page.locator('input.score[disabled]').first()).toBeVisible();
});

test('a winner advances through the bracket', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Playoffs', exact: true }).click();
  await page.getByLabel('A playoff teams').selectOption('2');
  await page.getByRole('button', { name: /Build brackets|Rebuild brackets/ }).click();
  await expect(page.locator('.tie').first()).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Results', exact: true }).click();
  const open = page.locator('input.score:not([disabled])');
  const n = await open.count();
  await open.nth(n - 2).fill('7');
  await open.nth(n - 1).fill('2');

  await page.getByRole('button', { name: 'Playoffs', exact: true }).click();
  await expect(page.locator('.tie .side.won')).toHaveCount(1);
  await expect(page.getByText(/wins it/)).toBeVisible();
});

test('clearing a bracket gives the ice back', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Playoffs', exact: true }).click();
  await page.getByLabel('A playoff teams').selectOption('2');
  await page.getByRole('button', { name: /Build brackets|Rebuild brackets/ }).click();
  await expect(page.locator('.tie').first()).toBeVisible({ timeout: 20000 });
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Clear brackets' }).click();
  await expect(page.locator('.tie')).toHaveCount(0);
  await expect(page.getByText('No brackets yet.')).toBeVisible();
});


test('the team filter follows the division', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  const team = page.getByLabel('Team');
  const before = await team.locator('option').count();
  expect(before).toBeGreaterThan(1);

  await page.getByLabel('Division').selectOption('A');
  // Still every team, because the fixture has one division...
  await expect(team.locator('option').first()).toHaveText('All A teams');

  // ...so prove the dependency the other way: pick a team, then a division it
  // is not in, and the stale team filter must clear itself.
  await page.getByLabel('Division').selectOption('all');
  const second = await team.locator('option').nth(1).getAttribute('value');
  await team.selectOption(second!);
  await expect(team).toHaveValue(second!);
});

test('shows practices and free ice, and can filter them away', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();

  // The fixture has a practice slot with four teams on it.
  await page.getByLabel('Show').selectOption('practice');
  await expect(page.locator('.chip.kind.prac').first()).toBeVisible();

  // Unused ice is there when asked for, and gone when not.
  await page.getByLabel('Show').selectOption('all');
  const withFree = await page.locator('tbody tr').count();
  await page.getByLabel('Show').selectOption('booked');
  const booked = await page.locator('tbody tr').count();
  expect(booked).toBeLessThanOrEqual(withFree);

  await page.getByLabel('Show').selectOption('game');
  await expect(page.locator('.chip.kind.prac')).toHaveCount(0);
});

test('generating fills practices, not just games', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: /Generate/ }).click();
  await expect(page.getByText(/placed/)).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Show').selectOption('practice');
  // A House season owes every team practices; the generator used to make none.
  await expect(page.locator('.chip.kind.prac').first()).toBeVisible();
});

test('ice rules are visible rather than hidden in the rows', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  await page.getByRole('button', { name: /Who gets which ice/ }).click();
  // The fixture has no weekly pattern to find, so add the rule by hand.
  await page.getByRole('button', { name: 'Find the weekly patterns' }).click();
  await page.getByRole('button', { name: 'Add a rule' }).click();
  await page.getByLabel('rule-1 day').selectOption('saturday');
  await page.getByLabel('rule-1 division').selectOption('A');
  await expect(page.getByRole('button', { name: 'Apply to the ice' })).toBeEnabled();
  await page.getByRole('button', { name: 'Apply to the ice' }).click();
  await expect(page.getByText(/Applied \d+ rules to \d+ slots/)).toBeVisible();
});

test('a slot can be set to evaluation', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  // Row 1 of the fixture has a game on it, so changing it asks twice:
  // "something is booked here" and then "why".
  page.on('dialog', (d) => d.accept('moved for evaluations'));
  await page.locator('tbody tr').first().locator('select').first().selectOption('evaluation');
  await page.getByLabel('Use', { exact: true }).selectOption('evaluation');
  await expect(page.locator('tbody tr')).toHaveCount(1);
});


test('repurposing a slot is recorded, not a silent edit', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Ice', exact: true }).click();

  // The reason is asked for and kept. The first row has a game on it, so the
  // app checks that too before changing what the ice is for.
  page.on('dialog', (d) => d.accept('Parents expect this hour'));
  const row = page.locator('tbody tr').first();
  await row.locator('select').first().selectOption('evaluation');

  await expect(row.getByRole('button', { name: /^was / })).toBeVisible();
  await expect(page.getByText(/being used for something other than what the building booked/))
    .toBeVisible();

  // And it is on the handback to the rink.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download ice differences CSV' })).toBeEnabled();
});

test('a repurposed slot can be put back', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  page.on('dialog', (d) => d.accept('temporary'));
  const row = page.locator('tbody tr').first();
  await row.locator('select').first().selectOption('evaluation');
  await row.getByRole('button', { name: /^was / }).click();
  await expect(row.getByRole('button', { name: /^was / })).toHaveCount(0);
});

test('a rules pass leaves a repurposed slot alone', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  page.on('dialog', (d) => d.accept('evals'));
  const row = page.locator('tbody tr').first();
  await row.locator('select').first().selectOption('evaluation');

  await page.getByRole('button', { name: /Who gets which ice/ }).click();
  await page.getByRole('button', { name: 'Add a rule' }).click();
  await page.getByLabel('rule-1 use').selectOption('game');
  await page.getByRole('button', { name: 'Apply to the ice' }).click();
  await expect(page.getByText(/Applied 1 rules/)).toBeVisible();

  // Still an evaluation. The rules panel is above the slots now, so find the
  // slot table rather than the first row on the page.
  const slots = page.locator('table').last();
  await expect(slots.getByRole('button', { name: /^was / })).toBeVisible();
});


test('nothing asks for evaluations until a division does', async ({ page }) => {
  await openFixture(page);
  // Zero is the default, so a league that does not run them is never nagged.
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.locator('.panel').filter({ hasText: 'Evaluations' })).toHaveCount(0);

  // Tick one division up to a single session and it starts asking.
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByLabel('A evaluation sessions').fill('1');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  const panel = page.locator('.panel').filter({ hasText: 'Evaluations' });
  await expect(panel.getByText('no evaluation ice')).toBeVisible();
  await expect(panel.getByText(/0% ready/)).toBeVisible();

  // Mark the ice, and the division's start date follows from it.
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  page.on('dialog', (d) => d.accept('evaluations'));
  const row = page.locator('table').last().locator('tbody tr').first();
  await row.locator('select').first().selectOption('evaluation');
  await row.locator('select').nth(1).selectOption('A');

  // The ice is now marked, so the "no evaluation ice" blocker is gone. In its
  // place is the ordering rule: the fixture already plays on that date, which
  // is exactly what evaluations-come-first is there to catch.
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  const after = page.locator('.panel').filter({ hasText: 'Evaluations' });
  await expect(after.getByText('no evaluation ice')).toHaveCount(0);
  await expect(after.getByText(/before its last evaluation/)).toBeVisible();
});

test('the overview says how close the season is to publishable', async ({ page }) => {
  await openFixture(page);
  const panel = page.locator('.panel.ready');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/% — \d+ of \d+ checks met/)).toBeVisible();
  // Each condition says what is done or what is missing, not a rule code.
  await expect(panel.locator('.crit').first()).toBeVisible();
});

test('a division cannot be scheduled before it is evaluated', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  page.on('dialog', (d) => d.accept('evaluations'));

  // Turn the LAST slot of the season into the evaluation, so every game would
  // otherwise fall before it, then regenerate.
  const rows = page.locator('table').last().locator('tbody tr');
  const last = rows.nth(await rows.count() - 1);
  await last.locator('select').first().selectOption('evaluation');
  await last.locator('select').nth(1).selectOption('A');

  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: /Generate/ }).click();

  // It refuses to place them rather than placing them before the evaluation,
  // and offers ice that would fix it.
  await expect(page.getByText(/games could not be placed/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Ice that could fill the gaps' })).toBeVisible();

  // The fixture's playoff final sits on the slot we just turned into the
  // evaluation, which the checks rightly complain about — that is the rule
  // working on a contradictory season, not the generator breaking it.
  await page.getByRole('button', { name: 'Checks', exact: true }).click();
  await expect(page.getByText(/before its last evaluation/)).toBeVisible();
});


test('a division says how it splits the ice, and the sheet follows', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  const fmt = page.getByLabel('A ice format');
  await expect(fmt).toHaveValue('full');
  await fmt.selectOption('cross');

  // The Ice tab works the number out rather than making you type it per slot.
  await page.getByRole('button', { name: 'Ice', exact: true }).click();
  const caps = page.locator('table').last().locator('tbody tr').first()
    .locator('input[type=number]');
  // Minutes, then games-at-once: the latter is 0, meaning "from the format".
  await expect(caps.nth(1)).toHaveValue('0');
});


test('two divisions can be paired for crossover, and it writes both ways', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Setup', exact: true }).click();

  // The fixture has one division, so add a second to pair with.
  await page.getByRole('button', { name: 'Add division' }).click();
  const rows = page.locator('table').first().locator('tbody tr');
  await expect(rows).toHaveCount(2);

  // Pairing from one side turns it on for both.
  const first = rows.nth(0).getByRole('button', { name: 'Division 2' });
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(rows.nth(1).getByRole('button', { name: 'A' }))
    .toHaveAttribute('aria-pressed', 'true');

  // And the count only appears once there is somebody to play.
  await expect(page.getByLabel('A crossover games')).toBeVisible();
});

test('crossover is refused between different ice formats', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('button', { name: 'Add division' }).click();
  const rows = page.locator('table').first().locator('tbody tr');
  await rows.nth(0).getByLabel('A ice format').selectOption('cross');
  // One plays cross ice, the other full: a sheet is set up one way at a time.
  await expect(rows.nth(0).getByRole('button', { name: 'Division 2' })).toBeDisabled();
});
