let conversation = []; // Holds chat history

chrome.storage.local.get(["messages"], async (data) => {
  if (data.messages) {
    conversation = data.messages;
  }
  console.log("Loaded conversation:", conversation);
  renderChat();
});


function renderChat() {
  console.log("Rendering chat with messages:", conversation.length);
  const chatWindow = document.getElementById("chatWindow");
  chatWindow.innerHTML = "";
  let hasVisibleMessages = false;
  conversation.forEach(msg => {
    const div = document.createElement("div");
    if(msg.role === "system") {
      return;
    }
    hasVisibleMessages = true;
    if (msg.role === "user") {
      div.innerHTML = `<b style="color:#1976d2;font-family:'Segoe UI',Arial,sans-serif;">You:</b> <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:1.05em;">${msg.content}</span>`;
      div.style.background = "#e3f2fd";
      div.style.borderRadius = "8px";
      div.style.padding = "8px 12px";
      div.style.alignSelf = "flex-end";
      div.style.maxWidth = "100%";
    } else {
      div.innerHTML = `<b style="color:#d32f2f;font-family:'Segoe UI',Arial,sans-serif;">LaLaTron:</b> <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:1.05em;">${msg.content}</span>`;
      div.style.background = "#fff3e0";
      div.style.borderRadius = "8px";
      div.style.padding = "8px 12px";
      div.style.alignSelf = "flex-start";
      div.style.maxWidth = "100%";
    }
    div.style.marginBottom = "6px";
    chatWindow.appendChild(div);
  });
  if (hasVisibleMessages) {
    chatWindow.classList.add("has-messages");
  } else {
    chatWindow.classList.remove("has-messages");
  }
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

document.getElementById("sendBtn").addEventListener("click", async () => {
  const input = document.getElementById("userInput");
  const userText = input.value.trim();
  if (!userText) return;
  conversation.push({ role: "user", content: userText });
  renderChat();
  input.value = "";

  console.log("Sending user message to LLM**:", conversation);
  // Get scraped context if available
  chrome.storage.local.get(["scrapedText"], async (data) => {
    let contextMsg = null;
    if (data.scrapedText) {
      contextMsg = { role: "system", content: `Website context:\n${data.scrapedText}` };
      chrome.storage.local.set({ scrapedText: "" });
    }
    // Prepare messages for LLM
    const messages = contextMsg
      ? [...conversation, contextMsg]
      : [...conversation];

      conversation = messages; // Update conversation with context

    // Send to backend (Node.js server or extension background script)
    // Here, we use chrome.runtime.sendMessage for extension background
    console.log("Sending messages to LLM");
    chrome.runtime.sendMessage(
      { action: "chatWithLLM", messages },
      (response) => {
        if (response && response.reply) {
          conversation.push({ role: "assistant", content: response.reply });
          renderChat();
        } else {
          conversation.push({ role: "assistant", content: "Error: No response from LLM." });
          renderChat();
        }
        chrome.storage.local.set({ messages: conversation });
      }
    );
  });
});

document.getElementById("userInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("sendBtn").click();
});

document.getElementById("scrapeBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "scrape" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error:", chrome.runtime.lastError.message);
        alert(
          "Cannot scrape this page. Maybe it's a restricted page (like Chrome Web Store or Settings)."
        );
        return;
      }
      if (response && response.text) {
          chrome.storage.local.set({ scrapedText: response.text });
        };
    });
  });
});

document.getElementById("newChatBtn").addEventListener("click", () => {
  conversation = [{
      role: "system",
      content: "You are LaLaTron, a helpful AI assistant inside a browser extension. Response Rules: Always return answers in HTML format only. Keep formatting minimal and lightweight. Avoid markdown, code block fences, or unnecessary styling. Capabilities: You can take screenshots when requested. You can scrape and extract text from the current website when requested. You can summarize, explain, or reformat scraped content into user-friendly outputs."
    }];
      chrome.storage.local.set({ messages: conversation });
  renderChat();
});

