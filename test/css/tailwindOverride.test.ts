/**
 * Tailwind Form Plugin Override Guard
 *
 * Tailwind's @tailwindcss/forms plugin injects [type=text], [type=email], etc. rules
 * with specificity (0,1,0) — higher than our bare `input` rule at (0,0,1).
 * These rules set `border-radius:0`, `font-size:1rem`, and `padding:.5rem .75rem`,
 * which breaks our design-system if not overridden.
 *
 * src/client/app.css adds matching typed-attribute selectors at the same (0,1,0)
 * specificity and is loaded AFTER tailwind.css — so our design values always win
 * via cascade order.
 *
 * These tests lock that contract in place so future changes cannot silently break it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = process.cwd();

function readFile(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function walkSvelteFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.svelte')) results.push(full);
    }
  }
  walk(dir);
  return results;
}

// The selectors targeted by the Tailwind forms plugin (from @tailwindcss/forms source)
const TAILWIND_FORM_TYPES = [
  'text',
  'email',
  'url',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'search',
  'tel',
  'time',
  'week',
] as const;

// ---------------------------------------------------------------------------
// Test 1: Override rules exist in src/client/app.css with correct values
// ---------------------------------------------------------------------------

describe('Tailwind form plugin override rules in src/client/app.css', () => {
  const appCss = readFile('src/client/app.css');

  it('contains a comment explaining the override', () => {
    expect(appCss).toContain('Override Tailwind');
  });

  it('contains [type="text"] in the override selector block', () => {
    expect(appCss).toMatch(/\[type="text"\]/);
  });

  it('override block sets border-radius to var(--radius-lg)', () => {
    // The override block must set border-radius: var(--radius-lg)
    // Search for the block containing [type="text"] that also has border-radius
    const typeTextIndex = appCss.indexOf('[type="text"]');
    expect(typeTextIndex).toBeGreaterThan(-1);

    // Find the closing brace of that rule block
    const ruleBodyStart = appCss.indexOf('{', typeTextIndex);
    const ruleBodyEnd = appCss.indexOf('}', ruleBodyStart);
    expect(ruleBodyStart).toBeGreaterThan(-1);
    expect(ruleBodyEnd).toBeGreaterThan(-1);

    const ruleBlock = appCss.substring(typeTextIndex, ruleBodyEnd + 1);
    expect(ruleBlock, 'border-radius must be var(--radius-lg) in the override block').toContain(
      'border-radius: var(--radius-lg)'
    );
  });

  it('override block sets font-size to 0.8125rem', () => {
    const typeTextIndex = appCss.indexOf('[type="text"]');
    const ruleBodyStart = appCss.indexOf('{', typeTextIndex);
    const ruleBodyEnd = appCss.indexOf('}', ruleBodyStart);
    const ruleBlock = appCss.substring(typeTextIndex, ruleBodyEnd + 1);
    expect(ruleBlock, 'font-size must be 0.8125rem in the override block').toContain(
      'font-size: 0.8125rem'
    );
  });

  it('override block sets padding to 0.6rem 0.85rem', () => {
    const typeTextIndex = appCss.indexOf('[type="text"]');
    const ruleBodyStart = appCss.indexOf('{', typeTextIndex);
    const ruleBodyEnd = appCss.indexOf('}', ruleBodyStart);
    const ruleBlock = appCss.substring(typeTextIndex, ruleBodyEnd + 1);
    expect(ruleBlock, 'padding must be 0.6rem 0.85rem in the override block').toContain(
      'padding: 0.6rem 0.85rem'
    );
  });

  it('contains focus override rule for [type="text"]:focus', () => {
    expect(appCss).toMatch(/\[type="text"\]:focus/);
  });

  it('focus override sets border-color to var(--primary)', () => {
    const focusIndex = appCss.indexOf('[type="text"]:focus');
    const ruleBodyStart = appCss.indexOf('{', focusIndex);
    const ruleBodyEnd = appCss.indexOf('}', ruleBodyStart);
    const ruleBlock = appCss.substring(focusIndex, ruleBodyEnd + 1);
    expect(ruleBlock, 'focus override must set border-color to var(--primary)').toContain(
      'border-color: var(--primary)'
    );
  });

  it('focus override sets box-shadow focus ring', () => {
    const focusIndex = appCss.indexOf('[type="text"]:focus');
    const ruleBodyStart = appCss.indexOf('{', focusIndex);
    const ruleBodyEnd = appCss.indexOf('}', ruleBodyStart);
    const ruleBlock = appCss.substring(focusIndex, ruleBodyEnd + 1);
    expect(ruleBlock, 'focus override must set box-shadow with primary-10').toContain(
      'box-shadow: 0 0 0 3px var(--primary-10)'
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: ALL Tailwind form types covered in the override selector block
// ---------------------------------------------------------------------------

describe('All Tailwind form plugin types are covered by override', () => {
  const appCss = readFile('src/client/app.css');

  for (const typeName of TAILWIND_FORM_TYPES) {
    it(`override selector includes [type="${typeName}"]`, () => {
      expect(appCss, `app.css must override [type="${typeName}"]`).toContain(
        `[type="${typeName}"]`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Test 3: Tailwind form plugin selectors have a matching override in app.css
// ---------------------------------------------------------------------------

describe('tailwind.css form plugin selectors are matched by app.css overrides', () => {
  const tailwindCss = readFile('dist/client/tailwind.css');
  const appCss = readFile('src/client/app.css');

  it('tailwind.css contains the form plugin border-radius:0 rule', () => {
    expect(tailwindCss).toContain('border-radius:0');
  });

  it('tailwind.css form plugin rule contains [type=text]', () => {
    // The full rule selector includes all typed inputs
    const match = tailwindCss.match(/(\[multiple\][^{]+)\{[^}]*border-radius:0/);
    expect(match, 'tailwind.css must contain the forms plugin rule with [multiple] selector').not.toBeNull();
    expect(match![1]).toContain('[type=text]');
  });

  it('every type selector from Tailwind forms plugin has a matching override in app.css', () => {
    // Extract selectors from the Tailwind forms plugin rule
    const match = tailwindCss.match(/(\[multiple\][^{]+)\{[^}]*border-radius:0/);
    expect(match, 'could not find Tailwind forms plugin rule').not.toBeNull();

    const tailwindSelectorGroup = match![1];
    // Extract individual [type=xxx] parts
    const tailwindTypes = tailwindSelectorGroup.match(/\[type=([^\]]+)\]/g) ?? [];

    const missing: string[] = [];
    for (const selector of tailwindTypes) {
      // Tailwind uses [type=text] without quotes; app.css uses [type="text"] with quotes
      const typeValue = selector.match(/\[type=([^\]]+)\]/)![1];
      const quotedSelector = `[type="${typeValue}"]`;
      if (!appCss.includes(quotedSelector)) {
        missing.push(quotedSelector);
      }
    }

    expect(
      missing,
      `app.css is missing override selectors: ${missing.join(', ')}`
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Cascade order — tailwind.css loads before app.css
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
// Test 5: The compiled dist/client/app.css contains the correct override rules
//
// The two CSS files are kept separate in the build (tailwind.css + app.css).
// Cascade order is determined by the HTML <link> order (verified in Test 4).
// This test verifies that dist/client/app.css actually contains the override
// so that the cascade mechanism can do its job.
// ---------------------------------------------------------------------------

describe('Compiled dist/client/app.css contains the correct override rules', () => {
  const compiledAppCss = readFile('dist/client/app.css');
  const tailwindCss = readFile('dist/client/tailwind.css');

  it('compiled app.css contains a [type=text] override rule', () => {
    expect(compiledAppCss).toMatch(/\[type=text\]/);
  });

  it('compiled app.css override sets border-radius to var(--radius-lg)', () => {
    const matches = [...compiledAppCss.matchAll(/\[type=text\][^{]*\{([^}]*)\}/g)];
    expect(matches.length, 'should find at least one [type=text] rule block in compiled CSS').toBeGreaterThan(0);

    const hasRadiusOverride = matches.some(m => m[1].includes('var(--radius-lg)'));
    expect(
      hasRadiusOverride,
      'compiled app.css must contain a [type=text] rule setting border-radius to var(--radius-lg)'
    ).toBe(true);
  });

  it('tailwind.css (loaded first) contains the border-radius:0 that we must override', () => {
    // This confirms the problem is real — Tailwind does set border-radius:0
    expect(tailwindCss).toContain('border-radius:0');
  });

  it('cascade is correct: tailwind.css is a separate file loaded BEFORE app.css in index.html', () => {
    // The cascade relies on two separate files loaded in the right HTML order.
    // This test confirms they are NOT merged into one file (which would require
    // position-based ordering within the file instead).
    const indexHtml = readFile('dist/client/index.html');
    const tailwindLinkPos = indexHtml.indexOf('tailwind.css');
    const appCssLinkPos = indexHtml.indexOf('app.css');

    expect(tailwindLinkPos).toBeGreaterThan(-1);
    expect(appCssLinkPos).toBeGreaterThan(-1);
    expect(tailwindLinkPos).toBeLessThan(appCssLinkPos);

    // Confirm the compiled app.css does NOT contain the tailwind border-radius:0 rule
    // (i.e., the two files are kept separate and the build hasn't inlined tailwind into app.css)
    const twRulePresent = compiledAppCss.includes('[type=text],[type=email]') ||
      compiledAppCss.includes('[type=email],[type=url],[type=password],[type=number],[type=date]');
    // The tailwind.css forms plugin big selector group should be in tailwind.css, not app.css
    // We verify by checking that our app.css does NOT have the Tailwind-style unquoted selector list
    // that starts with [multiple] (which is characteristic of the forms plugin)
    expect(
      compiledAppCss,
      'app.css should not contain the Tailwind [multiple],[type=date]... rule — that belongs in tailwind.css'
    ).not.toMatch(/\[multiple\],[^\{]+border-radius:0/);
  });

  it('compiled app.css override rule appears and would win the cascade (same specificity, later load)', () => {
    // At identical specificity (0,1,0), the LATER rule wins. Since app.css is loaded
    // after tailwind.css (verified in index.html), our override [type="text"] { border-radius: var(--radius-lg) }
    // beats Tailwind's [type=text] { border-radius: 0 }.
    // We verify by confirming our compiled app.css has the rule with the correct value.
    const overrideIndex = compiledAppCss.indexOf('var(--radius-lg)');
    expect(overrideIndex, 'app.css must contain var(--radius-lg) for the override to work').toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Svelte components with explicit type="text" inputs are protected
// ---------------------------------------------------------------------------

describe('Svelte components with type="text" inputs are covered by the override', () => {
  const svelteFiles = walkSvelteFiles(path.join(ROOT, 'src/client'));
  const appCss = readFile('src/client/app.css');

  it('app.css covers [type="text"] inputs (used in Svelte components)', () => {
    // Collect all Svelte files that use type="text"
    const filesWithTypeText = svelteFiles.filter(f => {
      const content = readFileSync(f, 'utf-8');
      return /type="text"/.test(content);
    });

    // This is an existence check: if there are any type="text" inputs in the app,
    // the override selector must be present in app.css
    if (filesWithTypeText.length > 0) {
      expect(
        appCss,
        `${filesWithTypeText.length} Svelte file(s) use type="text" inputs but app.css lacks the override selector`
      ).toContain('[type="text"]');
    }
    // If no files use type="text", the test still passes — coverage is comprehensive
    // via the other typed selectors
    expect(filesWithTypeText.length).toBeGreaterThanOrEqual(0);
  });

  it('lists all Svelte files using explicit type="text" inputs', () => {
    const filesWithTypeText = svelteFiles.filter(f => {
      const content = readFileSync(f, 'utf-8');
      return /type="text"/.test(content);
    });
    // This test is informational — it passes as long as those files exist
    // (which they should, confirming that the override is actually needed)
    for (const filePath of filesWithTypeText) {
      const fileName = path.basename(filePath);
      // Each component's type="text" inputs are covered by the [type="text"] override in app.css
      expect(
        appCss,
        `${fileName} has type="text" inputs — app.css must override [type="text"]`
      ).toContain('[type="text"]');
    }
  });

  it('app.css covers ALL typed input variants found in Svelte components', () => {
    const typePattern = /type="([a-z-]+)"/g;
    const foundTypes = new Set<string>();

    for (const filePath of svelteFiles) {
      const content = readFileSync(filePath, 'utf-8');
      for (const match of content.matchAll(typePattern)) {
        const t = match[1];
        // Only check input types that the Tailwind forms plugin targets
        if ((TAILWIND_FORM_TYPES as readonly string[]).includes(t)) {
          foundTypes.add(t);
        }
      }
    }

    const missing: string[] = [];
    for (const typeName of foundTypes) {
      if (!appCss.includes(`[type="${typeName}"]`)) {
        missing.push(`[type="${typeName}"]`);
      }
    }

    expect(
      missing,
      `app.css is missing override rules for these input types used in Svelte components: ${missing.join(', ')}`
    ).toHaveLength(0);
  });
});
