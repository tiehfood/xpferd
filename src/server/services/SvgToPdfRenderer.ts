/**
 * SvgToPdfRenderer — converts an SVG buffer to LibPDF vector drawing operations.
 *
 * Supports: path, rect, circle, ellipse, line, polyline, polygon, g (with transforms),
 *           linearGradient, radialGradient, opacity, fill/stroke inheritance.
 * Falls back to @resvg/resvg-js rasterization when unsupported elements are present
 * (text, filter, clipPath, mask, etc.).
 */

import { PDF, ops, rgb } from '@libpdf/core';
import type { PDFPage } from '@libpdf/core';
import type { PdfBlockDto } from '../../shared/types';
import { convert } from 'xmlbuilder2';
import { Resvg } from '@resvg/resvg-js';

// ─── Affine transform ────────────────────────────────────────────────────────
// [a, b, c, d, e, f]: x' = ax + cy + e,  y' = bx + dy + f  (SVG/PDF column-vector convention)
type Tf = [number, number, number, number, number, number];

function identity(): Tf { return [1, 0, 0, 1, 0, 0]; }

/** outer × inner */
function compose(outer: Tf, inner: Tf): Tf {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a1 * a2 + c1 * b2, b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1,
  ];
}

function applyTf(t: Tf, x: number, y: number): [number, number] {
  return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
}

// ─── SVG DOM types ────────────────────────────────────────────────────────────
interface SvgNode { tag: string; attrs: Record<string, string>; children: SvgNode[]; text?: string; }

// ─── Color ───────────────────────────────────────────────────────────────────
interface RGBA { r: number; g: number; b: number; a: number; }
type ColorRef = RGBA | { gradient: string } | 'none';

// ─── Gradient definitions ─────────────────────────────────────────────────────
interface GradStop { offset: number; color: RGBA; }
interface LinearGradDef { type: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradStop[]; units: 'userSpaceOnUse' | 'objectBoundingBox'; tf: Tf; }
interface RadialGradDef { type: 'radial'; cx: number; cy: number; r: number; fx: number; fy: number; stops: GradStop[]; units: 'userSpaceOnUse' | 'objectBoundingBox'; tf: Tf; }
type GradDef = LinearGradDef | RadialGradDef;

// ─── Drawing context (inherited attributes) ───────────────────────────────────
interface Ctx {
  fill: ColorRef;
  stroke: ColorRef;
  strokeWidth: number;
  fillOpacity: number;
  strokeOpacity: number;
  opacity: number;
  fillRule: 'nonzero' | 'evenodd';
}

const defaultCtx: Ctx = {
  fill: { r: 0, g: 0, b: 0, a: 1 },
  stroke: 'none',
  strokeWidth: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  opacity: 1,
  fillRule: 'nonzero',
};

// ─── ViewBox ──────────────────────────────────────────────────────────────────
interface ViewBox { minX: number; minY: number; width: number; height: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CSS_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff', orange: '#ffa500',
  purple: '#800080', pink: '#ffc0cb', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', gold: '#ffd700', lime: '#00ff00', navy: '#000080',
  maroon: '#800000', olive: '#808000', teal: '#008080', aqua: '#00ffff',
  fuchsia: '#ff00ff', coral: '#ff7f50', salmon: '#fa8072', khaki: '#f0e68c',
  brown: '#a52a2a', darkred: '#8b0000', darkblue: '#00008b', darkgreen: '#006400',
  transparent: '#00000000',
};

function parseColor(s: string | undefined): ColorRef {
  if (!s || s === 'none') return 'none';
  if (s === 'currentColor') return { r: 0, g: 0, b: 0, a: 1 };
  if (s.startsWith('url(#')) {
    const id = s.slice(5, -1).trim();
    return { gradient: id };
  }
  const hex = CSS_COLORS[s.toLowerCase()] ?? s;
  if (hex.startsWith('#')) {
    const h = hex.slice(1);
    if (h.length === 3) {
      return { r: parseInt(h[0] + h[0], 16) / 255, g: parseInt(h[1] + h[1], 16) / 255, b: parseInt(h[2] + h[2], 16) / 255, a: 1 };
    }
    if (h.length === 6) {
      return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 };
    }
    if (h.length === 8) {
      return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: parseInt(h.slice(6, 8), 16) / 255 };
    }
  }
  const rgbM = s.match(/^rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgbM) {
    return { r: +rgbM[1] / 255, g: +rgbM[2] / 255, b: +rgbM[3] / 255, a: rgbM[4] !== undefined ? +rgbM[4] : 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 }; // fallback: black
}

function parseN(s: string | undefined, def = 0): number {
  if (!s) return def;
  const n = parseFloat(s);
  return isNaN(n) ? def : n;
}

function parseOffset(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  if (s.includes('%')) return n / 100;
  return isNaN(n) ? 0 : Math.max(0, Math.min(1, n));
}

