// Popup script для управління автоматичним додаванням товарів

let pageMode = "catalog"; // "catalog" | "product"
let filterItemsData = [""]; // масив назв товарів (мін 1, макс 5)

const isCatalogOrMainUrl = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname !== "coins.bank.gov.ua") return false;
    return pathname === "/" || pathname === "" || pathname === "/catalog.html";
  } catch {
    return false;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const refreshIntervalInput = document.getElementById("refreshIntervalInput");
  const scheduledTimeInput = document.getElementById("scheduledTimeInput");
  const clearScheduledTimeBtn = document.getElementById("clearScheduledTime");
  const autoToggle = document.getElementById("autoToggle");
  const addFilterBtn = document.getElementById("addFilterBtn");

  // Перевіряємо чи користувач на правильній сторінці
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];

    if (!currentTab.url || !currentTab.url.includes("coins.bank.gov.ua")) {
      showError(
        "Будь ласка, відкрийте сторінку каталогу NBU (coins.bank.gov.ua)"
      );
      refreshIntervalInput.disabled = true;
      scheduledTimeInput.disabled = true;
      clearScheduledTimeBtn.disabled = true;
      autoToggle.disabled = true;
      addFilterBtn.disabled = true;
      return;
    }

    if (!isCatalogOrMainUrl(currentTab.url)) {
      pageMode = "product";
      document.getElementById("filterGroup").classList.add("hidden");
    }

    loadSettings();
  });

  addFilterBtn.addEventListener("click", addFilterItem);
  refreshIntervalInput.addEventListener("change", handleRefreshIntervalChange);
  scheduledTimeInput.addEventListener("change", handleScheduledTimeChange);
  clearScheduledTimeBtn.addEventListener("click", handleClearScheduledTime);
  autoToggle.addEventListener("change", handleToggleChange);

  // Слухаємо повідомлення від content script
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "statusUpdate") {
      updateTrackingStatus(request.status, request.message, request.items || []);
    }
  });

  // Оновлюємо toggle коли content.js автоматично стартує по scheduled time
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.toggleEnabled) {
      const isEnabled = changes.toggleEnabled.newValue;
      autoToggle.checked = isEnabled;
      updateStatusIndicator(isEnabled);
    }
  });
});

/**
 * Рендерить список інпутів для товарів
 */
const renderFilterList = () => {
  const list = document.getElementById("filterList");
  const addBtn = document.getElementById("addFilterBtn");
  if (!list) return;

  list.innerHTML = "";

  filterItemsData.forEach((text, index) => {
    const item = document.createElement("div");
    item.className = "filter-item";

    // Кружечок статусу
    const dot = document.createElement("span");
    dot.className = "status-dot";
    dot.id = `statusDot${index}`;

    // Інпут
    const input = document.createElement("input");
    input.type = "text";
    input.className = "text-input filter-input";
    input.placeholder = "Введіть точну назву товару";
    input.value = text;
    input.setAttribute("aria-label", `Товар ${index + 1}`);
    input.addEventListener("input", () => handleFilterItemChange(index, input.value));
    input.addEventListener("keydown", handleKeyDown);

    // Кнопка видалення
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-product-btn";
    removeBtn.title = "Видалити товар";
    removeBtn.textContent = "×";
    removeBtn.style.visibility = filterItemsData.length === 1 ? "hidden" : "visible";
    removeBtn.addEventListener("click", () => removeFilterItem(index));

    item.appendChild(dot);
    item.appendChild(input);
    item.appendChild(removeBtn);
    list.appendChild(item);
  });

  if (addBtn) {
    addBtn.style.display = filterItemsData.length >= 5 ? "none" : "";
  }
};

/**
 * Обробник зміни тексту одного товару
 */
const handleFilterItemChange = (index, value) => {
  filterItemsData[index] = value;
  saveFilterTexts();
};

/**
 * Додає новий інпут для товару
 */
const addFilterItem = () => {
  if (filterItemsData.length >= 5) return;
  filterItemsData.push("");
  saveFilterTexts();
  renderFilterList();
};

/**
 * Видаляє інпут товару за індексом
 */
const removeFilterItem = (index) => {
  if (filterItemsData.length <= 1) return;
  filterItemsData.splice(index, 1);
  saveFilterTexts();
  renderFilterList();
};

/**
 * Зберігає масив назв товарів в storage
 */
const saveFilterTexts = () => {
  chrome.storage.local.set({ filterTexts: filterItemsData });
};

/**
 * Оновлює статусний кружечок конкретного товару
 */
