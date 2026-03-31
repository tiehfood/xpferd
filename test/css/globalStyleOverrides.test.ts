/**
 * CSS Global Style Override Guard
 *
 * Scanned Svelte components must NOT redefine selectors or keyframes
 * that are owned by the global app.css stylesheet.
 *
 * See .claude/rules/ui-components.md → "What MUST NOT be overridden"
 * for the full rationale.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { globSync } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSvelteFiles(): string[] {
  // Walk src/client/ manually since globSync from 'fs' doesn't exist.
  // Use a simple recursive readdir approach.
  const results: string[] = [];
  const { readdirSync, statSync } = require('fs');
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.svelte')) results.push(full);
    }
  }
  walk(path.resolve('src/client'));
  return results;
}

function extractStyleBlock(content: string): string | null {
  const match = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Forbidden patterns
//
// Each entry is { regex, label }.
// The regex is tested against every TRIMMED line of the <style> block.
// ---------------------------------------------------------------------------

const FORBIDDEN: { regex: RegExp; label: string }[] = [
  // Bare element selectors (form controls & tables)
  { regex: /^label\s*\{/, label: 'bare `label {` — use global label styles' },
  { regex: /^input\s*[,{]/, label: 'bare `input` — use global input styles' },
  { regex: /^select\s*[,{]/, label: 'bare `select` — use global select styles' },
  { regex: /^button\s*[,{]/, label: 'bare `button` — use global button styles' },
  { regex: /^table\s*\{/, label: 'bare `table {` — use global table styles' },

  // Global utility classes
  { regex: /^\.badge\s*\{/, label: 'bare `.badge {` — use global .badge styles (use .badge-xxx for variants)' },
  { regex: /^\.form-group\s*\{/, label: 'bare `.form-group {` — never override global form-group margin' },
  { regex: /^\.row-enter\s*\{/, label: '`.row-enter` — defined globally in app.css' },

  // Duplicate keyframes (all defined globally in app.css)
  { regex: /^@keyframes\s+spin\s*\{/, label: '@keyframes spin — defined globally in app.css' },
  { regex: /^@keyframes\s+fadeIn\s*\{/, label: '@keyframes fadeIn — defined globally in app.css' },
  { regex: /^@keyframes\s+slideUp\s*\{/, label: '@keyframes slideUp — defined globally in app.css' },
  { regex: /^@keyframes\s+scaleIn\s*\{/, label: '@keyframes scaleIn — defined globally in app.css' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CSS Global Style Overrides', () => {
  const svelteFiles = findSvelteFiles();

  it('should find Svelte files to check', () => {
    expect(svelteFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of svelteFiles) {
    const fileName = path.basename(filePath);

    it(`${fileName} should not override global styles`, () => {
      const content = readFileSync(filePath, 'utf-8');
      const css = extractStyleBlock(content);
      if (!css) return; // no scoped styles — pass

      const violations: string[] = [];
      const lines = css.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) continue;

        for (const { regex, label } of FORBIDDEN) {
          if (regex.test(trimmed)) {
            violations.push(`  Line ~${i + 1}: ${label}  →  "${trimmed}"`);
          }
        }
      }

      if (violations.length > 0) {
        expect.fail(
          `${fileName} has scoped CSS that overrides global app.css styles:\n` +
          violations.join('\n') +
          '\n\nSee .claude/rules/ui-components.md → "What MUST NOT be overridden"'
        );
      }
    });
  }
});