function parseSingleTransform(s: string): Tf {
  const m = s.match(/^(\w+)\s*\(([^)]*)\)$/);
  if (!m) return identity();
  const name = m[1].toLowerCase();
  const p = m[2].trim().split(/[\s,]+/).map(Number);
  if (name === 'matrix') return [p[0] ?? 1, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1, p[4] ?? 0, p[5] ?? 0];
  if (name === 'translate') return [1, 0, 0, 1, p[0] ?? 0, p[1] ?? 0];
  if (name === 'scale') { const sx = p[0] ?? 1, sy = p[1] ?? sx; return [sx, 0, 0, sy, 0, 0]; }
  if (name === 'rotate') {
    const ang = ((p[0] ?? 0) * Math.PI) / 180;
    const c = Math.cos(ang), si = Math.sin(ang);
    if (p.length >= 3) {
      const cx = p[1], cy = p[2];
      return [c, si, -si, c, cx - c * cx + si * cy, cy - si * cx - c * cy];
    }
    return [c, si, -si, c, 0, 0];
  }
  if (name === 'skewx') { const t = Math.tan((p[0] ?? 0) * Math.PI / 180); return [1, 0, t, 1, 0, 0]; }
  if (name === 'skewy') { const t = Math.tan((p[0] ?? 0) * Math.PI / 180); return [1, t, 0, 1, 0, 0]; }
  return identity();
}

function parseTransformAttr(s: string | undefined): Tf {
  if (!s) return identity();
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') { if (depth === 0) {} depth++; }
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) { parts.push(s.slice(start, i + 1).trim()); start = i + 1; }
    } else if (depth === 0 && /\w/.test(s[i]) && (i === 0 || !/\w/.test(s[i - 1]))) {
      start = i;
    }
  }
  // SVG: transforms applied left-to-right, so combined = last × ... × first
  let result = identity();
  for (const part of parts) {
    result = compose(parseSingleTransform(part), result);
  }
  return result;
}

// ─── xmlbuilder2 → SvgNode ────────────────────────────────────────────────────

function nodeFromXb2(tag: string, node: unknown): SvgNode {
  const attrs: Record<string, string> = {};
  const children: SvgNode[] = [];
  // Text-only element: xmlbuilder2 may represent <style>text</style> as a plain string value
  if (typeof node === 'string') return { tag, attrs, children, text: node };
  if (!node || typeof node !== 'object') return { tag, attrs, children };
  const n = node as Record<string, unknown>;

  // Attributes: either under "@" key (when # array present) or as "@attrName" keys
  if (n['@'] && typeof n['@'] === 'object') {
    for (const [k, v] of Object.entries(n['@'] as Record<string, unknown>)) {
      attrs[k] = String(v);
    }
  } else {
    for (const [k, v] of Object.entries(n)) {
      if (k.startsWith('@') && k.length > 1) attrs[k.slice(1)] = String(v);
    }
  }

  // Children: either in "#" array (preserves order) or direct properties
  const hash = n['#'];
  let text: string | undefined;
  if (typeof hash === 'string') {
    // Text-only node stored as string: { "#": "text content" }
    text = hash;
  } else if (Array.isArray(hash)) {
    for (const item of hash) {
      if (item === null || item === undefined) continue;
      // Text node in mixed content: may be a plain string or { "$": "text" }
      if (typeof item === 'string') { text = (text ?? '') + item; continue; }
      if (typeof item !== 'object') continue;
      const itemObj = item as Record<string, unknown>;
      if ('$' in itemObj) { text = (text ?? '') + String(itemObj['$']); continue; }
      for (const [childTag, childVal] of Object.entries(itemObj)) {
        if (childTag.startsWith('@')) continue;
        if (Array.isArray(childVal)) {
          for (const cv of childVal) children.push(nodeFromXb2(childTag, cv));
        } else {
          children.push(nodeFromXb2(childTag, childVal));
        }
      }
    }
  } else {
    for (const [k, v] of Object.entries(n)) {
      if (k.startsWith('@') || k === '#') continue;
      if (Array.isArray(v)) {
        for (const item of v) children.push(nodeFromXb2(k, item));
      } else if (typeof v === 'string') {
        // Text-only child element: e.g. <style>.cls-1{fill:red}</style> → "style": ".cls-1{fill:red}"
        children.push(nodeFromXb2(k, v));
      } else if (v && typeof v === 'object') {
        children.push(nodeFromXb2(k, v));
      }
    }
  }
  return { tag, attrs, children, ...(text !== undefined ? { text } : {}) };
}

function parseSvgDom(svgText: string): SvgNode | null {
  try {
    const obj = convert(svgText, { format: 'object' }) as Record<string, unknown>;
    const svgContent = obj['svg'];
    if (!svgContent) return null;
    return nodeFromXb2('svg', svgContent);
  } catch { return null; }
}

// ─── Unsupported element detection ───────────────────────────────────────────

const UNSUPPORTED_TAGS = new Set(['text', 'tspan', 'textPath', 'filter', 'feBlend', 'feComposite',
  'feGaussianBlur', 'feMerge', 'clipPath', 'mask', 'symbol', 'foreignObject', 'image']);

function hasUnsupportedTags(node: SvgNode): boolean {
  const tag = node.tag.toLowerCase().replace(/^svg:/, '');
  if (UNSUPPORTED_TAGS.has(tag)) return true;
  return node.children.some(hasUnsupportedTags);
}

function hasUseWithExternalRef(node: SvgNode): boolean {
  const tag = node.tag.toLowerCase().replace(/^svg:/, '');
  if (tag === 'use') {
    const href = node.attrs['href'] ?? node.attrs['xlink:href'] ?? '';
    if (!href.startsWith('#')) return true; // external ref
  }
  return node.children.some(hasUseWithExternalRef);
}

// ─── CSS class style parser ───────────────────────────────────────────────────
// Parses a minimal subset of CSS rules from SVG <style> blocks.
// Handles: .className, #id, tagName selectors with basic property declarations.
type CssRules = Map<string, Record<string, string>>; // selector → declarations

