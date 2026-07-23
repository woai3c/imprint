#!/usr/bin/env node

const { readFile, writeFile } = require("fs").promises;
const path = require("path");

const HELP = `Usage:
  node extract_style_facts.js --input <capture.json> [--output <facts.json>]

Options:
  --input <file>       capture_site.js output.
  --output <file>      Defaults to <input-dir>/style-facts.json.
  --top <number>       Maximum candidates per category (default: 16).
  --help               Show this help.`;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { input: null, output: null, top: 16 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const take = (name) => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail(`${name} requires a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--input":
        options.input = take("--input");
        break;
      case "--output":
        options.output = take("--output");
        break;
      case "--top": {
        const value = Number(take("--top"));
        if (!Number.isInteger(value) || value < 4 || value > 100) fail("--top must be 4 to 100");
        options.top = value;
        break;
      }
      case "--help":
      case "-h":
        console.log(HELP);
        process.exit(0);
        break;
      default:
        fail(`Unknown option: ${arg}`);
    }
  }
  if (!options.input) fail("--input is required");
  options.input = path.resolve(options.input);
  options.output = path.resolve(options.output || path.join(path.dirname(options.input), "style-facts.json"));
  return options;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hexByte(value) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
}

function normalizeColor(value) {
  if (!value || value === "transparent" || value === "currentcolor") return null;
  const hex = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((digit) => digit + digit).join("");
    }
    return `#${digits.toUpperCase()}`;
  }
  const functional = value.match(/^rgba?\((.+)\)$/i);
  if (!functional) return null;
  const values = functional[1].match(/-?\d*\.?\d+%?/g);
  if (!values || values.length < 3) return null;
  const channel = (part) => part.endsWith("%")
    ? (Number(part.slice(0, -1)) / 100) * 255
    : Number(part);
  const [red, green, blue] = values.slice(0, 3).map(channel);
  let alpha = values[3] === undefined
    ? 1
    : values[3].endsWith("%")
      ? Number(values[3].slice(0, -1)) / 100
      : Number(values[3]);
  alpha = clamp(alpha, 0, 1);
  if (alpha === 0) return null;
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}${alpha < 0.999 ? hexByte(alpha * 255) : ""}`;
}

function parsePixels(value) {
  if (!value || value === "normal" || value === "none" || value.includes("%")) return [];
  return [...value.matchAll(/(-?\d*\.?\d+)px\b/g)]
    .map((match) => Math.round(Number(match[1]) * 100) / 100)
    .filter((number) => Number.isFinite(number));
}

function confidenceFor({ count, pages, viewports, direct = false }) {
  if (direct || pages >= 2 && viewports >= 2 && count >= 6) return "high";
  if (count >= 3 || pages >= 2 || viewports >= 2) return "medium";
  return "low";
}

function addAggregate(map, key, context, weight = 1, extra = {}) {
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, {
      value: key,
      count: 0,
      weight: 0,
      pages: new Set(),
      viewports: new Set(),
      properties: new Set(),
      kinds: new Set(),
      ...extra,
    });
  }
  const item = map.get(key);
  item.count += 1;
  item.weight += weight;
  if (context.page) item.pages.add(context.page);
  if (context.viewport) item.viewports.add(context.viewport);
  if (context.property) item.properties.add(context.property);
  if (context.kind) item.kinds.add(context.kind);
}

function finalizeAggregate(map, top, sortBy = "weight") {
  return [...map.values()]
    .map((item) => ({
      ...item,
      weight: Math.round(item.weight * 100) / 100,
      pages: [...item.pages].sort(),
      viewports: [...item.viewports].sort(),
      properties: [...item.properties].sort(),
      kinds: [...item.kinds].sort(),
      confidence: confidenceFor({
        count: item.count,
        pages: item.pages.size,
        viewports: item.viewports.size,
        direct: item.direct,
      }),
    }))
    .sort((a, b) => b[sortBy] - a[sortBy] || b.count - a.count || String(a.value).localeCompare(String(b.value)))
    .slice(0, top);
}

function styleSignature(element) {
  const style = element.style;
  const keys = [
    "font-family", "font-size", "font-weight", "line-height",
    "color", "background-color",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-top-color",
    "border-top-left-radius", "border-top-right-radius",
    "border-bottom-right-radius", "border-bottom-left-radius",
    "box-shadow",
  ];
  return Object.fromEntries(keys.map((key) => [key, style[key]]).filter(([, value]) => value && value !== "none"));
}

function signatureKey(signature) {
  return JSON.stringify(signature);
}

function nearestSpacingBase(values) {
  const positives = values.filter((value) => value >= 2 && value <= 96);
  if (positives.length < 4) return null;
  const candidates = [2, 4, 5, 6, 8, 10];
  let best = null;
  for (const base of candidates) {
    const error = positives.reduce((sum, value) => {
      const multiple = Math.max(1, Math.round(value / base));
      return sum + Math.abs(value - multiple * base);
    }, 0) / positives.length;
    if (!best || error < best.error) best = { base, error };
  }
  return best && best.error <= 1.25
    ? { value: `${best.base}px`, meanAbsoluteError: Math.round(best.error * 100) / 100 }
    : null;
}

function inferSemanticColors(colorCandidates, componentGroups, pages) {
  const byProperty = (predicate) => colorCandidates
    .filter((candidate) => candidate.properties.some(predicate));
  const backgrounds = byProperty((property) => property === "background-color");
  const foregrounds = byProperty((property) => property === "color");
  const borders = byProperty((property) => property.includes("border") || property.includes("outline"));

  const bodyColors = [];
  for (const page of pages) {
    for (const element of page.facts.elements) {
      if (["html", "body"].includes(element.tag)) {
        const background = normalizeColor(element.style["background-color"]);
        const color = normalizeColor(element.style.color);
        if (background) bodyColors.push({ role: "canvas", value: background, page: page.finalUrl });
        if (color) bodyColors.push({ role: "text.primary", value: color, page: page.finalUrl });
      }
    }
  }

  const actionCounts = new Map();
  for (const component of componentGroups.filter((entry) => entry.kind === "button")) {
    const background = normalizeColor(component.style["background-color"]);
    if (background) actionCounts.set(background, (actionCounts.get(background) || 0) + component.count);
  }
  const action = [...actionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const result = [];
  const push = (role, value, reason, confidence = "medium") => {
    if (!value || result.some((item) => item.role === role)) return;
    result.push({ role, value, reason, confidence });
  };
  push("canvas", bodyColors.find((item) => item.role === "canvas")?.value || backgrounds[0]?.value,
    "Dominant page/body background", bodyColors.some((item) => item.role === "canvas") ? "high" : "medium");
  push("text.primary", bodyColors.find((item) => item.role === "text.primary")?.value || foregrounds[0]?.value,
    "Dominant body foreground", bodyColors.some((item) => item.role === "text.primary") ? "high" : "medium");
  push("action.primary", action, "Most repeated button background", action ? "medium" : "low");
  push("border.default", borders[0]?.value, "Most repeated border or outline color", borders[0]?.confidence || "low");
  const secondarySurface = backgrounds.find((item) => item.value !== result.find((entry) => entry.role === "canvas")?.value);
  push("surface", secondarySurface?.value, "Repeated non-canvas background", secondarySurface?.confidence || "low");
  return result;
}

function responsiveFindings(pages) {
  const groups = new Map();
  for (const page of pages) {
    const url = new URL(page.finalUrl);
    const key = `${url.origin}${url.pathname}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(page);
  }
  const findings = [];
  for (const [route, samples] of groups) {
    if (samples.length < 2) continue;
    const ordered = [...samples].sort((a, b) => b.viewport.width - a.viewport.width);
    const widest = ordered[0];
    const narrowest = ordered.at(-1);
    const kinds = ["navigation", "aside", "header", "footer", "card", "button", "input", "table"];
    for (const kind of kinds) {
      const count = (sample) => sample.facts.elements.filter((element) => element.kind === kind).length;
      const wideCount = count(widest);
      const narrowCount = count(narrowest);
      if (wideCount !== narrowCount) {
        findings.push({
          route,
          kind,
          from: { viewport: widest.viewport.name, width: widest.viewport.width, count: wideCount },
          to: { viewport: narrowest.viewport.name, width: narrowest.viewport.width, count: narrowCount },
          observation: narrowCount === 0 && wideCount > 0
            ? `${kind} is absent from the narrow capture`
            : `${kind} instance count changes across captures`,
          confidence: "medium",
        });
      }
    }
    const wideDocument = widest.facts.document;
    const narrowDocument = narrowest.facts.document;
    findings.push({
      route,
      kind: "page",
      from: { viewport: widest.viewport.name, width: widest.viewport.width, scrollHeight: wideDocument.scrollHeight },
      to: { viewport: narrowest.viewport.name, width: narrowest.viewport.width, scrollHeight: narrowDocument.scrollHeight },
      observation: "Document geometry sampled at the widest and narrowest viewports",
      confidence: "high",
    });
  }
  return findings;
}

