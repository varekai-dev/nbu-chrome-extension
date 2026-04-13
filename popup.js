// Popup script для управління автоматичним додаванням товарів

let pageMode = "catalog"; // "catalog" | "product"

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
  const filterInput = document.getElementById("filterInput");
  const refreshIntervalInput = document.getElementById("refreshIntervalInput");
  const scheduledTimeInput = document.getElementById("scheduledTimeInput");
  const clearScheduledTimeBtn = document.getElementById("clearScheduledTime");
  const autoToggle = document.getElementById("autoToggle");

  // Перевіряємо чи користувач на правильній сторінці
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];

    if (!currentTab.url || !currentTab.url.includes("coins.bank.gov.ua")) {
      showError(
        "Будь ласка, відкрийте сторінку каталогу NBU (coins.bank.gov.ua)"
      );
      filterInput.disabled = true;
      refreshIntervalInput.disabled = true;
      scheduledTimeInput.disabled = true;
      clearScheduledTimeBtn.disabled = true;
      autoToggle.disabled = true;
      return;
    }

    if (!isCatalogOrMainUrl(currentTab.url)) {
      pageMode = "product";
      document.getElementById("filterGroup").classList.add("hidden");
    }

    loadSettings();
  });

  filterInput.addEventListener("input", handleFilterChange);
  filterInput.addEventListener("keydown", handleKeyDown);
  refreshIntervalInput.addEventListener("change", handleRefreshIntervalChange);
  scheduledTimeInput.addEventListener("change", handleScheduledTimeChange);
  clearScheduledTimeBtn.addEventListener("click", handleClearScheduledTime);
  autoToggle.addEventListener("change", handleToggleChange);

  // Слухаємо повідомлення від content script
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "statusUpdate") {
      updateTrackingStatus(request.status, request.message);
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
 * Завантажує збережені налаштування
 */
const loadSettings = () => {
  chrome.storage.local.get(
    ["toggleEnabled", "filterText", "refreshIntervalMs", "scheduledTime"],
    (data) => {
      const filterInput = document.getElementById("filterInput");
      const refreshIntervalInput = document.getElementById("refreshIntervalInput");
      const scheduledTimeInput = document.getElementById("scheduledTimeInput");
      const autoToggle = document.getElementById("autoToggle");

      if (data.filterText) {
        filterInput.value = data.filterText;
      }

      refreshIntervalInput.value = data.refreshIntervalMs || 1210;

      if (data.scheduledTime) {
        const scheduledDate = new Date(data.scheduledTime);
        if (scheduledDate <= new Date()) {
          chrome.storage.local.remove("scheduledTime");
        } else {
          scheduledTimeInput.value = data.scheduledTime;
        }
      }

      // Toggle увімкнений або є активний scheduled time → показуємо як увімкнений
      const hasActiveSchedule =
        data.scheduledTime && new Date(data.scheduledTime) > new Date();

      if (data.toggleEnabled || hasActiveSchedule) {
        autoToggle.checked = true;
        updateStatusIndicator(true, data.scheduledTime && !data.toggleEnabled ? data.scheduledTime : null);
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
  const filterInput = document.getElementById("filterInput");
  const filterText = filterInput.value.trim();

  if (isChecked && pageMode === "catalog" && filterText === "") {
    event.target.checked = false;
    showError("Спочатку введіть текст для пошуку товарів");
    filterInput.focus();
    return;
  }

  if (!isChecked) {
    // Вимикаємо — скасовуємо і моніторинг, і scheduled time
    const scheduledTimeInput = document.getElementById("scheduledTimeInput");
    scheduledTimeInput.value = "";
    chrome.storage.local.remove("scheduledTime");
    chrome.storage.local.set({ toggleEnabled: false }, () => {
      updateStatusIndicator(false);
      hideTrackingStatus();
      showStatus("⏸️ Відстеження зупинено");
    });
    return;
  }

  // Вмикаємо — перевіряємо чи є запланований час
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
    // Зберігаємо час → content.js підхопить і встановить таймер
    chrome.storage.local.set({ scheduledTime: scheduledTimeValue }, () => {
      updateStatusIndicator(true, scheduledTimeValue);
    });
  } else {
    // Старт одразу
    chrome.storage.local.set({ toggleEnabled: true }, () => {
      updateStatusIndicator(true);
      showStatus("🚀 Розпочато відстеження товару");
    });
  }
};

/**
 * Оновлює індикатор статусу
 * @param {boolean} isEnabled
 * @param {string|null} scheduledTime — якщо є, показує "Заплановано о HH:MM:SS"
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
 * Обробник зміни тексту фільтру
 */
const handleFilterChange = (event) => {
  const filterText = event.target.value;
  chrome.storage.local.set({ filterText }, () => {
    if (filterText.trim() === "") {
      showStatus("Введіть текст для пошуку товарів");
    } else {
      hideStatus();
    }
  });
};

/**
 * Обробник Enter у полі фільтру
 */
const handleKeyDown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const autoToggle = document.getElementById("autoToggle");
    if (!autoToggle.checked && event.target.value.trim() !== "") {
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
 * Обробник зміни запланованого часу (тільки валідація, без збереження в storage)
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
  // Якщо toggle увімкнений але лише через scheduled time — вимикаємо
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
 * Оновлює статус відстеження товару
 */
const updateTrackingStatus = (status, message) => {
  const trackingStatus = document.getElementById("trackingStatus");
  const statusIcon = document.getElementById("statusIcon");
  const statusDescription = document.getElementById("statusDescription");

  trackingStatus.classList.remove("hidden");

  const icons = {
    searching: "🔍",
    clicked: "👆",
    waiting: "⏳",
    completed: "✅",
    error: "❌",
  };

  statusIcon.textContent = icons[status] || "🔍";
  statusDescription.textContent = message;

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
