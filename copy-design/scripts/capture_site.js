#!/usr/bin/env node

const { spawn } = require("child_process");
const { lookup } = require("dns").promises;
const { existsSync } = require("fs");
const { mkdir, mkdtemp, rm, writeFile } = require("fs").promises;
const net = require("net");
const os = require("os");
const path = require("path");

const DEFAULT_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

const HELP = `Usage:
  node capture_site.js --url <url> [--url <url> ...] [options]

Options:
  --output <dir>               Evidence output directory. Defaults to OS temp.
  --browser-path <path>        Chrome/Edge/Chromium executable.
  --viewports <spec>           desktop:1440x900,tablet:768x1024,mobile:390x844
  --state-limit <number>       Safe hover/focus targets per page (default: 6).
  --timeout-ms <number>        Navigation/browser timeout (default: 30000).
  --settle-ms <number>         Extra layout settle delay (default: 800).
  --allow-private              Allow localhost/private-network URLs.
  --allow-cross-origin         Allow input URLs from more than one origin.
  --help                       Show this help.

The script never clicks elements or submits forms. It captures base, hover, and
focus styles only.`;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    urls: [],
    output: null,
    browserPath: null,
    viewports: DEFAULT_VIEWPORTS,
    stateLimit: 6,
    timeoutMs: 30_000,
    settleMs: 800,
    allowPrivate: false,
    allowCrossOrigin: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const take = (name) => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        fail(`${name} requires a value`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--url":
        options.urls.push(take("--url"));
        break;
      case "--output":
        options.output = take("--output");
        break;
      case "--browser-path":
        options.browserPath = take("--browser-path");
        break;
      case "--viewports":
        options.viewports = parseViewports(take("--viewports"));
        break;
      case "--state-limit":
        options.stateLimit = parseBoundedInteger(take("--state-limit"), 0, 30, "--state-limit");
        break;
      case "--timeout-ms":
        options.timeoutMs = parseBoundedInteger(take("--timeout-ms"), 1_000, 120_000, "--timeout-ms");
        break;
      case "--settle-ms":
        options.settleMs = parseBoundedInteger(take("--settle-ms"), 0, 10_000, "--settle-ms");
        break;
      case "--allow-private":
        options.allowPrivate = true;
        break;
      case "--allow-cross-origin":
        options.allowCrossOrigin = true;
        break;
      case "--help":
      case "-h":
        console.log(HELP);
        process.exit(0);
        break;
      default:
        if (!arg.startsWith("--")) {
          options.urls.push(arg);
        } else {
          fail(`Unknown option: ${arg}`);
        }
    }
  }

  if (options.urls.length === 0) {
    fail("Provide at least one --url");
  }
  return options;
}

function parseBoundedInteger(value, min, max, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    fail(`${name} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function parseViewports(spec) {
  const viewports = spec.split(",").filter(Boolean).map((entry) => {
    const match = entry.trim().match(/^([a-z][a-z0-9-]{0,31}):(\d{2,4})x(\d{2,4})$/i);
    if (!match) {
      fail(`Invalid viewport: ${entry}`);
    }
    const width = parseBoundedInteger(match[2], 240, 3840, "viewport width");
    const height = parseBoundedInteger(match[3], 240, 3840, "viewport height");
    return { name: match[1].toLowerCase(), width, height };
  });
  if (viewports.length === 0 || viewports.length > 8) {
    fail("--viewports must contain 1 to 8 entries");
  }
  return viewports;
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }
  return true;
}

async function validateUrl(raw, allowPrivate) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`Invalid URL: ${raw}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    fail(`Only http/https URLs are supported: ${raw}`);
  }
  if (url.username || url.password) {
    fail("URLs containing embedded credentials are not allowed");
  }

  if (!allowPrivate) {
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      fail(`Private/local URL requires --allow-private: ${hostname}`);
    }
    const addresses = net.isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true });
    if (addresses.some(({ address }) => isPrivateAddress(address))) {
      fail(`Private-network URL requires --allow-private: ${hostname}`);
    }
  }
  return url;
}