document.getElementById("screenshotBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "screenshot" }, (response) => {
    if (response && response.img) {
      const img = document.createElement("img");
      img.src = response.img;
      chrome.runtime.sendMessage(
      { action: "analyzeImage", imageUrl: response.img },
      (response) => {
        if (response && response.reply) {
          conversation.push({ role: "system", content: response.reply });
          renderChat();
        } else {
          conversation.push({ role: "system", content: "Error: No response from LLM." });
          renderChat();
        }
        chrome.storage.local.set({ messages: conversation });
      });
    }
  });
});

document.getElementById("autofillNowBtn").addEventListener("click", () => {
  const knowledgeInput = document.getElementById("autofillKnowledgeInput");
  if (knowledgeInput && !knowledgeInput.value.trim()) {
    alert("Add some knowledge text in the Autofill tab before autofilling.");
    return;
  }
  console.log("[LaLaTron][autofill:UI] Autofill button clicked, sending message to content script.");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: "autofillForm" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[LaLaTron][autofill:UI] Error sending autofill message:", chrome.runtime.lastError);
        alert("Unable to autofill this page. It may be a restricted page or does not allow content scripts.");
        return;
      }
      console.log("[LaLaTron][autofill:UI] Content script responded:", response);
      if (!response) {
        alert("Autofill failed: no response from content script.");
        return;
      }
      if (response.status === "no_fields") {
        alert("Autofill did not find any fillable fields on this page.");
        return;
      }
      if (response.status === "no_suggestions") {
        const reason =
          response.error ||
          "The knowledge document did not contain enough information to fill these fields, or the model could not produce answers.";
        alert("Autofill could not generate any suggestions:\n\n" + reason);
        return;
      }
      if (response.status === "error_runtime") {
        alert(
          "Autofill failed while talking to the background script. Open the extension background console for more details."
        );
        return;
      }
      console.log("Autofill response:", response);
    });
  });
});

document.getElementById("saveKnowledgeBtn").addEventListener("click", () => {
  const titleInput = document.getElementById("autofillKnowledgeTitle");
  const textInput = document.getElementById("autofillKnowledgeInput");
  const info = document.getElementById("autofillKnowledgeInfo");

  const title = titleInput.value.trim();
  const text = textInput.value || "";

  if (!title) {
    alert("Add a title for this knowledge source before saving.");
    return;
  }
  if (!text.trim()) {
    alert("Paste some knowledge text before saving.");
    return;
  }

  chrome.storage.local.get(["autofillKnowledgeEntries", "autofillActiveKnowledgeId"], (data) => {
    const entries = Array.isArray(data.autofillKnowledgeEntries) ? data.autofillKnowledgeEntries : [];
    const now = Date.now();

    let existing = entries.find((e) => e.title === title);
    if (existing) {
      existing.text = text;
      existing.updatedAt = now;
    } else {
      existing = {
        id: "k_" + now.toString(36),
        title,
        text,
        createdAt: now,
        updatedAt: now,
      };
      entries.push(existing);
    }

    chrome.storage.local.set(
      {
        autofillKnowledgeEntries: entries,
        autofillActiveKnowledgeId: existing.id,
      },
      () => {
        if (info) {
          const len = text.length;
          info.textContent = `Saved "${existing.title}" (${len} characters).`;
        }
        populateKnowledgeList(entries, existing.id);
      }
    );
  });
});

document.getElementById("newKnowledgeBtn").addEventListener("click", () => {
  const titleInput = document.getElementById("autofillKnowledgeTitle");
  const textInput = document.getElementById("autofillKnowledgeInput");
  const list = document.getElementById("autofillKnowledgeList");
  const info = document.getElementById("autofillKnowledgeInfo");

  if (titleInput) titleInput.value = "";
  if (textInput) textInput.value = "";
  if (list) list.value = "";
  if (info) info.textContent = "Start a new knowledge source: add a title and paste text, then click Save / update.";
});