function parseCssBlock(css: string): CssRules {
  const rules: CssRules = new Map();
  // Strip comments
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Match selector { declarations }
  const ruleRe = /([^{]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css)) !== null) {
    const selectors = m[1].trim().split(',');
    const decls = parseStyleAttr(m[2]);
    for (const sel of selectors) {
      const key = sel.trim();
      if (!key) continue;
      const existing = rules.get(key) ?? {};
      rules.set(key, { ...existing, ...decls });
    }
  }
  return rules;
}

function resolveCssForNode(node: SvgNode, cssRules: CssRules): Record<string, string> {
  const result: Record<string, string> = {};
  const tag = node.tag.toLowerCase().replace(/^svg:/, '');
  const id = node.attrs['id'];
  const classes = (node.attrs['class'] ?? '').split(/\s+/).filter(Boolean);

  // Apply in order: tag < class < id (lower specificity first, higher overwrites)
  const tagDecls = cssRules.get(tag) ?? {};
  Object.assign(result, tagDecls);
  for (const cls of classes) {
    const clsDecls = cssRules.get(`.${cls}`) ?? {};
    Object.assign(result, clsDecls);
  }
  if (id) {
    const idDecls = cssRules.get(`#${id}`) ?? {};
    Object.assign(result, idDecls);
  }
  return result;
}

// ─── Gradient parsing ─────────────────────────────────────────────────────────

function parseStops(node: SvgNode): GradStop[] {
  return node.children
    .filter(c => c.tag.replace(/^svg:/, '') === 'stop')
    .map(c => {
      const style = parseStyleAttr(c.attrs['style'] ?? '');
      const colorStr = style['stop-color'] ?? c.attrs['stop-color'] ?? '#000000';
      const stopOpacity = parseN(style['stop-opacity'] ?? c.attrs['stop-opacity'], 1);
      const color = parseColor(colorStr);
      const rgba: RGBA = color === 'none' || (color as any).gradient
        ? { r: 0, g: 0, b: 0, a: 0 }
        : { ...(color as RGBA), a: (color as RGBA).a * stopOpacity };
      return { offset: parseOffset(c.attrs['offset']), color: rgba };
    });
}

function parseStyleAttr(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    result[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
  }
  return result;
}

function parseCssFromSvg(svgNode: SvgNode): CssRules {
  const all: CssRules = new Map();
  function walk(node: SvgNode): void {
    const tag = node.tag.toLowerCase().replace(/^svg:/, '');
    if (tag === 'style') {
      const content = node.text ?? '';
      const rules = parseCssBlock(content);
      for (const [k, v] of rules) {
        const existing = all.get(k) ?? {};
        all.set(k, { ...existing, ...v });
      }
      return;
    }
    for (const child of node.children) walk(child);
  }
  walk(svgNode);
  return all;
}

function parseDefs(svgNode: SvgNode): Map<string, GradDef> {
  const defs = new Map<string, GradDef>();
  function walk(node: SvgNode): void {
    const tag = node.tag.toLowerCase().replace(/^svg:/, '');
    if (tag === 'lineargradient' || tag === 'linearGradient') {
      const id = node.attrs['id'];
      if (!id) return;
      defs.set(id, {
        type: 'linear',
        x1: parseN(node.attrs['x1'], 0), y1: parseN(node.attrs['y1'], 0),
        x2: parseN(node.attrs['x2'], 1), y2: parseN(node.attrs['y2'], 0),
        stops: parseStops(node),
        units: (node.attrs['gradientUnits'] ?? 'objectBoundingBox') as LinearGradDef['units'],
        tf: parseTransformAttr(node.attrs['gradientTransform']),
      });
    } else if (tag === 'radialgradient' || tag === 'radialGradient') {
      const id = node.attrs['id'];
      if (!id) return;
      const cx = parseN(node.attrs['cx'], 0.5), cy = parseN(node.attrs['cy'], 0.5);
      defs.set(id, {
        type: 'radial',
        cx, cy, r: parseN(node.attrs['r'], 0.5),
        fx: parseN(node.attrs['fx'], cx), fy: parseN(node.attrs['fy'], cy),
        stops: parseStops(node),
        units: (node.attrs['gradientUnits'] ?? 'objectBoundingBox') as RadialGradDef['units'],
        tf: parseTransformAttr(node.attrs['gradientTransform']),
      });
    }
    for (const child of node.children) walk(child);
  }
  walk(svgNode);
  return defs;
}

// ─── SVG path `d` tokenizer ───────────────────────────────────────────────────

