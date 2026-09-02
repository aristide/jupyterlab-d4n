/**
 * Menu icon census — the input to D-020 and P0-06.
 *
 * Opens every menu bar dropdown and every submenu in a real browser, and
 * classifies each row into the four kinds that D-020 distinguishes:
 *
 *   - submenu parent    Lumino draws a caret in .lm-Menu-itemSubmenuIcon,
 *                       which is a different slot. No icon is owed.
 *   - value-picker row  A section between separators where every row runs the
 *                       same command with a different argument. No icon.
 *   - unlabelled row    A command that renders with an empty label.
 *   - command row       Everything else. D-020 says every one carries an icon.
 *
 * Usage:  jlpm test:menu-icons            human-readable census
 *         jlpm test:menu-icons --json     the classified rows, for tooling
 *
 * Point it at another instance with JUPYTER_URL. Inside the container that is
 * http://localhost:8888; from the host it is http://localhost:8890.
 */
const { chromium } =
  await import('file:///workspace/node_modules/@playwright/test/index.mjs');

const URL = `${process.env.JUPYTER_URL ?? 'http://localhost:8888'}/lab?reset=1`;
const asJson = process.argv.includes('--json');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('#jp-top-panel .lm-MenuBar-item', {
  timeout: 60000
});
// Montserrat resolves late and moves every row, so measure after the fonts land.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);

const readOpenMenu = () =>
  page.evaluate(() => {
    const open = [...document.querySelectorAll('.lm-Menu')].filter(
      m => m.offsetParent !== null
    );
    const menu = open[open.length - 1];
    if (!menu) {
      return null;
    }
    return [...menu.querySelectorAll('.lm-Menu-item')].map(item => ({
      label: (
        item.querySelector('.lm-Menu-itemLabel')?.textContent ?? ''
      ).trim(),
      type: item.dataset.type ?? 'command',
      command: item.dataset.command ?? '',
      // Lumino marks only the rows that are toggled ON right now. An unchecked
      // toggle is indistinguishable from a plain command in the DOM.
      toggledNow: item.getAttribute('aria-checked') === 'true',
      hasIcon: !!item.querySelector('.lm-Menu-itemIcon svg')
    }));
  });

const menus = [];
const barCount = (await page.$$('#jp-top-panel .lm-MenuBar-item')).length;
for (let i = 0; i < barCount; i++) {
  const bar = await page.$$('#jp-top-panel .lm-MenuBar-item');
  const label = (await bar[i].textContent()).trim();
  await bar[i].click();
  await page.waitForTimeout(450);
  const items = (await readOpenMenu()) ?? [];
  const menu = { menu: label, items, submenus: [] };

  // Submenus need the real mouse. Synthetic PointerEvents do not open them.
  const parents = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === 'submenu');
  for (const { item, index } of parents) {
    const rows = await page.$$(
      '.lm-Menu:not([style*="display: none"]) .lm-Menu-item'
    );
    const box = await rows[index]?.boundingBox();
    if (!box) {
      continue;
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(950);
    menu.submenus.push({
      label: item.label,
      items: (await readOpenMenu()) ?? []
    });
    await page.waitForTimeout(150);
  }
  menus.push(menu);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}
await browser.close();

const groups = [];
for (const menu of menus) {
  groups.push({ top: menu.menu, path: menu.menu, items: menu.items });
  for (const sub of menu.submenus) {
    groups.push({
      top: menu.menu,
      path: `${menu.menu} > ${sub.label}`,
      items: sub.items
    });
  }
}

const commandRows = [];
const pickers = [];
let parentCount = 0;
let pickerRows = 0;
let unlabelled = 0;
for (const group of groups) {
  const sections = [[]];
  for (const item of group.items) {
    if (item.type === 'separator') {
      sections.push([]);
    } else {
      sections[sections.length - 1].push(item);
    }
  }
  for (const section of sections) {
    const rows = section.filter(item => item.type !== 'submenu');
    parentCount += section.length - rows.length;
    const commands = new Set(rows.map(item => item.command));
    if (rows.length >= 2 && commands.size === 1) {
      pickers.push({
        path: group.path,
        rows: rows.length,
        command: [...commands][0]
      });
      pickerRows += rows.length;
      continue;
    }
    for (const item of rows) {
      if (!item.label) {
        unlabelled++;
        continue;
      }
      commandRows.push({ ...item, top: group.top, path: group.path });
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ pickers, commandRows }, null, 2));
} else {
  const perMenu = {};
  for (const row of commandRows) {
    perMenu[row.top] = (perMenu[row.top] ?? 0) + 1;
  }
  console.log(`Menu icon census — ${URL}`);
  console.log(`  top-level menus            ${menus.length}`);
  console.log(`  submenu parents            ${parentCount}`);
  console.log(
    `  value-picker rows          ${pickerRows} in ${pickers.length} sections`
  );
  console.log(`  unlabelled rows            ${unlabelled}`);
  console.log(`  command rows owed an icon  ${commandRows.length}`);
  console.log(
    `    distinct commands        ${new Set(commandRows.map(r => r.command)).size}`
  );
  console.log(
    `    already carry one        ${commandRows.filter(r => r.hasIcon && !r.toggledNow).length}`
  );
  console.log(
    `    show a check mark now    ${commandRows.filter(r => r.toggledNow).length}`
  );
  console.log('  per top-level menu');
  for (const [menu, count] of Object.entries(perMenu)) {
    console.log(`    ${menu.padEnd(10)} ${count}`);
  }
  console.log('  value-picker sections (D-020 exempts these)');
  for (const picker of pickers) {
    console.log(
      `    ${String(picker.rows).padStart(4)}  ${picker.path} — all ${picker.command}`
    );
  }
}
