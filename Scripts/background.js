// This code makes direct requests to the Groq API using fetch, no require/import or local server needed.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_CHAT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const DEFAULT_API_KEY = "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";

function getRuntimeSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["settings"], (data) => {
      const settings = data.settings || {};
      resolve({
        apiKey: settings.apiKey || DEFAULT_API_KEY,
        chatModel: settings.chatModel || DEFAULT_CHAT_MODEL,
        visionModel: settings.visionModel || DEFAULT_VISION_MODEL,
      });
    });
  });
}

function getAutofillKnowledge() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["autofillKnowledgeEntries", "autofillActiveKnowledgeId", "autofillKnowledge"],
      (data) => {
        let entries = Array.isArray(data.autofillKnowledgeEntries) ? data.autofillKnowledgeEntries : [];
        let activeId = data.autofillActiveKnowledgeId || "";

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

        if (!entries.length) {
          resolve("");
          return;
        }

        let active = entries.find((e) => e.id === activeId);
        if (!active) {
          active = entries[0];
          chrome.storage.local.set({ autofillActiveKnowledgeId: active.id });
        }

        resolve(active.text || "");
      }
    );
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "chatWithLLM" && Array.isArray(request.messages)) {
    console.log("Received messages for LLM:", request.messages);

    getRuntimeSettings()
      .then(({ apiKey, chatModel }) => {
        if (!apiKey) {
          sendResponse({
            reply:
              "Error: Groq API key is not configured. Open the LaLaTron settings tab and add your API key.",
          });
          return;
        }

        return fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: chatModel,
            temperature: 0.3,
            messages: request.messages,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            const reply =
              data.choices &&
              data.choices[0] &&
              data.choices[0].message &&
              data.choices[0].message.content
                ? data.choices[0].message.content
                : "No reply from LLM.";
            sendResponse({ reply });
          });
      })
      .catch((err) => sendResponse({ reply: "Error: " + err.message }));

    return true; // Indicates async response
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeImage" && typeof request.imageUrl === "string") {
    getRuntimeSettings()
      .then(({ apiKey, visionModel }) => {
        if (!apiKey) {
          sendResponse({
            reply:
              "Error: Groq API key is not configured. Open the LaLaTron settings tab and add your API key.",
          });
          return;
        }

        return fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: visionModel,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Extract the text from this image and summarize what you see.",
                  },
                  { type: "image_url", image_url: { url: request.imageUrl } },
                ],
              },
            ],
            temperature: 1,
            max_completion_tokens: 1024,
            top_p: 1,
            stream: false,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            const reply =
              data.choices &&
              data.choices[0] &&
              data.choices[0].message &&
              data.choices[0].message.content
                ? data.choices[0].message.content
                : "No reply from LLM.";
            sendResponse({ reply });
          });
      })
      .catch((err) => sendResponse({ reply: "Error: " + err.message }));

    return true; // Indicates async response
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "screenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      sendResponse({ img: dataUrl });
    });
    return true; // Keep message channel open for async response
  }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "autofillWithKnowledge" && Array.isArray(request.fields)) {
    console.log("[LaLaTron][autofill:bg] Received autofillWithKnowledge request", {
      fieldCount: request.fields.length,
      url: request.url,
      hostname: request.hostname,
    });

    Promise.all([getRuntimeSettings(), getAutofillKnowledge()])
      .then(([settings, knowledge]) => {
        const { apiKey, chatModel } = settings;
        if (!apiKey) {
          console.warn("[LaLaTron][autofill:bg] Missing API key for autofill");
          sendResponse({
            suggestions: [],
            error: "Groq API key is not configured. Open LaLaTron settings and add your key.",
          });
          return;
        }

        const trimmedKnowledge = knowledge ? String(knowledge).slice(0, 10000) : "";
        if (!trimmedKnowledge) {
          console.warn("[LaLaTron][autofill:bg] No knowledge text configured");
          sendResponse({
            suggestions: [],
            error: "No autofill knowledge configured. Add text in the Autofill tab first.",
          });
          return;
        }

        const prompt = [
          "You help fill web form fields based on a long knowledge document.",
          "",
          "You are given:",
          "1) A knowledge document (unstructured text).",
          "2) A list of fields with indices and descriptors (label, name, id, placeholder, type).",
          "",
          "Return a JSON array only, no extra text. Each item must be:",
          '{ "index": number, "value": string }',
          "",
          "- Only include fields you can confidently fill from the document.",
          "- If you are unsure, omit that field from the array.",
          "- Prefer concise, direct values appropriate for the field (e.g. job title, company name, email, etc.).",
          "",
          "Knowledge document:",
          trimmedKnowledge,
          "",
          "Fields:",
          JSON.stringify(request.fields),
        ].join("\n");

        console.log("[LaLaTron][autofill:bg] Calling Groq for autofill suggestions", {
          model: chatModel,
          knowledgeChars: trimmedKnowledge.length,
        });

        return fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: chatModel,
            temperature: 0.2,
            messages: [
              {
                role: "system",
                content:
                  "You are an assistant that only replies with pure JSON as instructed. No explanations, no markdown, no extra text.",
              },
              { role: "user", content: prompt },
            ],
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            console.log("[LaLaTron][autofill:bg] Groq raw response", data);

            const raw =
              data.choices &&
              data.choices[0] &&
              data.choices[0].message &&
              data.choices[0].message.content
                ? data.choices[0].message.content
                : "[]";

            let jsonText = raw.trim();
            if (jsonText.startsWith("```")) {
              jsonText = jsonText.replace(/```json\s*/i, "").replace(/```$/, "").trim();
            }

            let suggestions = [];
            try {
              const parsed = JSON.parse(jsonText);
              if (Array.isArray(parsed)) {
                suggestions = parsed;
              }
            } catch (e) {
              console.warn("[LaLaTron][autofill:bg] Failed to parse suggestions JSON", {
                error: e && e.message,
                jsonTextSample: jsonText.slice(0, 200),
              });
              suggestions = [];
            }

            console.log("[LaLaTron][autofill:bg] Parsed suggestions", suggestions);
            sendResponse({ suggestions });
          })
          .catch((err) => {
            console.error("[LaLaTron][autofill:bg] Error during Groq call", err);
            sendResponse({ suggestions: [], error: "Error: " + err.message });
          });
      })
      .catch((err) => {
        console.error("[LaLaTron][autofill:bg] Unexpected error", err);
        sendResponse({ suggestions: [], error: "Error: " + err.message });
      });

    return true; // async
  }
});

chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed. Background worker active!");
});