function collectFacts(capture, top) {
  if (capture.schemaVersion !== "1.0" || !Array.isArray(capture.pages)) {
    fail("Unsupported or invalid capture schema");
  }

  const colors = new Map();
  const typography = new Map();
  const spacing = new Map();
  const radii = new Map();
  const borders = new Map();
  const shadows = new Map();
  const motion = new Map();
  const zIndices = new Map();
  const cssVariables = new Map();
  const mediaQueries = new Map();
  const componentMap = new Map();
  const fontMap = new Map();
  const allSpacingValues = [];

  for (const page of capture.pages) {
    const pageKey = page.finalUrl;
    const viewport = page.viewport.name;
    const viewportArea = page.viewport.width * page.viewport.height;
    const contextBase = { page: pageKey, viewport };

    for (const [name, rawValue] of Object.entries(page.facts.rootVariables || {})) {
      const value = normalizeColor(rawValue) || rawValue;
      const key = `${name}\u0000${value}`;
      if (!cssVariables.has(key)) {
        cssVariables.set(key, {
          name,
          value,
          rawValue,
          count: 0,
          pages: new Set(),
          viewports: new Set(),
          direct: true,
        });
      }
      const item = cssVariables.get(key);
      item.count += 1;
      item.pages.add(pageKey);
      item.viewports.add(viewport);
    }

    for (const query of page.facts.mediaQueries || []) {
      addAggregate(mediaQueries, query, contextBase, 1);
    }
    for (const font of [...(page.facts.fontFaces || []), ...(page.facts.loadedFonts || [])]) {
      const key = `${font.family}|${font.style || "normal"}|${font.weight || "normal"}`;
      addAggregate(fontMap, key, contextBase, 1, {
        family: font.family,
        style: font.style || "normal",
        fontWeight: font.weight || "normal",
      });
    }

    for (const element of page.facts.elements || []) {
      const areaWeight = Math.max(1, Math.min(element.area || 1, viewportArea) / 1_000);
      const context = { ...contextBase, kind: element.kind };
      const style = element.style || {};

      for (const property of [
        "color", "background-color",
        "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
        "outline-color",
      ]) {
        const value = normalizeColor(style[property]);
        if (value) addAggregate(colors, value, { ...context, property }, areaWeight);
      }

      const typeKey = [
        style["font-family"],
        style["font-size"],
        style["font-weight"],
        style["line-height"],
        style["letter-spacing"],
      ].join("|");
      if (style["font-size"]) {
        addAggregate(typography, typeKey, context, Math.max(1, Math.sqrt(areaWeight)), {
          family: style["font-family"],
          size: style["font-size"],
          fontWeight: style["font-weight"],
          lineHeight: style["line-height"],
          letterSpacing: style["letter-spacing"],
        });
      }

      for (const property of [
        "margin-top", "margin-right", "margin-bottom", "margin-left",
        "padding-top", "padding-right", "padding-bottom", "padding-left",
        "gap", "row-gap", "column-gap",
      ]) {
        for (const value of parsePixels(style[property])) {
          if (value >= 0 && value <= 256) {
            addAggregate(spacing, `${value}px`, { ...context, property }, 1);
            if (value > 0) allSpacingValues.push(value);
          }
        }
      }
      for (const property of [
        "border-top-left-radius", "border-top-right-radius",
        "border-bottom-right-radius", "border-bottom-left-radius",
      ]) {
        const value = style[property];
        if (value && value !== "0px") addAggregate(radii, value, { ...context, property }, 1);
      }
      for (const property of [
        "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
      ]) {
        const value = style[property];
        if (value && value !== "0px") addAggregate(borders, value, { ...context, property }, 1);
      }
      if (style["box-shadow"] && style["box-shadow"] !== "none") {
        addAggregate(shadows, style["box-shadow"], context, Math.max(1, Math.sqrt(areaWeight)));
      }
      if (style["transition-duration"] && !/^0(?:s|ms)(?:,\s*0(?:s|ms))*$/.test(style["transition-duration"])) {
        const key = [
          style["transition-property"],
          style["transition-duration"],
          style["transition-timing-function"],
        ].join("|");
        addAggregate(motion, key, context, 1, {
          property: style["transition-property"],
          duration: style["transition-duration"],
          easing: style["transition-timing-function"],
        });
      }
      if (style["z-index"] && style["z-index"] !== "auto") {
        addAggregate(zIndices, style["z-index"], context, 1);
      }

      if (element.kind !== "element") {
        const signature = styleSignature(element);
        const key = `${element.kind}\u0000${signatureKey(signature)}`;
        if (!componentMap.has(key)) {
          componentMap.set(key, {
            kind: element.kind,
            style: signature,
            count: 0,
            pages: new Set(),
            viewports: new Set(),
            widths: [],
            heights: [],
          });
        }
        const component = componentMap.get(key);
        component.count += 1;
        component.pages.add(pageKey);
        component.viewports.add(viewport);
        component.widths.push(element.rect.width);
        component.heights.push(element.rect.height);
      }
    }
  }

  const variableCandidates = [...cssVariables.values()]
    .map((item) => ({
      ...item,
      pages: [...item.pages].sort(),
      viewports: [...item.viewports].sort(),
      confidence: "high",
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, top * 3);

  const componentGroups = [...componentMap.values()]
    .map((component) => {
      const average = (values) => Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
      return {
        kind: component.kind,
        count: component.count,
        pages: [...component.pages].sort(),
        viewports: [...component.viewports].sort(),
        averageSize: {
          width: average(component.widths),
          height: average(component.heights),
        },
        style: component.style,
        confidence: confidenceFor({
          count: component.count,
          pages: component.pages.size,
          viewports: component.viewports.size,
        }),
      };
    })
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
    .slice(0, top * 2);

  const colorCandidates = finalizeAggregate(colors, top);
  const typographyCandidates = finalizeAggregate(typography, top);
  const spacingCandidates = finalizeAggregate(spacing, top, "count");
  const radiusCandidates = finalizeAggregate(radii, top, "count");
  const borderCandidates = finalizeAggregate(borders, top, "count");
  const shadowCandidates = finalizeAggregate(shadows, Math.min(top, 10));
  const motionCandidates = finalizeAggregate(motion, Math.min(top, 10), "count");
  const zIndexCandidates = finalizeAggregate(zIndices, Math.min(top, 10), "count");
  const mediaQueryCandidates = finalizeAggregate(mediaQueries, top, "count");
  const fontCandidates = finalizeAggregate(fontMap, top, "count");

  const statePatterns = [];
  for (const page of capture.pages) {
    for (const state of page.states || []) {
      statePatterns.push({
        page: page.finalUrl,
        viewport: page.viewport.name,
        target: state.target,
        state: state.state,
        difference: state.difference,
        confidence: "high",
      });
    }
  }

  return {
    schemaVersion: "1.0",
    generator: "copy-design/extract_style_facts.js",
    source: {
      ...capture.source,
      capturedAt: capture.capture.startedAt,
      mode: "enhanced",
    },
    coverage: {
      captures: capture.pages.length,
      routes: [...new Set(capture.pages.map((page) => page.finalUrl))],
      viewports: [...new Map(capture.pages.map((page) => [page.viewport.name, page.viewport])).values()],
      safeStates: [...new Set(statePatterns.map((state) => state.state))],
      failedCaptures: capture.errors || [],
      warnings: [...new Set(capture.pages.flatMap((page) => page.warnings || []))],
    },
    tokens: {
      semanticColors: inferSemanticColors(colorCandidates, componentGroups, capture.pages),
      colors: colorCandidates,
      typography: typographyCandidates,
      spacing: spacingCandidates,
      spacingBase: nearestSpacingBase(allSpacingValues),
      radii: radiusCandidates,
      borders: borderCandidates,
      shadows: shadowCandidates,
      motion: motionCandidates,
      zIndex: zIndexCandidates,
      cssVariables: variableCandidates,
      fonts: fontCandidates,
    },
    layouts: capture.pages.map((page) => ({
      page: page.finalUrl,
      viewport: page.viewport,
      document: page.facts.document,
      landmarks: page.facts.elements
        .filter((element) => ["header", "navigation", "main", "aside", "footer"].includes(element.kind))
        .slice(0, 40)
        .map((element) => ({
          kind: element.kind,
          rect: element.rect,
          display: element.style.display,
          position: element.style.position,
          maxWidth: element.style["max-width"],
          padding: [
            element.style["padding-top"],
            element.style["padding-right"],
            element.style["padding-bottom"],
            element.style["padding-left"],
          ],
        })),
    })),
    components: componentGroups,
    responsive: {
      mediaQueries: mediaQueryCandidates,
      observations: responsiveFindings(capture.pages),
    },
    interactionStates: statePatterns,
    evidenceGaps: [
      ...(capture.errors?.length ? ["One or more requested page/viewport captures failed."] : []),
      ...(capture.pages.some((page) => page.facts.unreadableStyleSheets > 0)
        ? ["Some source stylesheets were cross-origin; computed styles remain available."]
        : []),
      "Click, active, submitted, authenticated, destructive, and business-data-dependent states were not triggered automatically.",
      "Semantic token roles are inferred from rendered evidence and should be reviewed before being made mandatory.",
    ],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const capture = JSON.parse(await readFile(options.input, "utf8"));
  const facts = collectFacts(capture, options.top);
  await writeFile(options.output, `${JSON.stringify(facts, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    output: options.output,
    captures: facts.coverage.captures,
    colorCandidates: facts.tokens.colors.length,
    typographyCandidates: facts.tokens.typography.length,
    componentGroups: facts.components.length,
    responsiveObservations: facts.responsive.observations.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(`copy-design extraction failed: ${error.message}`);
  process.exitCode = 1;
});
