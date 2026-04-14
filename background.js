const MENU_ID = "stop_monitoring";

function updateContextMenu(isEnabled) {
  if (isEnabled) {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Зупинити моніторинг",
      contexts: ["action"],
    }, () => {
      if (chrome.runtime.lastError) {
        // Menu item already exists — update it
        chrome.contextMenus.update(MENU_ID, { visible: true });
      }
    });
  } else {
    chrome.contextMenus.remove(MENU_ID, () => {
      chrome.runtime.lastError; // suppress "not found" error
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("toggleEnabled", ({ toggleEnabled }) => {
    if (toggleEnabled) {
      updateContextMenu(true);
    }
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if ("toggleEnabled" in changes) {
    updateContextMenu(changes.toggleEnabled.newValue === true);
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID) {
    chrome.storage.local.set({ toggleEnabled: false });
  }
});