const updateItemStatus = (name, status) => {
  const index = filterItemsData.findIndex(
    (t) => t.trim().replace(/\s+/g, " ") === name.trim().replace(/\s+/g, " ")
  );
  if (index === -1) return;

  const dot = document.getElementById(`statusDot${index}`);
  if (!dot) return;

  dot.className = "status-dot";
  dot.textContent = "";

  if (status === "clicked") {
    dot.classList.add("done");
    dot.textContent = "✓";
  } else if (status === "not_found") {
    dot.classList.add("not-found");
    dot.textContent = "✕";
  }
};

/**
 * Завантажує збережені налаштування
 */
const loadSettings = () => {
  chrome.storage.local.get(
    ["toggleEnabled", "filterTexts", "productStatuses", "refreshIntervalMs", "scheduledTime"],
    (data) => {
      const refreshIntervalInput = document.getElementById("refreshIntervalInput");
      const scheduledTimeInput = document.getElementById("scheduledTimeInput");
      const autoToggle = document.getElementById("autoToggle");

      // Завантажуємо список товарів (ігноруємо старий filterText)
      if (data.filterTexts && data.filterTexts.length > 0) {
        filterItemsData = data.filterTexts;
      } else {
        filterItemsData = [""];
      }
      renderFilterList();

      refreshIntervalInput.value = data.refreshIntervalMs || 1210;

      if (data.scheduledTime) {
        const scheduledDate = new Date(data.scheduledTime);
        if (scheduledDate <= new Date()) {
          chrome.storage.local.remove("scheduledTime");
        } else {
          scheduledTimeInput.value = data.scheduledTime;
        }
      }

      const hasActiveSchedule =
        data.scheduledTime && new Date(data.scheduledTime) > new Date();

      if (data.toggleEnabled || hasActiveSchedule) {
        autoToggle.checked = true;
        updateStatusIndicator(true, data.scheduledTime && !data.toggleEnabled ? data.scheduledTime : null);

        // Відновлюємо статуси з storage
        if (data.productStatuses && data.productStatuses.length > 0) {
          const allClicked = data.productStatuses.every((i) => i.status === "clicked");
          const overallStatus = allClicked ? "completed" : "searching";
          const overallMessage = allClicked
            ? "Всі товари додано до кошика!"
            : "Шукаю товари на сторінці...";
          updateTrackingStatus(overallStatus, overallMessage, data.productStatuses);
        } else if (data.toggleEnabled) {
          updateTrackingStatus("searching", "Шукаю товари на сторінці...", []);
        }
      } else {
        autoToggle.checked = false;
        updateStatusIndicator(false);
      }
    }
  );
};

/**
 * Обробник зміни toggle
 */
const handleToggleChange = (event) => {
  const isChecked = event.target.checked;

  if (isChecked && pageMode === "catalog") {
    const hasText = filterItemsData.some((t) => t.trim() !== "");
    if (!hasText) {
      event.target.checked = false;
      showError("Спочатку введіть назву хоча б одного товару");
      return;
    }
  }

  if (!isChecked) {
    const scheduledTimeInput = document.getElementById("scheduledTimeInput");
    scheduledTimeInput.value = "";
    chrome.storage.local.remove(["scheduledTime", "productStatuses"]);
    chrome.storage.local.set({ toggleEnabled: false }, () => {
      updateStatusIndicator(false);
      hideTrackingStatus();
      clearAllStatusDots();
      showStatus("⏸️ Відстеження зупинено");
    });
    return;
  }

  // Скидаємо статуси всіх товарів на "searching"
  const resetStatuses = filterItemsData
    .filter((t) => t.trim())
    .map((t) => ({ name: t.trim(), status: "searching" }));
  chrome.storage.local.set({ productStatuses: resetStatuses });
  clearAllStatusDots();

  const scheduledTimeInput = document.getElementById("scheduledTimeInput");
  const scheduledTimeValue = scheduledTimeInput.value;

  if (scheduledTimeValue) {
    const scheduledDate = new Date(scheduledTimeValue);
    if (scheduledDate <= new Date()) {
      event.target.checked = false;
      showError("Запланований час вже минув. Оберіть час у майбутньому.");
      scheduledTimeInput.value = "";
      chrome.storage.local.remove("scheduledTime");
      return;
    }
    chrome.storage.local.set({ scheduledTime: scheduledTimeValue }, () => {
      updateStatusIndicator(true, scheduledTimeValue);
    });
  } else {
    chrome.storage.local.set({ toggleEnabled: true }, () => {
      updateStatusIndicator(true);
      showStatus("🚀 Розпочато відстеження товарів");
    });
  }
};