function parsePath(d: string): Array<[string, number[]]> {
  const cmds: Array<[string, number[]]> = [];
  const tokens = d.match(/[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  const tok = () => tokens[i++];
  const num = () => parseFloat(tokens[i++] ?? '0');

  while (i < tokens.length) {
    const cmd = tok();
    if (!cmd || /^[-+\d.]/.test(cmd)) { i--; continue; }
    const args: number[] = [];
    while (i < tokens.length && /^[-+\d.]/.test(tokens[i])) args.push(num());
    cmds.push([cmd, args]);
  }
  return cmds;
}

// ─── Arc → cubic bezier conversion ───────────────────────────────────────────
// Based on the SVG arc-to-bezier algorithm (W3C implementation notes)

function arcToCubics(
  x1: number, y1: number, rx: number, ry: number,
  xRot: number, largeArc: number, sweep: number, x2: number, y2: number,
): number[][] {
  const cos = Math.cos((xRot * Math.PI) / 180);
  const sin = Math.sin((xRot * Math.PI) / 180);

  // Step 1: Midpoint in rotated frame
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;

  let rxAbs = Math.abs(rx), ryAbs = Math.abs(ry);
  const x1pSq = x1p * x1p, y1pSq = y1p * y1p;
  const rxSq = rxAbs * rxAbs, rySq = ryAbs * ryAbs;

  // Ensure radii are large enough
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) { const sq = Math.sqrt(lambda); rxAbs *= sq; ryAbs *= sq; }
  const rxSq2 = rxAbs * rxAbs, rySq2 = ryAbs * ryAbs;

  // Step 2: Center in rotated frame
  let num2 = rxSq2 * rySq2 - rxSq2 * y1pSq - rySq2 * x1pSq;
  const den = rxSq2 * y1pSq + rySq2 * x1pSq;
  const sq = den === 0 ? 0 : Math.sqrt(Math.max(0, num2 / den));
  const sign = largeArc === sweep ? -1 : 1;
  const cxp = sign * sq * rxAbs * y1p / ryAbs;
  const cyp = sign * sq * -ryAbs * x1p / rxAbs;

  // Step 3: Center in original frame
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  // Step 4: Angle extent
  function angle(ux: number, uy: number, vx: number, vy: number): number {
    const n = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    if (n === 0) return 0;
    const d = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / n));
    return (ux * vy - uy * vx < 0 ? -1 : 1) * Math.acos(d);
  }

  let theta1 = angle(1, 0, (x1p - cxp) / rxAbs, (y1p - cyp) / ryAbs);
  let dTheta = angle((x1p - cxp) / rxAbs, (y1p - cyp) / ryAbs, (-x1p - cxp) / rxAbs, (-y1p - cyp) / ryAbs);
  if (sweep === 0 && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep === 1 && dTheta < 0) dTheta += 2 * Math.PI;

  // Split into segments of at most π/2
  const n = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const cubics: number[][] = [];
  for (let j = 0; j < n; j++) {
    const t1 = theta1 + j * (dTheta / n);
    const t2 = theta1 + (j + 1) * (dTheta / n);
    const dt = t2 - t1;
    const alpha = (4 / 3) * Math.tan(dt / 4);
    const cosT1 = Math.cos(t1), sinT1 = Math.sin(t1);
    const cosT2 = Math.cos(t2), sinT2 = Math.sin(t2);

    const p1x = cx + cos * rxAbs * cosT1 - sin * ryAbs * sinT1;
    const p1y = cy + sin * rxAbs * cosT1 + cos * ryAbs * sinT1;
    const d1x = cos * rxAbs * (-sinT1) - sin * ryAbs * cosT1;
    const d1y = sin * rxAbs * (-sinT1) + cos * ryAbs * cosT1;
    const cp1x = p1x + alpha * d1x;
    const cp1y = p1y + alpha * d1y;

    const p2x = cx + cos * rxAbs * cosT2 - sin * ryAbs * sinT2;
    const p2y = cy + sin * rxAbs * cosT2 + cos * ryAbs * sinT2;
    const d2x = cos * rxAbs * (-sinT2) - sin * ryAbs * cosT2;
    const d2y = sin * rxAbs * (-sinT2) + cos * ryAbs * cosT2;
    const cp2x = p2x - alpha * d2x;
    const cp2y = p2y - alpha * d2y;

    cubics.push([cp1x, cp1y, cp2x, cp2y, p2x, p2y]);
  }
  return cubics;
}

// ─── Build PDF ops from SVG path ──────────────────────────────────────────────

type MaybeOp = ReturnType<typeof ops.moveTo>;

