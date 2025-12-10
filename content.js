// Content script з автоматичним моніторингом та фільтрацією товарів

let monitoringInterval = null;
let refreshInterval = null;
let addedProductsCount = 0;
let isEnabled = false;
let currentFilterText = "";

// Ініціалізація при завантаженні сторінки
const initializeMonitoring = () => {
  chrome.storage.local.get(["toggleEnabled", "filterText"], (data) => {
    if (data.toggleEnabled && data.filterText) {
      isEnabled = true;
      currentFilterText = data.filterText;
      startMonitoring();
      startPageRefresh();
    }
  });
};

// Слухаємо зміни в storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local") {
    if (changes.toggleEnabled) {
      isEnabled = changes.toggleEnabled.newValue;

      if (isEnabled) {
        chrome.storage.local.get(["filterText"], (data) => {
          currentFilterText = data.filterText || "";
          startMonitoring();
          startPageRefresh();
        });
      } else {
        stopMonitoring();
        stopPageRefresh();
      }
    }

    if (changes.filterText) {
      currentFilterText = changes.filterText.newValue || "";
    }
  }
});

// Слухаємо повідомлення від popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getStats") {
    sendResponse({
      addedCount: addedProductsCount,
      isEnabled: isEnabled,
    });
  }
  return true;
});

/**
 * Запускає автоматичний refresh сторінки кожну секунду
 */
const startPageRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(() => {
    if (isEnabled) {
      location.reload();
    }
  }, 1000);
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
 * Запускає моніторинг товарів
 */
const startMonitoring = () => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  // Запускаємо першу перевірку одразу
  checkAndAddProducts();

  // Потім кожні 2 секунди
  monitoringInterval = setInterval(() => {
    if (isEnabled) {
      checkAndAddProducts();
    }
  }, 2000);
};

/**
 * Зупиняє моніторинг товарів
 */
const stopMonitoring = () => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  addedProductsCount = 0;
};

/**
 * Перевіряє та додає товари в кошик
 */
const checkAndAddProducts = () => {
  try {
    // Якщо немає фільтру - нічого не робимо
    if (!currentFilterText || currentFilterText.trim() === "") {
      return;
    }

    const filter = currentFilterText.toLowerCase().trim();
    const products = document.querySelectorAll(".product");

    let addedInThisCycle = 0;

    products.forEach((product) => {
      try {
        // Знаходимо елемент з назвою товару
        const modelElement = product.querySelector(".model_product");
        if (!modelElement) return;

        // Отримуємо текст назви товару
        const productName = modelElement.textContent.toLowerCase().trim();

        // Перевіряємо чи співпадає з фільтром (case-insensitive, partial match)
        if (!productName.includes(filter)) return;

        // Знаходимо кнопку додавання в кошик
        const button = product.querySelector(".main-basked-icon.add2cart");
        if (!button) return;

        // Перевіряємо чи товар вже додано (чи є класи clicked та yellow)
        if (
          button.classList.contains("clicked") &&
          button.classList.contains("yellow")
        ) {
          return; // Пропускаємо вже додані товари
        }

        // Клікаємо на кнопку
        button.click();
        addedInThisCycle++;
        addedProductsCount++;
      } catch (error) {
        console.error("Помилка при обробці товару:", error);
      }
    });

    // Якщо додали товари, відправляємо статистику
    if (addedInThisCycle > 0) {
      notifyPopup();
    }
  } catch (error) {
    console.error("Помилка при перевірці товарів:", error);
  }
};

/**
 * Відправляє оновлену статистику до popup
 */
const notifyPopup = () => {
  try {
    chrome.runtime.sendMessage({
      action: "statsUpdate",
      addedCount: addedProductsCount,
    });
  } catch (error) {
    // Popup може бути закритий - це нормально
  }
};

// Ініціалізуємо при завантаженні
initializeMonitoring();

// Cleanup при вивантаженні сторінки
window.addEventListener("beforeunload", () => {
  stopMonitoring();
  stopPageRefresh();
});
