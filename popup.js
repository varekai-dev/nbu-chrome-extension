// Popup script для управління автоматичним додаванням товарів

document.addEventListener("DOMContentLoaded", () => {
  const filterInput = document.getElementById("filterInput");
  const autoToggle = document.getElementById("autoToggle");
  const statusIndicator = document.getElementById("statusIndicator");
  const statusMessage = document.getElementById("statusMessage");
  const statusText = document.getElementById("statusText");
  const errorMessage = document.getElementById("errorMessage");
  const errorText = document.getElementById("errorText");

  // Перевіряємо чи користувач на правильній сторінці
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];

    if (!currentTab.url || !currentTab.url.includes("coins.bank.gov.ua")) {
      showError(
        "Будь ласка, відкрийте сторінку каталогу NBU (coins.bank.gov.ua)"
      );
      filterInput.disabled = true;
      autoToggle.disabled = true;
      return;
    }

    // Завантажуємо збережені налаштування
    loadSettings();
  });

  // Обробник зміни тексту фільтру
  filterInput.addEventListener("input", handleFilterChange);
  filterInput.addEventListener("keydown", handleKeyDown);

  // Обробник зміни toggle
  autoToggle.addEventListener("change", handleToggleChange);

  // Слухаємо повідомлення від content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "statusUpdate") {
      updateTrackingStatus(request.status, request.message);
    }
  });
});

/**
 * Завантажує збережені налаштування
 */
const loadSettings = () => {
  chrome.storage.local.get(["toggleEnabled", "filterText"], (data) => {
    const filterInput = document.getElementById("filterInput");
    const autoToggle = document.getElementById("autoToggle");

    // Встановлюємо збережені значення
    if (data.filterText) {
      filterInput.value = data.filterText;
    }

    if (data.toggleEnabled) {
      autoToggle.checked = true;
      updateStatusIndicator(true);
    } else {
      autoToggle.checked = false;
      updateStatusIndicator(false);
    }
  });
};

/**
 * Обробник зміни тексту фільтру
 */
const handleFilterChange = (event) => {
  const filterText = event.target.value;

  // Зберігаємо в storage
  chrome.storage.local.set({ filterText: filterText }, () => {
    if (filterText.trim() === "") {
      showStatus("Введіть текст для пошуку товарів");
    } else {
      hideStatus();
    }
  });
};

/**
 * Обробник натискання клавіші для доступності
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
 * Обробник зміни toggle
 */
const handleToggleChange = (event) => {
  const isEnabled = event.target.checked;
  const filterInput = document.getElementById("filterInput");
  const filterText = filterInput.value.trim();

  // Перевіряємо чи введено текст
  if (isEnabled && filterText === "") {
    event.target.checked = false;
    showError("Спочатку введіть текст для пошуку товарів");
    filterInput.focus();
    return;
  }

  // Зберігаємо стан в storage
  chrome.storage.local.set({ toggleEnabled: isEnabled }, () => {
    updateStatusIndicator(isEnabled);

    if (isEnabled) {
      showStatus("🚀 Розпочато відстеження товару");
    } else {
      showStatus("⏸️ Відстеження зупинено");
      hideTrackingStatus();
    }
  });
};

/**
 * Оновлює індикатор статусу
 */
const updateStatusIndicator = (isEnabled) => {
  const statusIndicator = document.getElementById("statusIndicator");

  if (isEnabled) {
    statusIndicator.textContent = "Увімкнено";
    statusIndicator.classList.add("active");
  } else {
    statusIndicator.textContent = "Вимкнено";
    statusIndicator.classList.remove("active");
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
  const statusMessage = document.getElementById("statusMessage");
  statusMessage.classList.add("hidden");
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

  // Автоматично ховаємо через 3 секунди
  setTimeout(() => {
    errorMessage.classList.add("hidden");
  }, 3000);
};

/**
 * Оновлює статус відстеження товару
 */
const updateTrackingStatus = (status, message) => {
  const trackingStatus = document.getElementById("trackingStatus");
  const statusIcon = document.getElementById("statusIcon");
  const statusDescription = document.getElementById("statusDescription");

  // Показуємо статус
  trackingStatus.classList.remove("hidden");

  // Оновлюємо іконку в залежності від статусу
  const icons = {
    searching: "🔍",
    clicked: "👆",
    waiting: "⏳",
    completed: "✅",
    error: "❌",
  };

  statusIcon.textContent = icons[status] || "🔍";
  statusDescription.textContent = message;

  // Якщо завдання виконано, вимикаємо toggle та ховаємо статус через 3 секунди
  if (status === "completed") {
    const autoToggle = document.getElementById("autoToggle");
    autoToggle.checked = false;
    updateStatusIndicator(false);

    setTimeout(() => {
      hideTrackingStatus();
    }, 3000);
  }
};

/**
 * Ховає статус відстеження
 */
const hideTrackingStatus = () => {
  const trackingStatus = document.getElementById("trackingStatus");
  trackingStatus.classList.add("hidden");
};