function buildPathOps(d: string, tf: Tf, vb: ViewBox, block: PdfBlockDto, pdfY: number): MaybeOp[] {
  const scaleX = block.width / vb.width;
  const scaleY = block.height / vb.height;

  function toPdf(sx: number, sy: number): [number, number] {
    const [tx, ty] = applyTf(tf, sx, sy);
    return [
      block.x + (tx - vb.minX) * scaleX,
      pdfY + (vb.minY + vb.height - ty) * scaleY,
    ];
  }

  const result: MaybeOp[] = [];
  const cmds = parsePath(d);
  let cx = 0, cy = 0;      // current point
  let startX = 0, startY = 0; // path start (for Z)
  let prevCpX = 0, prevCpY = 0; // last control point (for S/T)
  let prevCmd = '';

  for (const [cmd, args] of cmds) {
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z' && cmd !== 'Z';
    const baseX = rel ? cx : 0, baseY = rel ? cy : 0;
    let ai = 0;

    switch (cmd.toUpperCase()) {
      case 'M': {
        cx = baseX + args[ai++]; cy = baseY + args[ai++];
        startX = cx; startY = cy;
        const [px, py] = toPdf(cx, cy);
        result.push(ops.moveTo(px, py));
        // Subsequent coords become lineto
        while (ai < args.length) {
          cx = baseX + args[ai++]; cy = baseY + args[ai++];
          const [px2, py2] = toPdf(cx, cy);
          result.push(ops.lineTo(px2, py2));
        }
        break;
      }
      case 'L': {
        while (ai < args.length) {
          cx = baseX + args[ai++]; cy = baseY + args[ai++];
          const [px, py] = toPdf(cx, cy);
          result.push(ops.lineTo(px, py));
        }
        break;
      }
      case 'H': {
        while (ai < args.length) {
          cx = (rel ? cx : 0) + args[ai++];
          const [px, py] = toPdf(cx, cy);
          result.push(ops.lineTo(px, py));
        }
        break;
      }
      case 'V': {
        while (ai < args.length) {
          cy = (rel ? cy : 0) + args[ai++];
          const [px, py] = toPdf(cx, cy);
          result.push(ops.lineTo(px, py));
        }
        break;
      }
      case 'C': {
        while (ai + 5 < args.length || ai + 5 === args.length) {
          const cp1x = baseX + args[ai++], cp1y = baseY + args[ai++];
          const cp2x = baseX + args[ai++], cp2y = baseY + args[ai++];
          cx = baseX + args[ai++]; cy = baseY + args[ai++];
          prevCpX = cp2x; prevCpY = cp2y;
          const [p1x, p1y] = toPdf(cp1x, cp1y);
          const [p2x, p2y] = toPdf(cp2x, cp2y);
          const [px, py] = toPdf(cx, cy);
          result.push(ops.curveTo(p1x, p1y, p2x, p2y, px, py));
          if (ai >= args.length) break;
        }
        break;
      }
      case 'S': {
        while (ai + 3 < args.length || ai + 3 === args.length) {
          const isSmooth = ['C', 'c', 'S', 's'].includes(prevCmd);
          const cp1x = isSmooth ? 2 * cx - prevCpX : cx;
          const cp1y = isSmooth ? 2 * cy - prevCpY : cy;
          const cp2x = baseX + args[ai++], cp2y = baseY + args[ai++];
          cx = baseX + args[ai++]; cy = baseY + args[ai++];
          prevCpX = cp2x; prevCpY = cp2y;
          const [p1x, p1y] = toPdf(cp1x, cp1y);
          const [p2x, p2y] = toPdf(cp2x, cp2y);
          const [px, py] = toPdf(cx, cy);
          result.push(ops.curveTo(p1x, p1y, p2x, p2y, px, py));
          if (ai >= args.length) break;
        }
        break;
      }
      case 'Q': {
        while (ai + 3 < args.length || ai + 3 === args.length) {
          const qcx = baseX + args[ai++], qcy = baseY + args[ai++];
          const qx = baseX + args[ai++], qy = baseY + args[ai++];
          // Convert quadratic to cubic
          const cp1x = cx + (2 / 3) * (qcx - cx);
          const cp1y = cy + (2 / 3) * (qcy - cy);
          const cp2x = qx + (2 / 3) * (qcx - qx);
          const cp2y = qy + (2 / 3) * (qcy - qy);
          prevCpX = qcx; prevCpY = qcy;
          cx = qx; cy = qy;
          const [p1x, p1y] = toPdf(cp1x, cp1y);
          const [p2x, p2y] = toPdf(cp2x, cp2y);
          const [px, py] = toPdf(cx, cy);
          result.push(ops.curveTo(p1x, p1y, p2x, p2y, px, py));
          if (ai >= args.length) break;
        }
        break;
      }
      case 'T': {
        while (ai + 1 < args.length || ai + 1 === args.length) {
          const isSmooth = ['Q', 'q', 'T', 't'].includes(prevCmd);
          const qcx = isSmooth ? 2 * cx - prevCpX : cx;
          const qcy = isSmooth ? 2 * cy - prevCpY : cy;
          const qx = baseX + args[ai++], qy = baseY + args[ai++];
          const cp1x = cx + (2 / 3) * (qcx - cx);
          const cp1y = cy + (2 / 3) * (qcy - cy);
          const cp2x = qx + (2 / 3) * (qcx - qx);
          const cp2y = qy + (2 / 3) * (qcy - qy);
          prevCpX = qcx; prevCpY = qcy;
          cx = qx; cy = qy;
          const [p1x, p1y] = toPdf(cp1x, cp1y);
          const [p2x, p2y] = toPdf(cp2x, cp2y);
          const [px, py] = toPdf(cx, cy);
          result.push(ops.curveTo(p1x, p1y, p2x, p2y, px, py));
          if (ai >= args.length) break;
        }
        break;
      }
      case 'A': {
        while (ai + 6 < args.length || ai + 6 === args.length) {
          const rx = args[ai++], ry = args[ai++];
          const xRot = args[ai++], largeArc = args[ai++], sweep = args[ai++];
          const ex = baseX + args[ai++], ey = baseY + args[ai++];
          const cubics = arcToCubics(cx, cy, rx, ry, xRot, largeArc, sweep, ex, ey);
          for (const [cp1x, cp1y, cp2x, cp2y, epx, epy] of cubics) {
            const [p1x, p1y] = toPdf(cp1x, cp1y);
            const [p2x, p2y] = toPdf(cp2x, cp2y);
            const [px, py] = toPdf(epx, epy);
            result.push(ops.curveTo(p1x, p1y, p2x, p2y, px, py));
          }
          cx = ex; cy = ey;
          if (ai >= args.length) break;
        }
        break;
      }
      case 'Z': {
        result.push(ops.closePath());
        cx = startX; cy = startY;
        break;
      }
    }
    prevCmd = cmd;
  }
  return result;
}

// ─── Shape → path ops converters ─────────────────────────────────────────────

