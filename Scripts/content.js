function getPageText() {
  return document.body.innerText;
}

// ---- Form memory + autofill helpers ----

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

function updateFieldMemoryFromForm(form) {
  const url = window.location.href;
  const hostname = window.location.hostname;
  const now = Date.now();
  const fields = collectFormFields(form);

  chrome.storage.local.get(["fieldMemory"], (data) => {
    const memory = Array.isArray(data.fieldMemory) ? data.fieldMemory : [];

    fields.forEach((el) => {
      const value = el.value != null ? el.value.toString().trim() : "";
      if (!value) return;

      const desc = descriptorFromElement(el);
      if (!desc.tokens.length) return;

      const entry = {
        keyText: desc.raw,
        tokens: desc.tokens,
        value,
        lastUpdated: now,
        source: {
          hostname,
          url,
        },
      };

      const existingIndex = memory.findIndex((m) => jaccardSimilarity(m.tokens, entry.tokens) > 0.8);
      if (existingIndex >= 0) {
        memory[existingIndex] = entry;
      } else {
        memory.push(entry);
      }
    });

    chrome.storage.local.set({ fieldMemory: memory });
  });
}

function attachFormListeners(root = document) {
  const forms = root.querySelectorAll("form");
  forms.forEach((form) => {
    if (form.__lalaFormTracked) return;
    form.__lalaFormTracked = true;

    form.addEventListener(
      "submit",
      () => {
        updateFieldMemoryFromForm(form);
      },
      true
    );
  });
}

function autofillPageFromMemory() {
  chrome.storage.local.get(["fieldMemory"], (data) => {
    const memory = Array.isArray(data.fieldMemory) ? data.fieldMemory : [];
    if (!memory.length) {
      return;
    }

    const allFields = Array.from(document.querySelectorAll("input, textarea, select")).filter((el) =>
      isFillableField(el)
    );

    allFields.forEach((el) => {
      const desc = descriptorFromElement(el);
      if (!desc.tokens.length) return;

      let bestEntry = null;
      let bestScore = 0;

      memory.forEach((entry) => {
        const score = jaccardSimilarity(desc.tokens, entry.tokens);
        if (score > bestScore) {
          bestScore = score;
          bestEntry = entry;
        }
      });

      if (bestEntry && bestScore >= 0.5) {
        if (el instanceof HTMLSelectElement) {
          Array.from(el.options).forEach((opt) => {
            if (opt.value === bestEntry.value || opt.text === bestEntry.value) {
              el.value = opt.value;
            }
          });
        } else {
          el.value = bestEntry.value;
        }

        const ev = new Event("input", { bubbles: true });
        el.dispatchEvent(ev);
        const ch = new Event("change", { bubbles: true });
        el.dispatchEvent(ch);
      }
    });
  });
}

// Initial wiring once content script loads
attachFormListeners(document);

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === "childList" && m.addedNodes.length) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.tagName === "FORM" || node.querySelector && node.querySelector("form")) {
          attachFormListeners(node);
        }
      });
    }
  }
});

observer.observe(document.documentElement || document.body, {
  childList: true,
  subtree: true,
});

// ---- Message handling (scrape + autofill trigger) ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "scrape") {
    sendResponse({ text: getPageText() });
    return;
  }

  if (msg.action === "autofillForm") {
    autofillPageFromMemory();
    sendResponse({ status: "autofill_attempted" });
  }
});

console.log("Content script loaded with scraping + form memory/autofill.");