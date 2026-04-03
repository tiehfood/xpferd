/**
 * Tailwind CSS 4 Override Contract Guard
 *
 * Tailwind CSS 4 (no @tailwindcss/forms plugin) applies `border-radius: 0` on bare
 * `input, select, textarea` via its `@layer base` reset at specificity (0,0,1).
 *
 * Our app.css bare `input, select, textarea` rule at the same (0,0,1) specificity wins
 * purely by cascade order (app.css loads after tailwind.css). No [type="text"] attribute
 * selector override blocks are needed.
 *
 * NOTE: There is NO @tailwindcss/forms plugin in Tailwind 4. The old plugin emitted
 * [type=text],[type=email],[multiple],... rules at (0,1,0) specificity. Those rules
 * no longer exist.
 *
 * These tests lock the Tailwind 4 cascade contract in place.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = process.cwd();

function readFile(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), 'utf-8');
}

// ---------------------------------------------------------------------------
// Test 1: app.css base element rules set our design-system values
// ---------------------------------------------------------------------------

describe('app.css base element rules for form controls', () => {
  const appCss = readFile('src/client/app.css');

  it('contains bare input/select/textarea rule with border-radius', () => {
    // The bare element rule sets border-radius: var(--radius-lg) which wins over
    // Tailwind's bare element reset (border-radius: 0) by source order in @layer base.
    expect(appCss).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/s);
  });

  it('contains bare input/select/textarea rule with font-size', () => {
    expect(appCss).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*0\.8125rem/s);
  });

  it('contains focus rule with primary border-color', () => {
    expect(appCss).toMatch(/input:focus,\s*select:focus,\s*textarea:focus\s*\{[^}]*border-color:\s*var\(--primary\)/s);
  });

  it('contains focus rule with box-shadow ring', () => {
    expect(appCss).toMatch(/input:focus,\s*select:focus,\s*textarea:focus\s*\{[^}]*box-shadow:\s*0 0 0 3px var\(--primary-10\)/s);
  });

  it('does NOT contain the obsolete [type="text"] override block', () => {
    // The [type="text"],[type="email"],... override block was needed for Tailwind 3's
    // @tailwindcss/forms plugin. With Tailwind 4 (no forms plugin), bare element rules
    // in @layer base win by source order. The block is redundant.
    const obsoleteTypes = ['text', 'url', 'password', 'datetime-local', 'month', 'search', 'tel', 'time', 'week'];
    const hasOldOverride = obsoleteTypes.every(t => appCss.includes(`[type="${t}"]`));
    expect(hasOldOverride, 'app.css should not contain the full [type="..."] override block').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Tailwind 4 does NOT emit the old forms-plugin rule
// ---------------------------------------------------------------------------

describe('Tailwind 4 forms-plugin guard', () => {
  const tailwindCss = readFile('dist/client/tailwind.css');

  it('tailwind.css does NOT contain the old forms plugin [multiple] selector', () => {
    const match = tailwindCss.match(/\[multiple\][^{]+border-radius:0/);
    expect(match, 'tailwind.css must NOT contain the old @tailwindcss/forms plugin [multiple] selector block').toBeNull();
  });

  it('tailwind.css does NOT contain old forms plugin combined selector', () => {
    const hasOldFormsPlugin = /\[type=text\][^}]*\[multiple\][^}]*border-radius:\s*0/.test(tailwindCss);
    expect(hasOldFormsPlugin, 'tailwind.css must NOT contain old @tailwindcss/forms plugin rules').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Cascade order — tailwind.css loads before app.css
// ---------------------------------------------------------------------------

describe('CSS load order in dist/client/index.html', () => {
  const indexHtml = readFile('dist/client/index.html');

  it('index.html exists and loads both stylesheets', () => {
    expect(indexHtml).toContain('tailwind.css');
    expect(indexHtml).toContain('app.css');
  });

  it('tailwind.css is loaded BEFORE app.css', () => {
    const tailwindPos = indexHtml.indexOf('tailwind.css');
    const appCssPos = indexHtml.indexOf('app.css');
    expect(tailwindPos).toBeGreaterThan(-1);
    expect(appCssPos).toBeGreaterThan(-1);
    expect(
      tailwindPos,
      'tailwind.css must appear before app.css in index.html so the cascade order is correct'
    ).toBeLessThan(appCssPos);
  });

  it('both are loaded as <link rel="stylesheet">', () => {
    expect(indexHtml).toMatch(/<link[^>]*rel="stylesheet"[^>]*tailwind\.css/);
    expect(indexHtml).toMatch(/<link[^>]*rel="stylesheet"[^>]*app\.css/);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Compiled dist/client/app.css contains correct base rules
// ---------------------------------------------------------------------------

describe('Compiled dist/client/app.css contains the correct base rules', () => {
  const compiledAppCss = readFile('dist/client/app.css');

  it('compiled app.css contains border-radius: var(--radius-lg)', () => {
    expect(
      compiledAppCss,
      'compiled app.css must contain var(--radius-lg) for form controls'
    ).toContain('var(--radius-lg)');
  });

  it('compiled app.css does NOT contain old forms-plugin selector pattern', () => {
    expect(
      compiledAppCss,
      'app.css should not contain the Tailwind [multiple],[type=date]... rule'
    ).not.toMatch(/\[multiple\],[^\{]+border-radius:0/);
  });

  it('cascade is correct: tailwind.css and app.css are separate files', () => {
    const indexHtml = readFile('dist/client/index.html');
    const tailwindLinkPos = indexHtml.indexOf('tailwind.css');
    const appCssLinkPos = indexHtml.indexOf('app.css');

    expect(tailwindLinkPos).toBeGreaterThan(-1);
    expect(appCssLinkPos).toBeGreaterThan(-1);
    expect(tailwindLinkPos).toBeLessThan(appCssLinkPos);
  });
});