function rectToPath(attrs: Record<string, string>, tf: Tf, vb: ViewBox, block: PdfBlockDto, pdfY: number): MaybeOp[] {
  const x = parseN(attrs['x']), y = parseN(attrs['y']);
  const w = parseN(attrs['width']), h = parseN(attrs['height']);
  if (w <= 0 || h <= 0) return [];
  const rx = parseN(attrs['rx'], parseN(attrs['ry']));
  const ry = parseN(attrs['ry'], rx);
  if (rx <= 0 || ry <= 0) {
    // Simple rectangle
    return buildPathOps(`M${x},${y} H${x+w} V${y+h} H${x} Z`, tf, vb, block, pdfY);
  }
  // Rounded rect
  const rrx = Math.min(rx, w / 2), rry = Math.min(ry, h / 2);
  const d = `M${x+rrx},${y} H${x+w-rrx} A${rrx},${rry},0,0,1,${x+w},${y+rry} V${y+h-rry} A${rrx},${rry},0,0,1,${x+w-rrx},${y+h} H${x+rrx} A${rrx},${rry},0,0,1,${x},${y+h-rry} V${y+rry} A${rrx},${rry},0,0,1,${x+rrx},${y} Z`;
  return buildPathOps(d, tf, vb, block, pdfY);
}

function circleToPath(attrs: Record<string, string>, tf: Tf, vb: ViewBox, block: PdfBlockDto, pdfY: number): MaybeOp[] {
  const cx = parseN(attrs['cx']), cy = parseN(attrs['cy']), r = parseN(attrs['r']);
  if (r <= 0) return [];
  // Approximate circle with 4 cubic bezier curves
  const d = `M${cx+r},${cy} A${r},${r},0,0,1,${cx},${cy+r} A${r},${r},0,0,1,${cx-r},${cy} A${r},${r},0,0,1,${cx},${cy-r} A${r},${r},0,0,1,${cx+r},${cy} Z`;
  return buildPathOps(d, tf, vb, block, pdfY);
}

function ellipseToPath(attrs: Record<string, string>, tf: Tf, vb: ViewBox, block: PdfBlockDto, pdfY: number): MaybeOp[] {
  const cx = parseN(attrs['cx']), cy = parseN(attrs['cy']);
  const rx = parseN(attrs['rx']), ry = parseN(attrs['ry']);
  if (rx <= 0 || ry <= 0) return [];
  const d = `M${cx+rx},${cy} A${rx},${ry},0,0,1,${cx},${cy+ry} A${rx},${ry},0,0,1,${cx-rx},${cy} A${rx},${ry},0,0,1,${cx},${cy-ry} A${rx},${ry},0,0,1,${cx+rx},${cy} Z`;
  return buildPathOps(d, tf, vb, block, pdfY);
}

function lineToPath(attrs: Record<string, string>, tf: Tf, vb: ViewBox, block: PdfBlockDto, pdfY: number): MaybeOp[] {
  const x1 = parseN(attrs['x1']), y1 = parseN(attrs['y1']);
  const x2 = parseN(attrs['x2']), y2 = parseN(attrs['y2']);
  return buildPathOps(`M${x1},${y1} L${x2},${y2}`, tf, vb, block, pdfY);
}

function polyToPath(attrs: Record<string, string>, closed: boolean, tf: Tf, vb: ViewBox, block: PdfBlockDto, pdfY: number): MaybeOp[] {
  const pts = (attrs['points'] ?? '').trim().split(/[\s,]+/).map(Number);
  if (pts.length < 2) return [];
  const coords: string[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) coords.push(`${pts[i]},${pts[i+1]}`);
  const d = `M${coords[0]} L${coords.slice(1).join(' L')}${closed ? ' Z' : ''}`;
  return buildPathOps(d, tf, vb, block, pdfY);
}

// ─── Context inheritance ──────────────────────────────────────────────────────

function resolveCtx(node: SvgNode, parent: Ctx, cssRules: CssRules): Ctx {
  const a = node.attrs;
  // Priority (high to low): inline style > CSS class/id/tag rules > presentation attrs > inherited
  const cssDecls = resolveCssForNode(node, cssRules);
  const inlineStyle = parseStyleAttr(a['style'] ?? '');
  // Merged: inline style wins over CSS class rules
  const merged = { ...cssDecls, ...inlineStyle };
  const get = (prop: string) => merged[prop] ?? a[prop];

  return {
    fill: get('fill') !== undefined ? parseColor(get('fill')) : parent.fill,
    stroke: get('stroke') !== undefined ? parseColor(get('stroke')) : parent.stroke,
    strokeWidth: get('stroke-width') !== undefined ? parseN(get('stroke-width'), parent.strokeWidth) : parent.strokeWidth,
    fillOpacity: get('fill-opacity') !== undefined ? parseN(get('fill-opacity'), 1) : parent.fillOpacity,
    strokeOpacity: get('stroke-opacity') !== undefined ? parseN(get('stroke-opacity'), 1) : parent.strokeOpacity,
    opacity: get('opacity') !== undefined ? parseN(get('opacity'), 1) * parent.opacity : parent.opacity,
    fillRule: (get('fill-rule') === 'evenodd' ? 'evenodd' : parent.fillRule),
  };
}

// ─── Average gradient color (fallback for unsupported gradient use) ───────────