document.getElementById("deleteKnowledgeBtn").addEventListener("click", () => {
  const list = document.getElementById("autofillKnowledgeList");
  const info = document.getElementById("autofillKnowledgeInfo");
  const titleInput = document.getElementById("autofillKnowledgeTitle");
  const textInput = document.getElementById("autofillKnowledgeInput");

  const id = list && list.value ? list.value : null;
  if (!id) {
    alert("Select a saved knowledge source to delete.");
    return;
  }
  if (!confirm("Delete this saved knowledge source? This cannot be undone.")) {
    return;
  }

  chrome.storage.local.get(["autofillKnowledgeEntries", "autofillActiveKnowledgeId"], (data) => {
    let entries = Array.isArray(data.autofillKnowledgeEntries) ? data.autofillKnowledgeEntries : [];
    entries = entries.filter((e) => e.id !== id);
    const newActive = entries.length ? entries[0].id : "";

    chrome.storage.local.set(
      {
        autofillKnowledgeEntries: entries,
        autofillActiveKnowledgeId: newActive,
      },
      () => {
        populateKnowledgeList(entries, newActive);
        if (entries.length) {
          const active = entries.find((e) => e.id === newActive);
          if (active) {
            if (titleInput) titleInput.value = active.title;
            if (textInput) textInput.value = active.text;
            if (info) info.textContent = `Loaded "${active.title}" (${active.text.length} characters).`;
          }
        } else {
          if (titleInput) titleInput.value = "";
          if (textInput) textInput.value = "";
          if (info) info.textContent = "No knowledge saved yet. Paste a document above, give it a title, and click Save / update.";
        }
      }
    );
  });
});

document.getElementById("saveSettingsBtn").addEventListener("click", () => {
  const apiKeyInput = document.getElementById("settingsApiKey");
  const chatModelInput = document.getElementById("settingsChatModel");
  const visionModelInput = document.getElementById("settingsVisionModel");
  const statusEl = document.getElementById("settingsStatus");

  const apiKey = apiKeyInput.value.trim();
  const chatModel = chatModelInput.value.trim() || "llama-3.3-70b-versatile";
  const visionModel = visionModelInput.value.trim() || "meta-llama/llama-4-scout-17b-16e-instruct";

  chrome.storage.local.set(
    {
      settings: {
        apiKey,
        chatModel,
        visionModel,
      },
    },
    () => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Could not save settings: " + chrome.runtime.lastError.message;
        return;
      }
      statusEl.textContent = "Settings saved.";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 3000);
    }
  );
});

function loadSettingsIntoUI() {
  const apiKeyInput = document.getElementById("settingsApiKey");
  const chatModelInput = document.getElementById("settingsChatModel");
  const visionModelInput = document.getElementById("settingsVisionModel");

  chrome.storage.local.get(["settings"], (data) => {
    const settings = data.settings || {};
    if (settings.apiKey) {
      apiKeyInput.value = settings.apiKey;
    }
    if (settings.chatModel) {
      chatModelInput.value = settings.chatModel;
    }
    if (settings.visionModel) {
      visionModelInput.value = settings.visionModel;
    }
  });
}

function populateKnowledgeList(entries, activeId) {
  const list = document.getElementById("autofillKnowledgeList");
  if (!list) return;

  list.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "-- No saved knowledge selected --";
  list.appendChild(placeholder);

  entries.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.title;
    list.appendChild(opt);
  });

  if (activeId) {
    list.value = activeId;
  } else {
    list.value = "";
  }
}

function loadAutofillKnowledgeUI() {
  const titleInput = document.getElementById("autofillKnowledgeTitle");
  const textInput = document.getElementById("autofillKnowledgeInput");
  const info = document.getElementById("autofillKnowledgeInfo");
  if (!titleInput || !textInput || !info) return;

  chrome.storage.local.get(
    ["autofillKnowledgeEntries", "autofillActiveKnowledgeId", "autofillKnowledge"],
    (data) => {
      let entries = Array.isArray(data.autofillKnowledgeEntries) ? data.autofillKnowledgeEntries : [];
      let activeId = data.autofillActiveKnowledgeId || "";

      // Backwards compatibility: if old single-string storage exists, migrate it
      if (!entries.length && data.autofillKnowledge) {
        const now = Date.now();
        const migrated = {
          id: "legacy_" + now.toString(36),
          title: "Default knowledge",
          text: data.autofillKnowledge,
          createdAt: now,
          updatedAt: now,
        };
        entries = [migrated];
        activeId = migrated.id;
        chrome.storage.local.set({
          autofillKnowledgeEntries: entries,
          autofillActiveKnowledgeId: activeId,
        });
      }

      populateKnowledgeList(entries, activeId);

      if (entries.length) {
        let active = entries.find((e) => e.id === activeId);
        if (!active) {
          active = entries[0];
          activeId = active.id;
          chrome.storage.local.set({ autofillActiveKnowledgeId: activeId });
        }
        titleInput.value = active.title;
        textInput.value = active.text;
        info.textContent = `Loaded "${active.title}" (${active.text.length} characters).`;
      } else {
        titleInput.value = "";
        textInput.value = "";
        info.textContent =
          "No knowledge saved yet. Paste a document above, give it a title, and click Save / update.";
      }
    }
  );
}

