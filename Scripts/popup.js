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
  conversation.forEach(msg => {
    const div = document.createElement("div");
    if(msg.role === "system") {
      return;
    }
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

document.getElementById("clearBtn").addEventListener("click", () => {
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

document.getElementById("autofillBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: "autofillForm" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Autofill error:", chrome.runtime.lastError.message);
        alert("Unable to autofill this page. It may be a restricted page or does not allow content scripts.");
        return;
      }
      console.log("Autofill response:", response);
    });
  });
});