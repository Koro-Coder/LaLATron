// This code makes direct requests to the Groq API using fetch, no require/import or local server needed.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = "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"; // Replace with your actual API key
const MODEL = "llama-3.3-70b-versatile";


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "chatWithLLM" && Array.isArray(request.messages)) {
        console.log("Received messages for LLM:", request.messages);
        fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: MODEL,
                messages: request.messages
            })
        })
        .then(res => res.json())
        .then(data => {
            const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
                ? data.choices[0].message.content
                : "No reply from LLM.";
            sendResponse({ reply });
        })
        .catch(err => sendResponse({ reply: "Error: " + err.message }));
        return true; // Indicates async response
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "analyzeImage" && typeof request.imageUrl === "string") {
        fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Extract the text from this image and summarize what you see." },
                            { type: "image_url", image_url: { url: request.imageUrl } }
                        ]
                    }
                ],
                temperature: 1,
                max_completion_tokens: 1024,
                top_p: 1,
                stream: false
            })
        })
        .then(res => res.json())
        .then(data => {
            const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
                ? data.choices[0].message.content
                : "No reply from LLM.";
            sendResponse({ reply });
        })
        .catch(err => sendResponse({ reply: "Error: " + err.message }));
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


chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed. Background worker active!");
});