function avgGradColor(stops: GradStop[]): RGBA {
  if (!stops.length) return { r: 0, g: 0, b: 0, a: 1 };
  const c = stops[stops.length >> 1].color;
  return c;
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export class SvgToPdfRenderer {
  /**
   * Try to render SVG as vector in the PDF page. Returns true on success.
   * Returns false if the SVG contains unsupported features → caller should use resvg fallback.
   */
  static renderVector(
    pdf: PDF,
    page: PDFPage,
    block: PdfBlockDto,
    svgBytes: Buffer,
    pdfY: number,
  ): boolean {
    const svgText = svgBytes.toString('utf-8');
    const dom = parseSvgDom(svgText);
    if (!dom) return false;
    if (hasUnsupportedTags(dom) || hasUseWithExternalRef(dom)) return false;

    const vbAttr = dom.attrs['viewBox'] ?? dom.attrs['viewbox'];
    let vb: ViewBox;
    if (vbAttr) {
      const p = vbAttr.trim().split(/[\s,]+/).map(Number);
      vb = { minX: p[0], minY: p[1], width: p[2], height: p[3] };
    } else {
      vb = {
        minX: 0, minY: 0,
        width: parseN(dom.attrs['width'], block.width),
        height: parseN(dom.attrs['height'], block.height),
      };
    }
    if (vb.width <= 0 || vb.height <= 0) return false;

    const defs = parseDefs(dom);
    const cssRules = parseCssFromSvg(dom);
    const renderer = new SvgToPdfRenderer(pdf, page, block, pdfY, vb, defs, cssRules);
    renderer.renderNode(dom, identity(), defaultCtx);
    return true;
  }

  /** Full render with resvg fallback. */
  static render(
    pdf: PDF,
    page: PDFPage,
    block: PdfBlockDto,
    svgBytes: Buffer,
    pdfY: number,
  ): void {
    const ok = SvgToPdfRenderer.renderVector(pdf, page, block, svgBytes, pdfY);
    if (!ok) {
      // Fallback: rasterize with resvg
      const resvg = new Resvg(svgBytes, {
        fitTo: { mode: 'width', value: Math.round(block.width * 2) },
        font: { loadSystemFonts: false },
      });
      const pngBytes = new Uint8Array(resvg.render().asPng());
      const image = pdf.embedImage(pngBytes);
      page.drawImage(image, {
        x: block.x, y: pdfY,
        width: block.width, height: block.height,
      });
    }
  }

  // ── Instance ──────────────────────────────────────────────────────────────

  private readonly pdf: PDF;
  private readonly page: PDFPage;
  private readonly block: PdfBlockDto;
  private readonly pdfY: number;
  private readonly vb: ViewBox;
  private readonly defs: Map<string, GradDef>;
  private readonly cssRules: CssRules;

  private constructor(pdf: PDF, page: PDFPage, block: PdfBlockDto, pdfY: number, vb: ViewBox, defs: Map<string, GradDef>, cssRules: CssRules) {
    this.pdf = pdf;
    this.page = page;
    this.block = block;
    this.pdfY = pdfY;
    this.vb = vb;
    this.defs = defs;
    this.cssRules = cssRules;
  }

  private toPdf(sx: number, sy: number, tf: Tf): [number, number] {
    const { block, pdfY, vb } = this;
    const scaleX = block.width / vb.width;
    const scaleY = block.height / vb.height;
    const [tx, ty] = applyTf(tf, sx, sy);
    return [
      block.x + (tx - vb.minX) * scaleX,
      pdfY + (vb.minY + vb.height - ty) * scaleY,
    ];
  }

  renderNode(node: SvgNode, parentTf: Tf, parentCtx: Ctx): void {
    const tag = node.tag.toLowerCase().replace(/^svg:/, '');
    if (tag === 'defs' || tag === 'lineargradient' || tag === 'radialgradient' || tag === 'stop') return;

    const ownTf = parseTransformAttr(node.attrs['transform'] ?? node.attrs['Transform']);
    const tf = compose(parentTf, ownTf);
    const ctx = resolveCtx(node, parentCtx, this.cssRules);

    if (tag === 'svg' || tag === 'g') {
      for (const child of node.children) this.renderNode(child, tf, ctx);
      return;
    }

    let pathOps: MaybeOp[] = [];
    switch (tag) {
      case 'path': pathOps = buildPathOps(node.attrs['d'] ?? '', tf, this.vb, this.block, this.pdfY); break;
      case 'rect': pathOps = rectToPath(node.attrs, tf, this.vb, this.block, this.pdfY); break;
      case 'circle': pathOps = circleToPath(node.attrs, tf, this.vb, this.block, this.pdfY); break;
      case 'ellipse': pathOps = ellipseToPath(node.attrs, tf, this.vb, this.block, this.pdfY); break;
      case 'line': pathOps = lineToPath(node.attrs, tf, this.vb, this.block, this.pdfY); break;
      case 'polyline': pathOps = polyToPath(node.attrs, false, tf, this.vb, this.block, this.pdfY); break;
      case 'polygon': pathOps = polyToPath(node.attrs, true, tf, this.vb, this.block, this.pdfY); break;
      default: return; // unknown element, skip
    }

    if (pathOps.length === 0) return;
    this.drawShape(pathOps, ctx, node.attrs, tf);
  }

  private drawShape(pathOps: MaybeOp[], ctx: Ctx, attrs: Record<string, string>, tf: Tf): void {
    const { pdf, page, block, pdfY, vb } = this;

    const hasFill = ctx.fill !== 'none' && ctx.fill !== null;
    const hasStroke = ctx.stroke !== 'none' && ctx.stroke !== null && ctx.strokeWidth > 0;

    // Include RGBA color alpha in opacity (e.g. rgba(0,0,255,0.5) has a=0.5)
    const fillColorAlpha = hasFill && !(ctx.fill as any).gradient ? (ctx.fill as RGBA).a : 1;
    const strokeColorAlpha = hasStroke ? (ctx.stroke as RGBA).a : 1;
    const totalFillOpacity = ctx.fillOpacity * ctx.opacity * fillColorAlpha;
    const totalStrokeOpacity = ctx.strokeOpacity * ctx.opacity * strokeColorAlpha;
    if (!hasFill && !hasStroke) return;

    const extraOps: MaybeOp[] = [];

    // ExtGState for opacity
    let gsName: string | undefined;
    if (totalFillOpacity < 1 || totalStrokeOpacity < 1) {
      const extGs = pdf.createExtGState({
        fillOpacity: hasFill ? totalFillOpacity : 1,
        strokeOpacity: hasStroke ? totalStrokeOpacity : 1,
      });
      gsName = page.registerExtGState(extGs);
    }

    const drawOps: MaybeOp[] = [ops.pushGraphicsState()];
    if (gsName) drawOps.push(ops.setGraphicsState(gsName));

    // Fill
    if (hasFill) {
      const fill = ctx.fill;
      if ((fill as any).gradient) {
        const gradName = (fill as any).gradient as string;
        const gradDef = this.defs.get(gradName);
        if (gradDef) {
          this.drawGradientFill(pathOps, gradDef, ctx, tf, drawOps);
        } else {
          // fallback: black
          drawOps.push(ops.setNonStrokingRGB(0, 0, 0));
          drawOps.push(...pathOps);
          const fillOp = ctx.fillRule === 'evenodd' ? ops.fillAndStrokeEvenOdd : ops.fillAndStroke;
          drawOps.push(hasStroke ? ops.fillAndStroke() : ops.fill());
        }
      } else {
        const c = fill as RGBA;
        drawOps.push(ops.setNonStrokingRGB(c.r, c.g, c.b));
        if (hasStroke) {
          const s = ctx.stroke as RGBA;
          drawOps.push(ops.setStrokingRGB(s.r, s.g, s.b));
          const sw = ctx.strokeWidth * (block.width / vb.width);
          drawOps.push(ops.setLineWidth(Math.max(0.1, sw)));
          drawOps.push(...pathOps);
          drawOps.push(ctx.fillRule === 'evenodd' ? ops.fillAndStrokeEvenOdd() : ops.fillAndStroke());
        } else {
          drawOps.push(...pathOps);
          drawOps.push(ctx.fillRule === 'evenodd' ? ops.fillEvenOdd() : ops.fill());
        }
      }
    } else if (hasStroke) {
      const s = ctx.stroke as RGBA;
      drawOps.push(ops.setStrokingRGB(s.r, s.g, s.b));
      const sw = ctx.strokeWidth * (block.width / vb.width);
      drawOps.push(ops.setLineWidth(Math.max(0.1, sw)));
      drawOps.push(...pathOps);
      drawOps.push(ops.stroke());
    }

    drawOps.push(ops.popGraphicsState());
    page.drawOperators(drawOps);
  }

  private drawGradientFill(pathOps: MaybeOp[], gradDef: GradDef, ctx: Ctx, tf: Tf, outOps: MaybeOp[]): void {
    const { pdf, page, block, pdfY, vb } = this;
    const scaleX = block.width / vb.width;
    const scaleY = block.height / vb.height;

    if (!gradDef.stops.length) return;

    const pdfStops = gradDef.stops.map(s => ({ offset: s.offset, color: rgb(s.color.r, s.color.g, s.color.b) }));

    let shading;
    try {
      if (gradDef.type === 'linear') {
        let x1 = gradDef.x1, y1 = gradDef.y1, x2 = gradDef.x2, y2 = gradDef.y2;

        if (gradDef.units === 'objectBoundingBox') {
          // objectBoundingBox: coords are fractions of the shape's bounding box
          // Use block bbox as approximation
          x1 = block.x + x1 * block.width;
          y1 = pdfY + (1 - y1) * block.height;
          x2 = block.x + x2 * block.width;
          y2 = pdfY + (1 - y2) * block.height;
        } else {
          // userSpaceOnUse: coords are in SVG user space — convert to PDF space
          [x1, y1] = this.toPdf(x1, y1, tf);
          [x2, y2] = this.toPdf(x2, y2, tf);
        }

        shading = pdf.createAxialShading({ coords: [x1, y1, x2, y2], stops: pdfStops });
      } else {
        // radial
        let cx = gradDef.cx, cy = gradDef.cy, r = gradDef.r;
        let fx = gradDef.fx, fy = gradDef.fy;

        if (gradDef.units === 'objectBoundingBox') {
          const pdfCx = block.x + cx * block.width;
          const pdfCy = pdfY + (1 - cy) * block.height;
          const pdfR = r * Math.min(block.width, block.height);
          const pdfFx = block.x + fx * block.width;
          const pdfFy = pdfY + (1 - fy) * block.height;
          shading = pdf.createRadialShading({ coords: [pdfFx, pdfFy, 0, pdfCx, pdfCy, pdfR], stops: pdfStops });
        } else {
          const [pdfCx, pdfCy] = this.toPdf(cx, cy, tf);
          const [pdfFx, pdfFy] = this.toPdf(fx, fy, tf);
          const pdfR = r * scaleX; // approximate
          shading = pdf.createRadialShading({ coords: [pdfFx, pdfFy, 0, pdfCx, pdfCy, pdfR], stops: pdfStops });
        }
      }

      const shadingName = page.registerShading(shading);
      outOps.push(...pathOps);
      outOps.push(ctx.fillRule === 'evenodd' ? ops.clipEvenOdd() : ops.clip());
      outOps.push(ops.endPath());
      outOps.push(ops.paintShading(shadingName));
    } catch {
      // Gradient API failed — use average color
      const avg = avgGradColor(gradDef.stops);
      outOps.push(ops.setNonStrokingRGB(avg.r, avg.g, avg.b));
      outOps.push(...pathOps);
      outOps.push(ops.fill());
    }
  }
}