document.getElementById("autofillKnowledgeList").addEventListener("change", () => {
  const list = document.getElementById("autofillKnowledgeList");
  const titleInput = document.getElementById("autofillKnowledgeTitle");
  const textInput = document.getElementById("autofillKnowledgeInput");
  const info = document.getElementById("autofillKnowledgeInfo");
  const id = list.value;

  if (!id) {
    titleInput.value = "";
    textInput.value = "";
    info.textContent =
      "No knowledge selected. Paste a document above, give it a title, and click Save / update.";
    chrome.storage.local.set({ autofillActiveKnowledgeId: "" });
    return;
  }

  chrome.storage.local.get(["autofillKnowledgeEntries"], (data) => {
    const entries = Array.isArray(data.autofillKnowledgeEntries) ? data.autofillKnowledgeEntries : [];
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return;
    }
    titleInput.value = entry.title;
    textInput.value = entry.text;
    info.textContent = `Loaded "${entry.title}" (${entry.text.length} characters).`;
    chrome.storage.local.set({ autofillActiveKnowledgeId: id });
  });
});

function pageKeyFromUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch (e) {
    return url || "unknown";
  }
}

function renderBookmarks(pageKey, entries) {
  const list = document.getElementById("bookmarkList");
  const info = document.getElementById("bookmarkInfo");
  if (!list || !info) return;

  list.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.textContent = "No bookmarks for this page yet.";
    list.appendChild(empty);
    info.textContent = "No bookmarks saved for this page.";
    return;
  }

  entries
    .slice()
    .sort((a, b) => a.scrollY - b.scrollY)
    .forEach((entry) => {
      const row = document.createElement("div");
      row.setAttribute("data-id", entry.id);
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "flex-start";
      row.style.gap = "6px";
      row.style.marginBottom = "4px";

      const main = document.createElement("div");
      const title = document.createElement("div");
      title.textContent = entry.title || "Untitled bookmark";
      title.style.fontWeight = "600";
      const preview = document.createElement("div");
      preview.textContent = entry.preview || "";
      preview.style.fontSize = "11px";
      preview.style.color = "#6b7280";
      main.appendChild(title);
      if (entry.preview) {
        main.appendChild(preview);
      }

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.flexDirection = "column";
      actions.style.gap = "4px";

      const goBtn = document.createElement("button");
      goBtn.textContent = "Go";
      goBtn.className = "button";
      goBtn.setAttribute("data-action", "go");
      goBtn.style.padding = "2px 6px";
      goBtn.style.fontSize = "11px";

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.className = "button";
      delBtn.setAttribute("data-action", "delete");
      delBtn.style.padding = "2px 6px";
      delBtn.style.fontSize = "11px";

      actions.appendChild(goBtn);
      actions.appendChild(delBtn);

      row.appendChild(main);
      row.appendChild(actions);
      list.appendChild(row);
    });

  info.textContent = `Bookmarks on this page: ${entries.length}`;
}

function loadBookmarksUI() {
  const list = document.getElementById("bookmarkList");
  const info = document.getElementById("bookmarkInfo");
  if (!list || !info) return;

  list.innerHTML = "Loading bookmarks for this page...";
  info.textContent = "";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length || !tabs[0].url) {
      list.textContent = "No active tab.";
      return;
    }
    const key = pageKeyFromUrl(tabs[0].url);
    chrome.storage.local.get(["bookmarksByPage"], (data) => {
      const map = data.bookmarksByPage || {};
      const entries = Array.isArray(map[key]) ? map[key] : [];
      renderBookmarks(key, entries);
    });
  });
}