/**
 * Скидає всі статусні кружечки
 */
const clearAllStatusDots = () => {
  filterItemsData.forEach((_, index) => {
    const dot = document.getElementById(`statusDot${index}`);
    if (dot) {
      dot.className = "status-dot";
      dot.textContent = "";
    }
  });
};

/**
 * Оновлює індикатор статусу
 */
const updateStatusIndicator = (isEnabled, scheduledTime = null) => {
  const statusIndicator = document.getElementById("statusIndicator");

  if (!isEnabled) {
    statusIndicator.textContent = "Вимкнено";
    statusIndicator.className = "status-indicator";
    return;
  }

  if (scheduledTime) {
    const timeStr = new Date(scheduledTime).toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    statusIndicator.textContent = `Заплановано о ${timeStr}`;
    statusIndicator.className = "status-indicator scheduled";
  } else {
    statusIndicator.textContent = "Увімкнено";
    statusIndicator.className = "status-indicator active";
  }
};

/**
 * Обробник Enter у полі фільтру
 */
const handleKeyDown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const autoToggle = document.getElementById("autoToggle");
    const hasText = filterItemsData.some((t) => t.trim() !== "");
    if (!autoToggle.checked && hasText) {
      autoToggle.checked = true;
      handleToggleChange({ target: autoToggle });
    }
  }
};

/**
 * Обробник зміни інтервалу оновлення
 */
const handleRefreshIntervalChange = (event) => {
  let value = parseInt(event.target.value, 10);
  if (isNaN(value)) value = 1210;
  value = Math.min(1210, Math.max(210, value));
  event.target.value = value;
  chrome.storage.local.set({ refreshIntervalMs: value });
};

/**
 * Обробник зміни запланованого часу
 */
const handleScheduledTimeChange = (event) => {
  const value = event.target.value;
  if (!value) return;

  if (new Date(value) <= new Date()) {
    showError("Запланований час вже минув. Оберіть час у майбутньому.");
    event.target.value = "";
  }
};

/**
 * Обробник очищення запланованого часу
 */
const handleClearScheduledTime = () => {
  const scheduledTimeInput = document.getElementById("scheduledTimeInput");
  const autoToggle = document.getElementById("autoToggle");
  scheduledTimeInput.value = "";
  chrome.storage.local.remove("scheduledTime");
  if (autoToggle.checked) {
    chrome.storage.local.get("toggleEnabled", (data) => {
      if (!data.toggleEnabled) {
        autoToggle.checked = false;
        updateStatusIndicator(false);
      }
    });
  }
};

/**
 * Показує повідомлення про статус
 */
const showStatus = (message) => {
  const statusMessage = document.getElementById("statusMessage");
  const statusText = document.getElementById("statusText");
  const errorMessage = document.getElementById("errorMessage");
  statusText.textContent = message;
  statusMessage.classList.remove("hidden");
  errorMessage.classList.add("hidden");
};

/**
 * Ховає повідомлення про статус
 */
const hideStatus = () => {
  document.getElementById("statusMessage").classList.add("hidden");
};

/**
 * Показує повідомлення про помилку
 */
const showError = (message) => {
  const errorMessage = document.getElementById("errorMessage");
  const errorText = document.getElementById("errorText");
  const statusMessage = document.getElementById("statusMessage");
  errorText.textContent = message;
  errorMessage.classList.remove("hidden");
  statusMessage.classList.add("hidden");
  setTimeout(() => errorMessage.classList.add("hidden"), 3000);
};

/**
 * Оновлює статус відстеження товарів
 */
const updateTrackingStatus = (status, message, items = []) => {
  const trackingStatus = document.getElementById("trackingStatus");
  const statusIcon = document.getElementById("statusIcon");
  const statusDescription = document.getElementById("statusDescription");

  trackingStatus.classList.remove("hidden");

  const icons = {
    searching: "🔍",
    clicking: "👆",
    waiting: "⏳",
    completed: "✅",
    error: "❌",
  };

  statusIcon.textContent = icons[status] || "🔍";
  statusDescription.textContent = message;

  // Оновлюємо статус кожного товару
  items.forEach((item) => {
    updateItemStatus(item.name, item.status);
  });

  if (status === "completed") {
    const autoToggle = document.getElementById("autoToggle");
    autoToggle.checked = false;
    updateStatusIndicator(false);
    setTimeout(() => hideTrackingStatus(), 3000);
  }
};

/**
 * Ховає статус відстеження
 */
const hideTrackingStatus = () => {
  document.getElementById("trackingStatus").classList.add("hidden");
};
