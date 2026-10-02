/** Screenshot the widget at a given width. `node scripts/shot.mjs 1850 out.png` */
import { withWidget, openWidget } from './render.mjs';

const width = Number(process.argv[2] || 1850);
const out = process.argv[3] || 'docs/qa/render.png';

await withWidget(async ({ browser, origin }) => {
  const { page, messages } = await openWidget(browser, origin, width);
  const widget = page.locator('stefnu-rit');
  await widget.screenshot({ path: out });
  const box = await widget.boundingBox();
  console.log(`${out}  ${Math.round(box.width)} × ${Math.round(box.height)}`);
  if (messages.length) console.log('console:\n  ' + messages.join('\n  '));
  else console.log('console: clean');
});