function setActiveView(view) {
  const views = {
    chat: document.getElementById("view-chat"),
    autofill: document.getElementById("view-autofill"),
    bookmarks: document.getElementById("view-bookmarks"),
    settings: document.getElementById("view-settings"),
  };

  Object.keys(views).forEach((key) => {
    if (views[key]) {
      views[key].classList.toggle("active", key === view);
    }
  });

  document.querySelectorAll(".nav-item").forEach((btn) => {
    const target = btn.getAttribute("data-view");
    btn.classList.toggle("active", target === view);
  });

  if (view === "autofill") {
    loadAutofillKnowledgeUI();
  } else if (view === "settings") {
    loadSettingsIntoUI();
  } else if (view === "bookmarks") {
    loadBookmarksUI();
  }
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.getAttribute("data-view");
    setActiveView(view);
  });
});

// Initialise auxiliary panels on first load
loadAutofillKnowledgeUI();
loadSettingsIntoUI();
loadBookmarksUI();

document.getElementById("bookmarkList").addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute("data-action");
  if (!action) return;
  const row = target.closest("[data-id]");
  if (!row) return;
  const id = row.getAttribute("data-id");
  if (!id) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length || !tabs[0].url) return;
    const key = pageKeyFromUrl(tabs[0].url);

    chrome.storage.local.get(["bookmarksByPage"], (data) => {
      const map = data.bookmarksByPage || {};
      let entries = Array.isArray(map[key]) ? map[key] : [];
      const entry = entries.find((b) => b.id === id);
      if (!entry) return;

      if (action === "go") {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: "scrollToBookmark",
            scrollY: entry.scrollY,
            innerScrollY:
              typeof entry.innerScrollY === "number" ? entry.innerScrollY : null,
          },
          () => {
            // ignore response
          }
        );
      } else if (action === "delete") {
        entries = entries.filter((b) => b.id !== id);
        map[key] = entries;
        chrome.storage.local.set({ bookmarksByPage: map }, () => {
          renderBookmarks(key, entries);
        });
      }
    });
  });
});

document.getElementById("addBookmarkBtn").addEventListener("click", () => {
  const titleInput = document.getElementById("bookmarkTitleInput");
  const explicitTitle = titleInput && titleInput.value ? titleInput.value.trim() : "";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length || !tabs[0].id || !tabs[0].url) return;
    const key = pageKeyFromUrl(tabs[0].url);

    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: "createBookmarkContext", title: explicitTitle },
      (ctx) => {
        if (chrome.runtime.lastError) {
          console.error("[LaLaTron][bookmarks:UI] Error creating bookmark context:", chrome.runtime.lastError);
          alert(
            "Unable to create a bookmark on this page. It may be restricted or not allow content scripts."
          );
          return;
        }
        if (!ctx) return;

        chrome.storage.local.get(["bookmarksByPage"], (data) => {
          const map = data.bookmarksByPage || {};
          const entries = Array.isArray(map[key]) ? map[key] : [];
          const now = Date.now();
          const entry = {
            id: "b_" + now.toString(36),
            title: ctx.title || explicitTitle || "Bookmark",
            scrollY: typeof ctx.scrollY === "number" ? ctx.scrollY : 0,
            innerScrollY:
              typeof ctx.innerScrollY === "number" ? ctx.innerScrollY : null,
            preview: ctx.selectionPreview || "",
            createdAt: now,
          };
          entries.push(entry);
          map[key] = entries;
          chrome.storage.local.set({ bookmarksByPage: map }, () => {
            if (titleInput && !explicitTitle) {
              titleInput.value = entry.title;
            }
            renderBookmarks(key, entries);
          });
        });
      }
    );
  });
});

document.getElementById("deleteAllBookmarksBtn").addEventListener("click", () => {
  if (!confirm("Delete all bookmarks for this page?")) {
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length || !tabs[0].url) return;
    const key = pageKeyFromUrl(tabs[0].url);
    chrome.storage.local.get(["bookmarksByPage"], (data) => {
      const map = data.bookmarksByPage || {};
      map[key] = [];
      chrome.storage.local.set({ bookmarksByPage: map }, () => {
        renderBookmarks(key, []);
      });
    });
  });
});