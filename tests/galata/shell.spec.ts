/**
 * The first baseline: the shell surfaces that exist and hold still.
 *
 * PRD §10.1 sizes the finished matrix at roughly 180 snapshots — every surface
 * in §6 × {light, dark} × {default, compact}. This file is deliberately six
 * snapshots per project, not ninety. A baseline is a claim that these pixels
 * are correct, and a claim nobody has looked at is worse than no claim: it gets
 * approved as a block on the first regression and the real diff hides inside
 * it. Surfaces join this file as their task lands, and the reviewer looks at
 * each one when it is one image rather than one of ninety.
 *
 * What is in, and why each is stable:
 *
 *   shell         the whole frame at the §4.2 viewport floor, 1280×720
 *   top-panel     P2-01. Carries the brand mark (D-021) and the menu bar
 *   left-rail     P2-04. Five icons, no text, no state
 *   file-browser  P2-04. Last Modified is frozen by the fixture
 *   status-bar    D-015
 *   launcher      P2-08 / D-016. Kernel names come from the image, not a clock
 *
 * What is deliberately out: anything showing a kernel state, a running session,
 * or a timestamp the fixture does not freeze.
 */
import { test, expect } from './fixtures';

test.describe('shell', () => {
  test('application frame', async ({ lab }) => {
    await expect(lab).toHaveScreenshot('shell.png', { fullPage: false });
  });

  test('top panel', async ({ lab }) => {
    await expect(lab.locator('#jp-top-panel')).toHaveScreenshot(
      'top-panel.png'
    );
  });

  test('left rail', async ({ lab }) => {
    await expect(lab.locator('.jp-SideBar.jp-mod-left')).toHaveScreenshot(
      'left-rail.png'
    );
  });

  test('file browser', async ({ lab }) => {
    await expect(lab.locator('#filebrowser')).toHaveScreenshot(
      'file-browser.png'
    );
  });

  test('status bar', async ({ lab }) => {
    await expect(lab.locator('#jp-main-statusbar')).toHaveScreenshot(
      'status-bar.png'
    );
  });

  test('launcher', async ({ lab }) => {
    await expect(lab.locator('.jp-Launcher')).toHaveScreenshot('launcher.png');
  });
});

/**
 * Not a picture — an assertion that the pictures above are of the right theme.
 *
 * Without it, a broken theme pin produces a full set of plausible snapshots in
 * the wrong mode, and `--update-snapshots` would bless them.
 */
test('the project theme is the one that is pinned', async ({
  lab,
  d4nTheme
}) => {
  await expect(lab.locator('body')).toHaveAttribute(
    'data-jp-theme-name',
    d4nTheme
  );
});
