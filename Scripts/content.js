function getPageText() {
  // Basic approach: get all visible text
  return document.body.innerText;
}

// Listen for scrape requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "scrape") {
    sendResponse({ text: getPageText() });
  }
});

console.log("Content script loaded and ready to scrape text.");