function normalizedPublicUrl(raw) {
  const url = new URL(raw);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function executableOnPath(name) {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")
    : [""];
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension.toLowerCase()}`);
      const alternate = path.join(directory, `${name}${extension.toUpperCase()}`);
      if (existsSync(candidate)) return candidate;
      if (existsSync(alternate)) return alternate;
    }
  }
  return null;
}

function findBrowser(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.COPY_DESIGN_BROWSER,
    ...(process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            executableOnPath("google-chrome"),
            executableOnPath("google-chrome-stable"),
            executableOnPath("chromium"),
            executableOnPath("chromium-browser"),
            executableOnPath("microsoft-edge"),
          ]),
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    fail(
      "No Chrome/Edge/Chromium executable found. Pass --browser-path or use the skill's visual-only mode.",
    );
  }
  return path.resolve(found);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchBrowser(browserPath) {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "copy-design-chrome-"));
  const args = [
    "--headless=new",
    "--remote-debugging-pipe",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=Translate,MediaRouter",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--hide-scrollbars",
    "about:blank",
  ];

  const child = spawn(browserPath, args, {
    stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  } catch (error) {
    child.kill();
    await rm(profileDir, { recursive: true, force: true });
    throw error;
  }
  child.stderr.resume();
  return {
    child,
    profileDir,
    pipeWrite: child.stdio[3],
    pipeRead: child.stdio[4],
    async close() {
      if (child.exitCode === null) {
        child.kill();
        await Promise.race([
          new Promise((resolve) => child.once("exit", resolve)),
          delay(1_500),
        ]);
      }
      await rm(profileDir, { recursive: true, force: true });
    },
  };
}

class CdpClient {
  constructor(pipeRead, pipeWrite, timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.pipeRead = pipeRead;
    this.pipeWrite = pipeWrite;
    this.buffer = Buffer.alloc(0);
    this.sessionId = null;
    this.closed = false;
    pipeRead.on("data", (chunk) => this.consume(chunk));
    pipeRead.once("error", (error) => this.fail(error));
    pipeRead.once("close", () => this.fail(new Error("CDP pipe closed")));
    pipeWrite.once("error", (error) => this.fail(error));
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let delimiter;
    while ((delimiter = this.buffer.indexOf(0)) >= 0) {
      const raw = this.buffer.subarray(0, delimiter);
      this.buffer = this.buffer.subarray(delimiter + 1);
      if (raw.length === 0) continue;
      let message;
      try {
        message = JSON.parse(raw.toString("utf8"));
      } catch (error) {
        this.fail(new Error(`Invalid CDP pipe message: ${error.message}`));
        return;
      }
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          pending.reject(new Error(`${message.error.message} (${message.error.code})`));
        } else {
          pending.resolve(message.result);
        }
        continue;
      }
      const callbacks = this.listeners.get(message.method);
      if (callbacks) {
        for (const callback of [...callbacks]) callback(message.params);
      }
    }
  }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async attachToPage() {
    const { targetInfos } = await this.sendBrowser("Target.getTargets");
    let target = targetInfos.find((item) => item.type === "page");
    if (!target) {
      const created = await this.sendBrowser("Target.createTarget", { url: "about:blank" });
      target = { targetId: created.targetId };
    }
    const attached = await this.sendBrowser("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    this.sessionId = attached.sessionId;
  }

  async send(method, params = {}) {
    if (!this.sessionId) throw new Error("CDP page session is not attached");
    return this.sendCommand(method, params, this.sessionId);
  }

  async sendBrowser(method, params = {}) {
    return this.sendCommand(method, params, null);
  }

  async sendCommand(method, params, sessionId) {
    if (this.closed) throw new Error("CDP pipe is closed");
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      try {
        this.pipeWrite.write(`${JSON.stringify(message)}\0`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  waitFor(method, timeoutMs = this.timeoutMs) {
    return new Promise((resolve, reject) => {
      const callbacks = this.listeners.get(method) || new Set();
      let timer;
      const callback = (params) => {
        clearTimeout(timer);
        callbacks.delete(callback);
        resolve(params);
      };
      callbacks.add(callback);
      this.listeners.set(method, callbacks);
      timer = setTimeout(() => {
        callbacks.delete(callback);
        reject(new Error(`CDP event timed out: ${method}`));
      }, timeoutMs);
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.pipeWrite.end();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("CDP client closed"));
    }
    this.pending.clear();
  }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || "Runtime evaluation failed";
    throw new Error(detail);
  }
  return result.result.value;
}

function pageProbe() {
  const STYLE_PROPERTIES = [
    "display", "position", "visibility", "overflow", "overflow-x", "overflow-y", "z-index",
    "width", "height", "min-width", "min-height", "max-width", "max-height",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "gap", "row-gap", "column-gap",
    "grid-template-columns", "grid-template-rows", "grid-auto-flow",
    "flex-direction", "flex-wrap", "align-items", "align-content", "justify-content",
    "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
    "text-align", "text-transform", "text-decoration-line",
    "color", "background-color", "background-image",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-top-left-radius", "border-top-right-radius",
    "border-bottom-right-radius", "border-bottom-left-radius",
    "outline-color", "outline-style", "outline-width", "outline-offset",
    "box-shadow", "opacity", "filter", "backdrop-filter",
    "transform", "transition-property", "transition-duration",
    "transition-timing-function", "transition-delay",
    "animation-name", "animation-duration", "animation-timing-function", "animation-delay",
  ];
  const STATE_PROPERTIES = [
    "color", "background-color",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-width", "border-radius",
    "outline-color", "outline-style", "outline-width", "outline-offset",
    "box-shadow", "opacity", "transform",
    "transition-property", "transition-duration", "transition-timing-function",
  ];

  const round = (value) => Math.round(value * 100) / 100;
  const cleanCssValue = (property, value) => {
    if (!value) return value;
    if (property === "background-image" && value.includes("url(")) {
      return value.replace(/url\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/gi, "url([redacted])");
    }
    return value.length > 500 ? `${value.slice(0, 497)}...` : value;
  };
  const styleSubset = (element, properties = STYLE_PROPERTIES) => {
    const computed = getComputedStyle(element);
    return Object.fromEntries(properties.map((property) => [
      property,
      cleanCssValue(property, computed.getPropertyValue(property).trim()),
    ]));
  };
  const isVisible = (element, computed, rect) => (
    rect.width > 0 &&
    rect.height > 0 &&
    computed.display !== "none" &&
    computed.visibility !== "hidden" &&
    Number(computed.opacity || "1") > 0
  );
  const semanticKind = (element, role) => {
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute("type") || "").toLowerCase();
    const classes = typeof element.className === "string" ? element.className.toLowerCase() : "";
    if (role === "button" || tag === "button" || type === "button" || type === "submit") return "button";
    if (["textbox", "combobox", "searchbox", "spinbutton"].includes(role) || ["input", "select", "textarea"].includes(tag)) return "input";
    if (role === "navigation" || tag === "nav") return "navigation";
    if (role === "dialog") return "dialog";
    if (role === "tab") return "tab";
    if (role === "table" || tag === "table") return "table";
    if (role === "row" || tag === "tr") return "table-row";
    if (role === "list" || ["ul", "ol"].includes(tag)) return "list";
    if (role === "listitem" || tag === "li") return "list-item";
    if (role === "link" || tag === "a") return "link";
    if (tag === "header") return "header";
    if (tag === "footer") return "footer";
    if (tag === "main" || role === "main") return "main";
    if (tag === "aside" || role === "complementary") return "aside";
    if (tag === "article") return "card";
    if (/(^|\s)(card|panel|tile)(\s|$)/.test(classes)) return "card";
    if (/(^|\s)(badge|chip|tag|pill)(\s|$)/.test(classes)) return "badge";
    return "element";
  };
  const safeClassTokens = (element) => {
    if (typeof element.className !== "string") return [];
    return element.className.split(/\s+/)
      .filter((token) => /^[a-zA-Z_][a-zA-Z0-9_:-]{0,63}$/.test(token))
      .filter((token) => !/@|\b(email|user|account|session|token)\b/i.test(token))
      .slice(0, 8);
  };

  const allElements = [...document.querySelectorAll("*")].slice(0, 12_000);
  const elements = [];
  const interactiveElements = [];
  let captureIndex = 0;

  for (const element of allElements) {
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (!isVisible(element, computed, rect)) continue;
    const role = (element.getAttribute("role") || "").toLowerCase();
    const tag = element.tagName.toLowerCase();
    const kind = semanticKind(element, role);
    const entry = {
      tag,
      role: role || null,
      kind,
      type: ["button", "input", "select"].includes(tag)
        ? (element.getAttribute("type") || null)
        : null,
      classes: safeClassTokens(element),
      parentTag: element.parentElement?.tagName.toLowerCase() || null,
      parentRole: element.parentElement?.getAttribute("role") || null,
      depth: (() => {
        let depth = 0;
        let current = element.parentElement;
        while (current && depth < 40) {
          depth += 1;
          current = current.parentElement;
        }
        return depth;
      })(),
      rect: {
        x: round(rect.x),
        y: round(rect.y + window.scrollY),
        viewportY: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
      },
      area: round(Math.min(rect.width * rect.height, window.innerWidth * window.innerHeight * 4)),
      states: {
        disabled: Boolean(element.disabled) || element.getAttribute("aria-disabled") === "true",
        expanded: element.getAttribute("aria-expanded"),
        selected: element.getAttribute("aria-selected"),
        checked: element.getAttribute("aria-checked"),
        current: element.getAttribute("aria-current"),
      },
      style: styleSubset(element),
    };
    elements.push(entry);

    const focusable = (
      ["a", "button", "input", "select", "textarea", "summary"].includes(tag) ||
      ["button", "link", "tab", "menuitem", "switch", "checkbox", "radio"].includes(role) ||
      Number(element.getAttribute("tabindex")) >= 0
    );
    if (focusable && !entry.states.disabled && interactiveElements.length < 40) {
      const id = `c${captureIndex}`;
      captureIndex += 1;
      element.setAttribute("data-copy-design-id", id);
      interactiveElements.push({
        id,
        tag,
        role: role || null,
        kind,
        rect: entry.rect,
        style: styleSubset(element, STATE_PROPERTIES),
      });
    }
    if (elements.length >= 2_500) break;
  }

  const rootComputed = getComputedStyle(document.documentElement);
  const rootVariables = {};
  for (const property of [...rootComputed]) {
    if (property.startsWith("--") && Object.keys(rootVariables).length < 500) {
      rootVariables[property] = cleanCssValue(property, rootComputed.getPropertyValue(property).trim());
    }
  }

  const mediaQueries = new Set();
  const stateSelectors = new Set();
  const fontFaces = [];
  const keyframes = [];
  let unreadableStyleSheets = 0;

  const visitRules = (rules) => {
    for (const rule of [...rules].slice(0, 10_000)) {
      if (rule.type === CSSRule.MEDIA_RULE) {
        mediaQueries.add(rule.conditionText);
        visitRules(rule.cssRules);
      } else if (rule.type === CSSRule.SUPPORTS_RULE || rule.type === CSSRule.LAYER_BLOCK_RULE) {
        if (rule.cssRules) visitRules(rule.cssRules);
      } else if (rule.type === CSSRule.FONT_FACE_RULE) {
        fontFaces.push({
          family: rule.style.getPropertyValue("font-family").replace(/^['"]|['"]$/g, ""),
          style: rule.style.getPropertyValue("font-style") || "normal",
          weight: rule.style.getPropertyValue("font-weight") || "normal",
          display: rule.style.getPropertyValue("font-display") || null,
        });
      } else if (rule.type === CSSRule.KEYFRAMES_RULE) {
        keyframes.push(rule.name);
      } else if (
        rule.type === CSSRule.STYLE_RULE &&
        /:(hover|focus|focus-visible|active|disabled|checked)|\[aria-(expanded|selected|checked)/.test(rule.selectorText || "")
      ) {
        stateSelectors.add((rule.selectorText || "").slice(0, 300));
      }
    }
  };

  for (const sheet of [...document.styleSheets].slice(0, 200)) {
    try {
      visitRules(sheet.cssRules);
    } catch {
      unreadableStyleSheets += 1;
    }
  }

  const loadedFonts = document.fonts
    ? [...document.fonts].slice(0, 200).map((font) => ({
        family: font.family.replace(/^['"]|['"]$/g, ""),
        style: font.style,
        weight: font.weight,
        status: font.status,
      }))
    : [];

  return {
    document: {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      devicePixelRatio: window.devicePixelRatio,
      colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    },
    elements,
    interactives: interactiveElements,
    rootVariables,
    mediaQueries: [...mediaQueries].slice(0, 300),
    stateSelectors: [...stateSelectors].slice(0, 300),
    fontFaces,
    loadedFonts,
    keyframes: [...new Set(keyframes)].slice(0, 200),
    unreadableStyleSheets,
    truncated: allElements.length > elements.length && elements.length >= 2_500,
  };
}

function stateStyleProbe(id) {
  const element = document.querySelector(`[data-copy-design-id="${CSS.escape(id)}"]`);
  if (!element) return null;
  const properties = [
    "color", "background-color",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-width", "border-radius",
    "outline-color", "outline-style", "outline-width", "outline-offset",
    "box-shadow", "opacity", "transform",
    "transition-property", "transition-duration", "transition-timing-function",
  ];
  const computed = getComputedStyle(element);
  return {
    rect: (() => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })(),
    style: Object.fromEntries(properties.map((property) => [
      property,
      computed.getPropertyValue(property).trim(),
    ])),
  };
}

function styleDifference(base, changed) {
  const difference = {};
  for (const [property, value] of Object.entries(changed || {})) {
    if ((base || {})[property] !== value) {
      difference[property] = { from: (base || {})[property] ?? null, to: value };
    }
  }
  return difference;
}

async function collectSafeStates(client, interactives, limit) {
  const states = [];
  for (const target of interactives.slice(0, limit)) {
    const locator = JSON.stringify(target.id);
    const position = await evaluate(
      client,
      `(() => {
        const el = document.querySelector('[data-copy-design-id="' + CSS.escape(${locator}) + '"]');
        if (!el) return null;
        el.scrollIntoView({block: "center", inline: "center", behavior: "instant"});
        const r = el.getBoundingClientRect();
        return {x: r.x + r.width / 2, y: r.y + r.height / 2};
      })()`,
    );
    if (!position) continue;

    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.max(1, position.x),
      y: Math.max(1, position.y),
    });
    await delay(60);
    const hover = await evaluate(client, `(${stateStyleProbe.toString()})(${locator})`);
    const hoverDifference = styleDifference(target.style, hover?.style);
    if (Object.keys(hoverDifference).length > 0) {
      states.push({
        target: { id: target.id, tag: target.tag, role: target.role, kind: target.kind },
        state: "hover",
        difference: hoverDifference,
      });
    }

    const focus = await evaluate(
      client,
      `(() => {
        const el = document.querySelector('[data-copy-design-id="' + CSS.escape(${locator}) + '"]');
        if (!el) return null;
        el.focus({preventScroll: true});
        return (${stateStyleProbe.toString()})(${locator});
      })()`,
    );
    const focusDifference = styleDifference(target.style, focus?.style);
    if (Object.keys(focusDifference).length > 0) {
      states.push({
        target: { id: target.id, tag: target.tag, role: target.role, kind: target.kind },
        state: "focus",
        difference: focusDifference,
      });
    }
    await evaluate(client, `document.activeElement?.blur(); true`);
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  }
  return states;
}

async function captureOne(client, url, viewport, options, screenshotPath) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width < 600,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
  await client.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: "light" },
    ],
  });

  const loadEvent = client.waitFor("Page.loadEventFired", options.timeoutMs);
  const navigation = await client.send("Page.navigate", { url: url.toString() });
  if (navigation.errorText) {
    fail(`Navigation failed: ${navigation.errorText}`);
  }
  try {
    await loadEvent;
  } catch {
    const readyState = await evaluate(client, "document.readyState");
    if (!["interactive", "complete"].includes(readyState)) throw new Error("Page load timed out");
  }

  await evaluate(
    client,
    `(async () => {
      if (document.fonts?.ready) {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 5000))]);
      }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return true;
    })()`,
  );
  await delay(options.settleMs);

  const finalUrl = await evaluate(client, "location.href");
  await validateUrl(finalUrl, options.allowPrivate);
  const facts = await evaluate(client, `(${pageProbe.toString()})()`);
  const states = await collectSafeStates(client, facts.interactives, options.stateLimit);

  await evaluate(
    client,
    `(() => {
      const style = document.createElement("style");
      style.setAttribute("data-copy-design-freeze", "true");
      style.textContent = "*,*::before,*::after{animation-play-state:paused!important;transition-duration:0s!important;caret-color:transparent!important}";
      document.documentElement.appendChild(style);
      window.scrollTo(0, 0);
      return true;
    })()`,
  );
  await delay(100);

  const metrics = await client.send("Page.getLayoutMetrics");
  const content = metrics.cssContentSize || metrics.contentSize;
  const clip = {
    x: 0,
    y: 0,
    width: Math.min(Math.max(content.width, viewport.width), 4_096),
    height: Math.min(Math.max(content.height, viewport.height), 12_000),
    scale: 1,
  };
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip,
  });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  delete facts.interactives;
  return {
    inputUrl: normalizedPublicUrl(url.toString()),
    finalUrl: normalizedPublicUrl(finalUrl),
    viewport,
    screenshot: screenshotPath,
    facts,
    states,
    warnings: [
      ...(facts.unreadableStyleSheets > 0
        ? [`${facts.unreadableStyleSheets} stylesheet(s) were cross-origin or unreadable`]
        : []),
      ...(facts.truncated ? ["Visible element collection reached the 2500-element limit"] : []),
      ...(content.height > 12_000 ? ["Screenshot was capped at 12000 CSS pixels in height"] : []),
    ],
  };
}

function safeFilename(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "page";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const urls = [];
  for (const raw of options.urls) {
    urls.push(await validateUrl(raw, options.allowPrivate));
  }
  const origins = new Set(urls.map((url) => url.origin));
  if (origins.size > 1 && !options.allowCrossOrigin) {
    fail("All input URLs must share one origin unless --allow-cross-origin is set");
  }

  const browserPath = findBrowser(options.browserPath);
  const outputDir = options.output
    ? path.resolve(options.output)
    : await mkdtemp(path.join(os.tmpdir(), "copy-design-evidence-"));
  const screenshotDir = path.join(outputDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });

  const result = {
    schemaVersion: "1.0",
    generator: "copy-design/capture_site.js",
    source: {
      origins: [...origins],
      urls: urls.map((url) => normalizedPublicUrl(url.toString())),
    },
    capture: {
      startedAt: new Date().toISOString(),
      browser: path.basename(browserPath),
      viewports: options.viewports,
      stateLimit: options.stateLimit,
      safeInteractions: ["hover", "focus"],
    },
    pages: [],
    errors: [],
  };

  const browser = await launchBrowser(browserPath);
  let client;
  try {
    client = new CdpClient(browser.pipeRead, browser.pipeWrite, options.timeoutMs);
    await client.attachToPage();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Security.setIgnoreCertificateErrors", { ignore: false });

    let captureNumber = 0;
    for (const url of urls) {
      for (const viewport of options.viewports) {
        captureNumber += 1;
        const filename = `${String(captureNumber).padStart(3, "0")}-${safeFilename(viewport.name)}.png`;
        const screenshotPath = path.join(screenshotDir, filename);
        try {
          const page = await captureOne(client, url, viewport, options, screenshotPath);
          page.screenshot = path.relative(outputDir, screenshotPath).replaceAll(path.sep, "/");
          result.pages.push(page);
        } catch (error) {
          result.errors.push({
            url: normalizedPublicUrl(url.toString()),
            viewport,
            message: error.message,
          });
        }
      }
    }
  } finally {
    client?.close();
    await browser.close();
  }

  result.capture.finishedAt = new Date().toISOString();
  const captureFile = path.join(outputDir, "capture.json");
  await writeFile(captureFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  if (result.pages.length === 0) {
    fail(`All captures failed. Evidence report: ${captureFile}`);
  }
  console.log(JSON.stringify({
    outputDir,
    captureFile,
    successfulCaptures: result.pages.length,
    failedCaptures: result.errors.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(`copy-design capture failed: ${error.message}`);
  process.exitCode = 1;
});
