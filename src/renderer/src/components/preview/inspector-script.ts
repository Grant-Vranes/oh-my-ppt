import { buildElementPickerCoreScript } from './element-picker-core'

export const INSPECTOR_CONSOLE_PREFIX = '__PPT_INSPECTOR__:'

export function buildInspectorInjectScript(options?: {
  mode?: 'inspect' | 'text-edit' | 'animation-select'
}): string {
  const mode =
    options?.mode === 'text-edit'
      ? 'text-edit'
      : options?.mode === 'animation-select'
        ? 'animation-select'
        : 'inspect'
  return `
(() => {
  const STATE_KEY = "__pptInspectorState";
  const STYLE_ID = "ppt-inspector-style";
  const OVERLAY_ID = "ppt-inspector-highlight-overlay";
  const HIGHLIGHT_CLASS = "ppt-inspector-highlight";
  const LOG_PREFIX = "${INSPECTOR_CONSOLE_PREFIX}";
  const MODE = "${mode}";
  const TEXT_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "span", "strong", "em", "b", "i", "small", "label", "button", "td", "th", "blockquote", "figcaption"]);
  const EDITABLE_TEXT_CHILD_TAGS = new Set([...TEXT_TAGS, "a", "code", "sub", "sup", "u", "s", "br"]);
  const BLOCKED_TEXT_TAGS = new Set(["script", "style", "svg", "canvas", "img", "video", "audio", "input", "textarea", "select", "option"]);
  const SCAFFOLD_BLOCK_IDS = new Set(["content", "page", "root"]);
  const uiMessage = (zh, en) => {
    try {
      return window.localStorage.getItem("oh-my-ppt:lang") === "en" ? en : zh;
    } catch (_error) {
      return zh;
    }
  };

  const state = window[STATE_KEY];
  if (state && state.active) return;

  const cssEscape = (value) => {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\\\" + ch);
  };

  const attrEscape = (value) => String(value).replace(/"/g, '\\\\"');

  const isUniqueSelector = (selector) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (_error) {
      return false;
    }
  };

  const getPageScopeSelector = () => {
    const pageId = document.body ? document.body.getAttribute("data-page-id") : "";
    if (pageId) {
      const byId = "#" + cssEscape(pageId);
      try {
        if (document.querySelector(byId)) return byId;
      } catch (_error) {}
      return 'body[data-page-id="' + attrEscape(pageId) + '"]';
    }
    return "body";
  };

  const getClassList = (el) =>
    Array.from(el.classList || [])
      .filter((item) => item && !item.startsWith("ppt-inspector-") && !item.includes(":"))
      .slice(0, 3);

  const buildSegment = (el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute("id");
    if (id) return "#" + cssEscape(id);
    const role = el.getAttribute("data-role");
    if (role) return tag + '[data-role="' + attrEscape(role) + '"]';
    const blockId = el.getAttribute("data-block-id");
    if (blockId) return tag + '[data-block-id="' + attrEscape(blockId) + '"]';
    const classes = getClassList(el);
    if (classes.length > 0) {
      return tag + "." + classes.map((item) => cssEscape(item)).join(".");
    }
    return tag;
  };

  const buildScopedSelector = (scope, el) => {
    const levels = [];
    let cursor = el;
    while (
      cursor &&
      cursor instanceof Element &&
      cursor !== document.body &&
      cursor !== document.documentElement &&
      levels.length < 3
    ) {
      levels.unshift(buildSegment(cursor));
      cursor = cursor.parentElement;
    }

    const candidates = [];
    if (levels.length >= 1) {
      candidates.push(scope + " " + levels[levels.length - 1]);
    }
    if (levels.length >= 2) {
      candidates.push(scope + " " + levels[levels.length - 2] + " > " + levels[levels.length - 1]);
    }
    if (levels.length >= 3) {
      candidates.push(scope + " " + levels[levels.length - 3] + " > " + levels[levels.length - 2] + " > " + levels[levels.length - 1]);
    }

    for (const candidate of candidates) {
      if (isUniqueSelector(candidate)) return candidate;
    }

    return candidates[candidates.length - 1] || (scope + " " + buildSegment(el));
  };

  const buildStableSelector = (el) => {
    if (!(el instanceof Element)) return null;
    const scope = getPageScopeSelector();

    const blockId = el.getAttribute("data-block-id");
    if (blockId) {
      const selector = scope + ' [data-block-id="' + attrEscape(blockId) + '"]';
      if (isUniqueSelector(selector)) return selector;
    }

    const role = el.getAttribute("data-role");
    if (role) {
      const owner = el.closest("[data-block-id]");
      const ownerBlockId = owner ? owner.getAttribute("data-block-id") : "";
      if (ownerBlockId) {
        const roleSelector =
          scope +
          ' [data-block-id="' +
          attrEscape(ownerBlockId) +
          '"] [data-role="' +
          attrEscape(role) +
          '"]';
        if (isUniqueSelector(roleSelector)) return roleSelector;
      }
    }

    const idValue = el.getAttribute("id");
    if (idValue) {
      const idSelector = scope + " #" + cssEscape(idValue);
      if (isUniqueSelector(idSelector)) return idSelector;
      return idSelector;
    }

    const root = el.closest("[data-ppt-guard-root='1'], .ppt-page-root");
    if (root) {
      const rootSelector = root.getAttribute("data-ppt-guard-root") === "1"
        ? '[data-ppt-guard-root="1"]'
        : ".ppt-page-root";
      const segments = [];
      let current = el;
      while (current && current !== root) {
        const parent = current.parentElement;
        if (!parent) break;
        const index = Array.prototype.indexOf.call(parent.children, current);
        if (index < 0) break;
        const tag = current.tagName ? current.tagName.toLowerCase() : "*";
        segments.unshift(tag + ":nth-child(" + (index + 1) + ")");
        current = parent;
      }
      if (current === root && segments.length > 0) {
        const selector = scope + " " + rootSelector + " " + segments.join(" > ");
        if (isUniqueSelector(selector)) return selector;
      }
    }

    return buildScopedSelector(scope, el);
  };

  const isInsidePageRoot = (element) => {
    return element && (element.closest(".ppt-page-root") !== null || element.closest("[data-ppt-guard-root='1']") !== null);
  };

  const getPageRoot = (element) => {
    return element && element.closest(".ppt-page-root, [data-ppt-guard-root='1']");
  };

  const getContentRoot = (element) => {
    return element && element.closest('[data-block-id="content"], [data-role="content"]');
  };

  const isScaffoldBlock = (element) => {
    if (!(element instanceof Element)) return false;
    const blockId = element.getAttribute("data-block-id");
    const role = element.getAttribute("data-role");
    return (
      SCAFFOLD_BLOCK_IDS.has(String(blockId || "")) ||
      role === "content" ||
      element.classList.contains("ppt-page-root") ||
      element.classList.contains("ppt-page-fit-scope") ||
      element.classList.contains("ppt-page-content") ||
      element.getAttribute("data-ppt-guard-root") === "1" ||
      element.tagName === "BODY" ||
      element.tagName === "HTML"
    );
  };

  const isRenderedFormulaNode = (element) => {
    if (!(element instanceof Element)) return false;
    return Boolean(element.closest(".katex, .katex-display, math, annotation, semantics"));
  };

  const isBlockLikeElement = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const tag = element.tagName ? element.tagName.toLowerCase() : "";
    if (["div", "p", "section", "article", "figure", "figcaption", "li", "td", "th", "span"].includes(tag)) {
      return true;
    }
    const display = window.getComputedStyle(element).display;
    return display.includes("block") || display.includes("flex") || display.includes("grid") || display.includes("table");
  };

  const findAtomicHost = (origin, atomicSelector) => {
    if (!(origin instanceof Element)) return null;
    const atomic = origin.closest(atomicSelector);
    if (!atomic || !isInsidePageRoot(atomic)) return null;
    const contentRoot = getContentRoot(atomic) || getPageRoot(atomic);
    if (!contentRoot) return null;

    const stableOwner = atomic.closest("[data-block-id]");
    if (stableOwner && stableOwner !== contentRoot && !isScaffoldBlock(stableOwner) && buildStableSelector(stableOwner)) {
      return stableOwner;
    }

    let candidate = atomic.parentElement;
    while (candidate && candidate !== contentRoot) {
      if (!isScaffoldBlock(candidate) && isBlockLikeElement(candidate) && buildStableSelector(candidate)) {
        return candidate;
      }
      candidate = candidate.parentElement;
    }

    return null;
  };

  const normalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();

  const readDelimitedFormula = (text) => {
    const trimmed = String(text || "").trim();
    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      return { latex: trimmed.slice(2, -2).trim(), displayMode: true };
    }
    const displayStart = text.indexOf("$$");
    const displayEnd = displayStart >= 0 ? text.indexOf("$$", displayStart + 2) : -1;
    if (displayStart >= 0 && displayEnd > displayStart) {
      return { latex: text.slice(displayStart + 2, displayEnd).trim(), displayMode: true };
    }
    const bracketStart = text.indexOf("\\\\[");
    const bracketEnd = bracketStart >= 0 ? text.indexOf("\\\\]", bracketStart + 2) : -1;
    if (bracketStart >= 0 && bracketEnd > bracketStart) {
      return { latex: text.slice(bracketStart + 2, bracketEnd).trim(), displayMode: true };
    }
    const inlineStart = text.indexOf("\\\\(");
    const inlineEnd = inlineStart >= 0 ? text.indexOf("\\\\)", inlineStart + 2) : -1;
    if (inlineStart >= 0 && inlineEnd > inlineStart) {
      return { latex: text.slice(inlineStart + 2, inlineEnd).trim(), displayMode: false };
    }
    const singleStart = text.indexOf("$");
    const singleEnd = singleStart >= 0 ? text.indexOf("$", singleStart + 1) : -1;
    if (singleStart >= 0 && singleEnd > singleStart) {
      return { latex: text.slice(singleStart + 1, singleEnd).trim(), displayMode: false };
    }
    return { latex: "", displayMode: false };
  };

  const readFormulaMetadata = (element) => {
    if (!(element instanceof Element)) return undefined;
    const rendered = element.matches(".katex, .katex-display")
      ? element
      : element.querySelector(".katex, .katex-display");
    const sourceHolder = rendered || element;
    const explicitLatex =
      sourceHolder.getAttribute("data-ppt-formula-latex") ||
      element.getAttribute("data-ppt-formula-latex") ||
      "";
    const annotation = rendered
      ? rendered.querySelector('annotation[encoding="application/x-tex"]')
      : element.querySelector('annotation[encoding="application/x-tex"]');
    let latex = explicitLatex || (annotation ? annotation.textContent || "" : "");
    let sourceDisplayMode = false;
    if (!latex) {
      const text = element.textContent || "";
      const delimited = readDelimitedFormula(text);
      if (!delimited.latex) return undefined;
      latex = delimited.latex.trim();
      sourceDisplayMode = delimited.displayMode;
    }
    if (!latex) return undefined;
    const clone = (rendered || element).cloneNode(true);
    if (clone instanceof Element) {
      clone.classList.remove(HIGHLIGHT_CLASS);
      clone.querySelectorAll("." + HIGHLIGHT_CLASS).forEach((child) => {
        if (child instanceof Element) child.classList.remove(HIGHLIGHT_CLASS);
      });
    }
    const html = rendered ? clone.outerHTML || "" : clone.innerHTML || "";
    const displayMode =
      sourceHolder.getAttribute("data-ppt-formula-display") === "true" ||
      sourceHolder.classList.contains("katex-display") ||
      sourceDisplayMode;
    return { latex: latex.trim(), html, displayMode };
  };

  const hasOnlyEditableTextChildren = (element) => {
    return Array.from(element.children || []).every((child) => {
      const tag = child.tagName ? child.tagName.toLowerCase() : "";
      if (!EDITABLE_TEXT_CHILD_TAGS.has(tag)) return false;
      return hasOnlyEditableTextChildren(child);
    });
  };

  const isEditableTextTarget = (element) => {
    if (!(element instanceof Element)) return false;
    const tag = element.tagName ? element.tagName.toLowerCase() : "";
    if (!tag || BLOCKED_TEXT_TAGS.has(tag)) return false;
    if (isRenderedFormulaNode(element)) return false;
    if (element.closest("svg, canvas, script, style")) return false;
    if (!hasOnlyEditableTextChildren(element)) return false;
    if (!TEXT_TAGS.has(tag) && !element.getAttribute("data-role") && !element.getAttribute("data-block-id")) return false;
    const text = normalizeText(element.textContent);
    if (!text || text.length > 500) return false;
    return true;
  };

  const isUsableTarget = (element) => {
    if (!(element instanceof Element)) return false;
    if (!isInsidePageRoot(element)) return false;
    if (isScaffoldBlock(element)) return false;
    if (["SCRIPT", "STYLE", "LINK", "META", "TITLE"].includes(element.tagName)) return false;
    if (isRenderedFormulaNode(element)) return false;
    if (element.closest("svg")) return false;
    if (["CANVAS", "IFRAME"].includes(element.tagName)) return false;
    const boundaryRoot = getContentRoot(element) || getPageRoot(element);
    if (!boundaryRoot || element === boundaryRoot) return false;
    if (MODE === "text-edit" && !isEditableTextTarget(element)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2;
  };

  const isGeneratedBackgroundTarget = (element) => {
    if (!(element instanceof Element)) return false;
    return Boolean(element.closest('[data-ppt-generated-background="1"]'));
  };

  const pickWithoutGeneratedBackground = (origin, clientX, clientY, pickAtPointBase) => {
    const backgrounds = Array.from(document.querySelectorAll('[data-ppt-generated-background="1"]'))
      .filter((element) => element instanceof HTMLElement);
    if (backgrounds.length === 0) return null;
    const previousVisibility = backgrounds.map((element) => element.style.visibility);
    try {
      backgrounds.forEach((element) => {
        element.style.visibility = "hidden";
      });
      const alternate = pickAtPointBase(origin, clientX, clientY);
      return alternate && !isGeneratedBackgroundTarget(alternate) ? alternate : null;
    } finally {
      backgrounds.forEach((element, index) => {
        element.style.visibility = previousVisibility[index] || "";
      });
    }
  };

  const promoteToWrapper = (element) => {
    if (element.getAttribute("data-block-id")) return element;
    const contentRoot = getContentRoot(element);
    if (!contentRoot) return element;
    let candidate = element.parentElement;
    while (candidate && candidate !== contentRoot) {
      if (isScaffoldBlock(candidate)) break;
      const hasBlockChildren = candidate.querySelectorAll("[data-block-id]").length >= 2;
      const noBlockId = !candidate.getAttribute("data-block-id");
      if (noBlockId && hasBlockChildren && buildStableSelector(candidate)) {
        return candidate;
      }
      candidate = candidate.parentElement;
    }
    return element;
  };

  ${buildElementPickerCoreScript()}

  const elementPicker = createPptElementPicker({
    getPageRoot,
    getContentRoot,
    isSelectable: isUsableTarget,
    getSelector: buildStableSelector,
    resolveTarget: ({ origin, clientX, clientY, target, pickAtPointBase }) => {
      const formulaTarget =
        pickFormulaTarget(origin) ||
        pickFormulaTarget(target) ||
        pickFormulaTargetAtPoint(origin, clientX, clientY) ||
        pickFormulaTargetAtPoint(target, clientX, clientY);
      if (formulaTarget) return formulaTarget;
      if (!isGeneratedBackgroundTarget(target)) return target;
      return pickWithoutGeneratedBackground(origin, clientX, clientY, pickAtPointBase) || target;
    }
  });

  const getPointTarget = (origin, clientX, clientY) => {
    return elementPicker.pickAtPoint(origin, clientX, clientY);
  };

  const pickCanvasTarget = (origin) => {
    if (!(origin instanceof Element) || MODE === "text-edit") return null;
    const canvas = origin.closest("canvas");
    if (!canvas || !isInsidePageRoot(canvas)) return null;
    const frame = canvas.closest(".ppt-chart-frame, [data-block-id*='chart'], [data-block-id*='graph'], [data-block-id*='plot']");
    if (frame && !isScaffoldBlock(frame) && buildStableSelector(frame)) return frame;
    const owner = canvas.closest("[data-block-id]");
    if (owner && !isScaffoldBlock(owner) && buildStableSelector(owner)) return owner;
    return findAtomicHost(canvas, "canvas");
  };

  const pickFormulaTarget = (origin) => {
    if (!(origin instanceof Element) || MODE === "text-edit") return null;
    let candidate = origin;
    let formula = null;
    while (candidate && candidate instanceof Element) {
      if (candidate.classList.contains("katex")) {
        formula = candidate;
        break;
      }
      if (!formula && candidate.classList.contains("katex-display")) formula = candidate;
      const parent = candidate.parentElement || candidate.parentNode;
      candidate = parent && parent.nodeType === Node.ELEMENT_NODE ? parent : null;
    }
    if (!formula || !isInsidePageRoot(formula)) return null;
    const insertedHost = formula.closest('[data-ppt-edit-kind="formula"][data-block-id]');
    if (insertedHost && isInsidePageRoot(insertedHost)) return insertedHost;
    return formula;
  };

  // Keep this formula hit-test block in sync with edit-mode-script.ts.
  const getFormulaHitElement = (formula) => {
    if (!(formula instanceof Element)) return null;
    const htmlLayer = formula.querySelector(".katex-html");
    if (htmlLayer instanceof Element) return htmlLayer;
    if (formula.classList.contains("katex-display")) {
      const innerKatex = formula.querySelector(".katex");
      if (innerKatex instanceof Element) return innerKatex;
    }
    return formula;
  };

  const getFormulaHitBounds = (formula) => {
    const hitElement = getFormulaHitElement(formula);
    if (!(hitElement instanceof Element)) return null;
    const base = hitElement.getBoundingClientRect();
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const includeRect = (rect) => {
      if (!rect || (rect.width < 0.5 && rect.height < 0.5)) return;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    };
    Array.from(hitElement.getClientRects ? hitElement.getClientRects() : [base]).forEach(includeRect);
    hitElement.querySelectorAll("*").forEach((child) => {
      if (!(child instanceof Element)) return;
      if (child.closest(".katex-mathml")) return;
      Array.from(child.getClientRects ? child.getClientRects() : [child.getBoundingClientRect()]).forEach(includeRect);
    });
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
      return {
        left: base.left,
        top: base.top,
        right: base.right,
        bottom: base.bottom,
        width: Math.max(1, base.width),
        height: Math.max(1, base.height),
      };
    }
    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  };

  const isPointInsideFormulaBounds = (formula, clientX, clientY) => {
    const bounds = getFormulaHitBounds(formula);
    if (!bounds) return false;
    return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
  };

  const pickFormulaTargetAtPoint = (origin, clientX, clientY) => {
    if (!(origin instanceof Element) || MODE === "text-edit" || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const root = getPageRoot(origin);
    if (!root) return null;
    const formulas = [];
    const addFormula = (formula) => {
      if (!(formula instanceof Element)) return;
      const target = formula.classList.contains("katex-display")
        ? formula.querySelector(".katex") || formula
        : formula;
      if (!(target instanceof Element) || !isInsidePageRoot(target) || formulas.includes(target)) return;
      if (isPointInsideFormulaBounds(target, clientX, clientY)) formulas.push(target);
    };
    if (origin.matches(".katex, .katex-display")) addFormula(origin);
    origin.querySelectorAll(".katex, .katex-display").forEach(addFormula);
    if (!formulas.length && root !== origin) {
      root.querySelectorAll(".katex, .katex-display").forEach(addFormula);
    }
    if (!formulas.length) return null;
    formulas.sort((a, b) => {
      const aBounds = getFormulaHitBounds(a);
      const bBounds = getFormulaHitBounds(b);
      const aArea = (aBounds?.width || Number.MAX_SAFE_INTEGER) * (aBounds?.height || Number.MAX_SAFE_INTEGER);
      const bArea = (bBounds?.width || Number.MAX_SAFE_INTEGER) * (bBounds?.height || Number.MAX_SAFE_INTEGER);
      if (aArea !== bArea) return aArea - bArea;
      if (a.classList.contains("katex") && !b.classList.contains("katex")) return -1;
      if (!a.classList.contains("katex") && b.classList.contains("katex")) return 1;
      return 0;
    });
    const formula = formulas[0] || null;
    const insertedHost = formula ? formula.closest('[data-ppt-edit-kind="formula"][data-block-id]') : null;
    return insertedHost && isInsidePageRoot(insertedHost) ? insertedHost : formula;
  };

  const pickSvgTarget = (origin) => {
    if (!(origin instanceof Element) || MODE === "text-edit") return null;
    return findAtomicHost(origin, "svg");
  };

  const pickArtTextTarget = (origin) => {
    if (!(origin instanceof Element)) return null;
    const host = origin.closest("[data-ppt-art-text][data-block-id]");
    if (host && isInsidePageRoot(host) && !isScaffoldBlock(host) && buildStableSelector(host)) {
      return host;
    }
    return null;
  };

  const pickLooseContentTarget = (origin) => {
    if (!(origin instanceof Element)) return null;
    let candidate = origin;
    const boundaryRoot = getContentRoot(origin) || getPageRoot(origin);
    while (candidate && candidate !== boundaryRoot) {
      if (isUsableTarget(candidate) && buildStableSelector(candidate)) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  };

  const pickTarget = (origin, clientX, clientY) => {
    if (!(origin instanceof Element)) return null;
    const artTextTarget = pickArtTextTarget(origin);
    if (artTextTarget) return artTextTarget;
    const atomicTarget = pickCanvasTarget(origin) || pickFormulaTarget(origin) || pickSvgTarget(origin);
    if (atomicTarget) return atomicTarget;

    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const originFormulaTarget = pickFormulaTargetAtPoint(origin, clientX, clientY);
      if (originFormulaTarget) return originFormulaTarget;
      const pointTarget = getPointTarget(origin, clientX, clientY);
      const artTextPointTarget = pickArtTextTarget(pointTarget);
      if (artTextPointTarget) return artTextPointTarget;
      const atomicPointTarget =
        pickCanvasTarget(pointTarget) ||
        pickFormulaTarget(pointTarget) ||
        pickFormulaTargetAtPoint(pointTarget, clientX, clientY) ||
        pickSvgTarget(pointTarget);
      if (atomicPointTarget) return atomicPointTarget;
      if (pointTarget) return promoteToWrapper(pointTarget);
    }

    const looseTarget = pickLooseContentTarget(origin);
    if (looseTarget) return promoteToWrapper(looseTarget);

    const blocks = Array.from(origin.closest(".ppt-page-root, [data-ppt-guard-root='1']")?.querySelectorAll("[data-block-id]") || []);
    const target = origin.closest("[data-block-id]");
    if (target && blocks.includes(target) && isInsidePageRoot(target) && !isScaffoldBlock(target)) {
      return target;
    }
    return null;
  };

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    const highlightColor = MODE === "text-edit" ? "#16a34a" : "#3b82f6";
    style.textContent = \`
      \${shouldFreezeMotion ? 'html, body, body * {\\n        animation: none !important;\\n        transition: none !important;\\n      }\\n' : ''}
      .\${HIGHLIGHT_CLASS} {
        cursor: \${MODE === "text-edit" ? "text" : "crosshair"} !important;
      }
      #\${OVERLAY_ID} {
        position: fixed !important;
        z-index: 2147483646 !important;
        pointer-events: none !important;
        border: 2px dashed \${highlightColor} !important;
        box-shadow: 0 0 0 3px \${MODE === "text-edit" ? "rgba(22,163,74,0.14)" : "rgba(59,130,246,0.14)"} !important;
        box-sizing: border-box !important;
      }
    \`;
    document.head.appendChild(style);
  };

  let activeElement = null;
  let lockedElement = null;
  let highlightOverlayElement = null;
  const restoredAnimationStyles = [];
  const cursorHost = document.body || document.documentElement;
  const previousCursor = cursorHost && cursorHost.style ? cursorHost.style.cursor : "";
  if (cursorHost && cursorHost.style) {
    cursorHost.style.cursor = MODE === "text-edit" ? "text" : "crosshair";
  }
  const shouldFreezeMotion = MODE === "inspect";
  ensureStyle();

  const freezeAnimationsForInspect = () => {
    if (!shouldFreezeMotion) return;
    if (window.PPT && typeof window.PPT.finishAnimations === "function") {
      try { window.PPT.finishAnimations(); } catch (_error) {}
    } else if (window.PPT && typeof window.PPT.stopAnimations === "function") {
      try { window.PPT.stopAnimations(); } catch (_error) {}
    }
    try {
      document.getAnimations?.().forEach((animation) => {
        try {
          if (typeof animation.finish === "function") animation.finish();
          else if (typeof animation.cancel === "function") animation.cancel();
        } catch (_error) {
          try { animation.cancel(); } catch (_cancelError) {}
        }
      });
    } catch (_error) {}
    const forceVisibleIfMotionStopped = (el) => {
      if (!(el instanceof HTMLElement)) return;
      const s = el.style;
      const computed = getComputedStyle(el);
      const inlineOpacity = s.opacity.trim();
      const inlineOpacityNumber = inlineOpacity ? Number(inlineOpacity) : NaN;
      const hasMotionMarker =
        el.matches("[data-anim], [data-anime], [data-animate], [data-ppt-anim-initialized='1'], .opacity-0");
      const hasInitialHiddenOpacity =
        inlineOpacity &&
        Number.isFinite(inlineOpacityNumber) &&
        inlineOpacityNumber <= 0.04;
      const motionMarked =
        hasMotionMarker ||
        hasInitialHiddenOpacity;
      if (motionMarked && Number(computed.opacity || "1") < 0.98) {
        s.opacity = "1";
      }
      if (
        motionMarked &&
        inlineOpacity &&
        /(translate|scale)\\(/i.test(s.transform || "")
      ) {
        s.transform = "";
      }
    }
    const root = document.querySelector(".ppt-page-root, [data-ppt-guard-root='1']");
    if (!root) return;
    root.querySelectorAll("[style]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      const s = el.style;
      if (s.transition && (s.transition.includes("transform") || s.transition.includes("opacity"))) {
        s.transition = "";
      }
      forceVisibleIfMotionStopped(el);
    });
    root.querySelectorAll("[data-ppt-anim-initialized='1']").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      restoredAnimationStyles.push({
        el,
        opacity: el.style.opacity,
        transform: el.style.transform,
      });
      el.style.opacity = "";
      el.style.transform = "";
    });
    root
      .querySelectorAll("[data-anim], [data-anime], [data-animate], .opacity-0")
      .forEach(forceVisibleIfMotionStopped);
  };

  const restoreFrozenAnimationStyles = () => {
    restoredAnimationStyles.forEach((entry) => {
      if (!entry.el || !entry.el.isConnected) return;
      entry.el.style.opacity = entry.opacity;
      entry.el.style.transform = entry.transform;
    });
    restoredAnimationStyles.length = 0;
  };

  freezeAnimationsForInspect();

  const getFormulaVisualElement = (element) => {
    if (!(element instanceof Element)) return null;
    const formula = element.matches(".katex, .katex-display")
      ? element
      : element.closest(".katex, .katex-display");
    if (!(formula instanceof Element)) return null;
    const htmlLayer = formula.matches(".katex-html") ? formula : formula.querySelector(".katex-html");
    if (htmlLayer instanceof Element) return htmlLayer;
    if (formula.classList.contains("katex-display")) {
      const innerKatex = formula.querySelector(".katex");
      if (innerKatex instanceof Element) return innerKatex;
    }
    return formula;
  };

  const getClientRectBounds = (element) => {
    if (!(element instanceof Element)) {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 1, height: 1 };
    }
    const base = element.getBoundingClientRect();
    let left = base.left;
    let top = base.top;
    let right = base.right;
    let bottom = base.bottom;

    const includeRect = (rect) => {
      if (!rect || (rect.width < 0.5 && rect.height < 0.5)) return;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    };

    Array.from(element.getClientRects ? element.getClientRects() : [base]).forEach(includeRect);
    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  };

  const getFormulaVisualBounds = (element) => {
    const boundsRoot = getFormulaVisualElement(element);
    if (!boundsRoot) return getClientRectBounds(element);
    const base = boundsRoot.getBoundingClientRect();
    let left = base.left;
    let top = base.top;
    let right = base.right;
    let bottom = base.bottom;

    const includeRect = (rect) => {
      if (!rect || (rect.width < 0.5 && rect.height < 0.5)) return;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    };

    Array.from(boundsRoot.getClientRects ? boundsRoot.getClientRects() : [base]).forEach(includeRect);
    boundsRoot.querySelectorAll("*").forEach((child) => {
      if (!(child instanceof Element)) return;
      if (child.id === OVERLAY_ID) return;
      if (["SCRIPT", "STYLE", "LINK", "META", "TITLE"].includes(child.tagName)) return;
      if (child.closest(".katex-mathml")) return;
      Array.from(child.getClientRects ? child.getClientRects() : [child.getBoundingClientRect()]).forEach(includeRect);
    });

    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  };

  const getVisualBounds = (element) => {
    if (getFormulaVisualElement(element)) return getFormulaVisualBounds(element);
    return getClientRectBounds(element);
  };

  const ensureHighlightOverlay = () => {
    if (highlightOverlayElement && highlightOverlayElement.isConnected) return highlightOverlayElement;
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    document.body.appendChild(overlay);
    highlightOverlayElement = overlay;
    return highlightOverlayElement;
  };

  const updateHighlightOverlay = () => {
    if (!activeElement) {
      if (highlightOverlayElement) highlightOverlayElement.remove();
      highlightOverlayElement = null;
      return;
    }
    const overlay = ensureHighlightOverlay();
    const rect = getVisualBounds(activeElement);
    const pad = 4;
    overlay.style.left = (rect.left - pad).toFixed(1) + "px";
    overlay.style.top = (rect.top - pad).toFixed(1) + "px";
    overlay.style.width = Math.max(1, rect.width + pad * 2).toFixed(1) + "px";
    overlay.style.height = Math.max(1, rect.height + pad * 2).toFixed(1) + "px";
  };

  const setActive = (el) => {
    if (activeElement === el) {
      updateHighlightOverlay();
      return;
    }
    if (activeElement) activeElement.classList.remove(HIGHLIGHT_CLASS);
    activeElement = el;
    if (activeElement) activeElement.classList.add(HIGHLIGHT_CLASS);
    updateHighlightOverlay();
  };

  const clearActive = () => {
    lockedElement = null;
    if (activeElement) {
      activeElement.classList.remove(HIGHLIGHT_CLASS);
      activeElement = null;
    }
    updateHighlightOverlay();
  };

  const setLocked = (el) => {
    lockedElement = el instanceof Element ? el : null;
    setActive(lockedElement);
  };

  const restoreActive = (selector) => {
    try {
      if (!selector || typeof selector !== "string") return false;
      const target = document.querySelector(selector);
      if (!(target instanceof Element)) return false;
      setLocked(target);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const onHover = (target) => {
    if (lockedElement) {
      setActive(lockedElement);
      return;
    }
    if (!target) {
      clearActive();
      return;
    }
    setActive(target);
  };

  const onPick = (target) => {
    setLocked(target);
    const selector = buildStableSelector(target);
    if (!selector) {
      console.log(LOG_PREFIX + JSON.stringify({
        type: "invalid",
        message: uiMessage("无法为该元素生成稳定选择器，请点击 content 内的可见元素", "Could not build a stable selector for this element. Click a visible element inside content."),
      }));
      return true;
    }

    const elementTag = target.tagName ? target.tagName.toLowerCase() : "";
    const rawText = normalizeText(target.textContent);
    const elementText = rawText.length > 80 ? rawText.slice(0, 80) + "…" : rawText;
    const formula = readFormulaMetadata(target);
    const computed = window.getComputedStyle(target);
    const rect = getVisualBounds(target);

    console.log(LOG_PREFIX + JSON.stringify({
      type: "selected",
      mode: MODE,
      selector,
      label: selector,
      elementTag,
      elementText,
      text: rawText,
      style: {
        color: computed.color || "",
        fontSize: computed.fontSize || "",
        fontWeight: computed.fontWeight || "",
        lineHeight: computed.lineHeight || "",
        textAlign: computed.textAlign || "",
        backgroundColor: computed.backgroundColor || ""
      },
      formula,
      bounds: {
        x: Math.round(rect.left * 10) / 10,
        y: Math.round(rect.top * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10
      }
    }));

    return true;
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      console.log(LOG_PREFIX + JSON.stringify({ type: "exit" }));
      return true;
    }
    return false;
  };

  const cleanup = () => {
    elementPicker.stop();
    window.removeEventListener("scroll", updateHighlightOverlay, true);
    window.removeEventListener("resize", updateHighlightOverlay, true);
    clearActive();
    if (highlightOverlayElement) {
      highlightOverlayElement.remove();
      highlightOverlayElement = null;
    }
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    if (shouldFreezeMotion) restoreFrozenAnimationStyles();
    if (cursorHost && cursorHost.style) {
      cursorHost.style.cursor = previousCursor || "";
    }
    delete window[STATE_KEY];
  };

  elementPicker.start({
    onHover,
    onClick: onPick,
    onKeyDown
  });
  window.addEventListener("scroll", updateHighlightOverlay, true);
  window.addEventListener("resize", updateHighlightOverlay, true);

  window[STATE_KEY] = { active: true, cleanup };
  window.__pptInspectorRestoreSelection = restoreActive;
})();
  `
}

export function buildInspectorCleanupScript(): string {
  return `
(() => {
  const STATE_KEY = "__pptInspectorState";
  const state = window[STATE_KEY];
  if (state && typeof state.cleanup === "function") {
    state.cleanup();
  } else {
    delete window[STATE_KEY];
  }
})();
  `
}
