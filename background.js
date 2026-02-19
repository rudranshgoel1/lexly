// Lexly background service worker
// Minimal — all logic lives in content.js and popup.js
chrome.runtime.onInstalled.addListener(() => {
  console.log('Lexly installed.');
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
