function getPageText() {
  return document.body.innerText;
}

// ---- Form helpers for knowledge-based autofill ----

function findPrimaryScrollableContainer() {
  const candidates = Array.from(
    document.querySelectorAll("main, [role='main'], [data-testid='conversation-turns']")
  );
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 10
    ) {
      return el;
    }
  }
  return null;
}

function getFieldLabel(element) {
  const id = element.id;
  if (id) {
    const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (explicit && explicit.innerText.trim()) {
      return explicit.innerText.trim();
    }
  }

  let parent = element.parentElement;
  while (parent) {
    if (parent.tagName === "LABEL" && parent.innerText.trim()) {
      return parent.innerText.trim();
    }
    parent = parent.parentElement;
  }

  return "";
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function descriptorFromElement(element) {
  const pieces = [];

  const autocomplete = element.getAttribute("autocomplete");
  if (autocomplete) {
    pieces.push(autocomplete);
  }

  const label = getFieldLabel(element);
  if (label) {
    pieces.push(label);
  }

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) {
    pieces.push(placeholder);
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    pieces.push(ariaLabel);
  }

  const name = element.getAttribute("name");
  if (name) {
    pieces.push(name.replace(/[_\-]+/g, " "));
  }

  const id = element.id;
  if (id) {
    pieces.push(id.replace(/[_\-]+/g, " "));
  }

  const raw = pieces.join(" ").trim();
  const tokens = tokenize(raw);

  return {
    raw,
    tokens,
  };
}

function jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
}

function isFillableField(element) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    return false;
  }

  if (element.type === "password" || element.type === "hidden") {
    return false;
  }

  if (element.disabled || element.readOnly) {
    return false;
  }

  return true;
}

function collectFormFields(form) {
  const fields = [];
  const elements = form.querySelectorAll("input, textarea, select");
  elements.forEach((el) => {
    if (!isFillableField(el)) return;
    fields.push(el);
  });
  return fields;
}

function collectAllFillableFields() {
  const all = Array.from(document.querySelectorAll("input, textarea, select"));
  const fillable = all.filter((el) => isFillableField(el));
  console.log("[LaLaTron][autofill] Found inputs on page:", {
    total: all.length,
    fillable: fillable.length,
  });
  return fillable;
}

function requestAutofillFromKnowledge(sendResponse) {
  const fields = collectAllFillableFields();
  if (!fields.length) {
    console.log("[LaLaTron][autofill] No fillable fields detected on this page.");
    sendResponse({ status: "no_fields" });
    return;
  }

  const descriptors = fields.map((el, index) => {
    const desc = descriptorFromElement(el);
    return {
      index,
      description: desc.raw,
      tagName: el.tagName,
      type: el.type || "",
      name: el.name || "",
      id: el.id || "",
      placeholder: el.getAttribute("placeholder") || "",
    };
  });

  console.log("[LaLaTron][autofill] Sending field descriptors to background:", descriptors);

  chrome.runtime.sendMessage(
    {
      action: "autofillWithKnowledge",
      url: window.location.href,
      hostname: window.location.hostname,
      fields: descriptors,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("[LaLaTron][autofill] Error talking to background:", chrome.runtime.lastError);
        sendResponse({ status: "error_runtime" });
        return;
      }

      console.log("[LaLaTron][autofill] Background responded with:", response);

      if (!response || !Array.isArray(response.suggestions)) {
        console.warn("[LaLaTron][autofill] No suggestions array in response.", response);
        sendResponse({
          status: "no_suggestions",
          error: response && response.error ? response.error : "No suggestions from knowledge source.",
        });
        return;
      }

      if (!response.suggestions.length) {
        console.warn("[LaLaTron][autofill] Suggestions array is empty.", response);
        sendResponse({
          status: "no_suggestions",
          error: response && response.error ? response.error : "Model returned an empty suggestion list.",
        });
        return;
      }

      response.suggestions.forEach((s) => {
        const idx = typeof s.index === "number" ? s.index : null;
        if (idx == null || idx < 0 || idx >= fields.length) return;
        const value = s.value != null ? String(s.value) : "";
        if (!value) return;

        const el = fields[idx];
        console.log("[LaLaTron][autofill] Applying suggestion:", {
          index: idx,
          value,
          tagName: el.tagName,
          type: el.type || "",
          name: el.name || "",
          id: el.id || "",
        });

        if (el instanceof HTMLSelectElement) {
          let matched = false;
          Array.from(el.options).forEach((opt) => {
            if (opt.value === value || opt.text === value) {
              el.value = opt.value;
              matched = true;
            }
          });
          if (!matched) {
            el.value = value;
          }
        } else {
          el.value = value;
        }

        const ev = new Event("input", { bubbles: true });
        el.dispatchEvent(ev);
        const ch = new Event("change", { bubbles: true });
        el.dispatchEvent(ch);
      });

      sendResponse({ status: "autofilled" });
    }
  );
}

// ---- Message handling (scrape + knowledge-based autofill) ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "scrape") {
    sendResponse({ text: getPageText() });
    return;
  }

  if (msg.action === "autofillForm") {
    requestAutofillFromKnowledge(sendResponse);
    return true; // async
  }

  if (msg.action === "createBookmarkContext") {
    const scrollY =
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;
    let selectionPreview = "";
    try {
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.toString) {
        selectionPreview = sel.toString().trim().slice(0, 200);
      }
    } catch (e) {
      // ignore
    }
    const explicitTitle =
      msg.title && typeof msg.title === "string" ? msg.title.trim() : "";
    const title =
      explicitTitle ||
      (selectionPreview
        ? selectionPreview.slice(0, 60)
        : document.title || "Bookmark");

    const innerContainer = findPrimaryScrollableContainer();
    const innerScrollY =
      innerContainer && typeof innerContainer.scrollTop === "number"
        ? innerContainer.scrollTop
        : null;

    console.log("[LaLaTron][bookmarks] Created bookmark context", {
      scrollY,
      innerScrollY,
      title,
      selectionPreview,
    });

    sendResponse({ scrollY, innerScrollY, selectionPreview, title });
    return;
  }

  if (msg.action === "scrollToBookmark") {
    const hasWindowScroll = typeof msg.scrollY === "number";
    const hasInnerScroll = typeof msg.innerScrollY === "number";

    if (hasInnerScroll) {
      const container = findPrimaryScrollableContainer();
      if (container) {
        console.log("[LaLaTron][bookmarks] Scrolling inner container to", msg.innerScrollY);
        container.scrollTo({ top: msg.innerScrollY, behavior: "smooth" });
        sendResponse({ status: "ok", target: "inner" });
        return;
      }
    }

    if (hasWindowScroll) {
      console.log("[LaLaTron][bookmarks] Scrolling window to", msg.scrollY);
      window.scrollTo({ top: msg.scrollY, behavior: "smooth" });
      sendResponse({ status: "ok", target: "window" });
      return;
    }

    sendResponse({ status: "no_scroll_target" });
    return;
  }
});

console.log("Content script loaded with scraping + knowledge-based autofill.");