// Content script з автоматичним моніторингом та фільтрацією товарів

let refreshInterval = null;
let scheduleTimeout = null;
let isEnabled = false;
let currentFilterText = "";

// Ініціалізація при завантаженні сторінки
const initializeMonitoring = () => {
  chrome.storage.local.get(
    ["toggleEnabled", "filterText", "refreshIntervalMs", "scheduledTime"],
    (data) => {
      currentFilterText = data.filterText || "";
      const intervalMs = data.refreshIntervalMs || 1210;

      if (data.toggleEnabled && currentFilterText) {
        isEnabled = true;
        checkProduct();
        startPageRefresh(intervalMs);
      } else if (data.scheduledTime && !data.toggleEnabled && currentFilterText) {
        const scheduledDate = new Date(data.scheduledTime);
        const now = new Date();
        if (scheduledDate > now) {
          const delay = scheduledDate - now;
          scheduleTimeout = setTimeout(() => {
            scheduleTimeout = null;
            if (!currentFilterText) return;
            isEnabled = true;
            chrome.storage.local.set({ toggleEnabled: true });
            checkProduct();
            startPageRefresh(intervalMs);
          }, delay);
        }
      }
    }
  );
};

// Слухаємо зміни в storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local") {
    if (changes.toggleEnabled) {
      isEnabled = changes.toggleEnabled.newValue;

      if (isEnabled) {
        chrome.storage.local.get(["filterText", "refreshIntervalMs"], (data) => {
          currentFilterText = data.filterText || "";
          checkProduct();
          startPageRefresh(data.refreshIntervalMs || 1210);
        });
      } else {
        stopPageRefresh();
        if (scheduleTimeout) {
          clearTimeout(scheduleTimeout);
          scheduleTimeout = null;
        }
      }
    }

    if (changes.filterText) {
      currentFilterText = changes.filterText.newValue || "";
    }

    if (changes.refreshIntervalMs && isEnabled) {
      stopPageRefresh();
      startPageRefresh(changes.refreshIntervalMs.newValue || 1210);
    }

    if (changes.scheduledTime) {
      if (scheduleTimeout) {
        clearTimeout(scheduleTimeout);
        scheduleTimeout = null;
      }

      const newScheduledTime = changes.scheduledTime.newValue;
      if (newScheduledTime && !isEnabled) {
        const scheduledDate = new Date(newScheduledTime);
        const now = new Date();
        if (scheduledDate > now) {
          chrome.storage.local.get(["refreshIntervalMs", "filterText"], (data) => {
            currentFilterText = data.filterText || "";
            const intervalMs = data.refreshIntervalMs || 1210;
            const delay = scheduledDate - now;
            scheduleTimeout = setTimeout(() => {
              scheduleTimeout = null;
              if (!currentFilterText) return;
              isEnabled = true;
              chrome.storage.local.set({ toggleEnabled: true });
              checkProduct();
              startPageRefresh(intervalMs);
            }, delay);
          });
        }
      }
    }
  }
});

/**
 * Запускає автоматичний refresh сторінки
 */
const startPageRefresh = (intervalMs) => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(() => {
    if (isEnabled) {
      location.reload();
    }
  }, intervalMs);
};

/**
 * Зупиняє автоматичний refresh сторінки
 */
const stopPageRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

/**
 * Перевіряє стан товару та виконує необхідні дії
 */
const checkProduct = () => {
  try {
    if (!currentFilterText || currentFilterText.trim() === "") {
      return;
    }

    const searchText = currentFilterText.trim();
    const products = document.querySelectorAll(".product");

    let targetProduct = null;
    const normalizedSearchText = searchText.replace(/\s+/g, " ");

    products.forEach((product) => {
      const modelElement = product.querySelector(".model_product");
      if (!modelElement) return;

      const productName = modelElement.textContent.trim().replace(/\s+/g, " ");

      if (productName === normalizedSearchText) {
        targetProduct = product;
      }
    });

    if (!targetProduct) {
      console.log("Товар не знайдено. Очікування refresh...");
      notifyPopup({
        status: "searching",
        message: "Шукаю товар на сторінці...",
      });
      return;
    }

    console.log("Товар знайдено:", searchText);

    const button = targetProduct.querySelector(".main-basked-icon");
    if (!button) {
      console.log("Кнопка не знайдена");
      notifyPopup({
        status: "error",
        message: "Товар знайдено, але кнопка відсутня",
      });
      return;
    }

    if (
      button.classList.contains("gray") ||
      button.classList.contains("clicked")
    ) {
      console.log("Товар знайдено, але кнопка недоступна. Очікування...");
      notifyPopup({
        status: "waiting",
        message: "Товар знайдено! Очікую доступності товару...",
      });
      return;
    }

    console.log("Товар знайдено, зупиняю refresh...");
    isEnabled = false;
    stopPageRefresh();

    console.log("Клікаю на кнопку додавання...");
    button.click();

    chrome.storage.local.set({ toggleEnabled: false }, () => {
      notifyPopup({
        status: "completed",
        message: "Клік виконано! Товар додається до кошика.",
      });
    });
  } catch (error) {
    console.error("Помилка при перевірці товару:", error);
  }
};

/**
 * Відправляє оновлення статусу до popup
 */
const notifyPopup = (data) => {
  try {
    chrome.runtime.sendMessage({
      action: "statusUpdate",
      status: data.status,
      message: data.message,
    });
  } catch (error) {
    // Popup може бути закритий - це нормально
  }
};

// Ініціалізуємо при завантаженні - чекаємо поки DOM буде готовий
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeMonitoring);
} else {
  initializeMonitoring();
}

// Cleanup при вивантаженні сторінки
window.addEventListener("beforeunload", () => {
  stopPageRefresh();
  if (scheduleTimeout) {
    clearTimeout(scheduleTimeout);
  }
});
