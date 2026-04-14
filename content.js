// Content script з автоматичним моніторингом та фільтрацією товарів

let refreshInterval = null;
let scheduleTimeout = null;
let isEnabled = false;
let filterTexts = []; // масив назв товарів
let persistedStatuses = {}; // name → "clicked" | "not_found" | "searching"
let isClickingInProgress = false;
let cancelClicking = false;

const isCatalogOrMainPage = () => {
  const { pathname } = window.location;
  return pathname === "/" || pathname === "" || pathname === "/catalog.html";
};

// Ініціалізація при завантаженні сторінки
const initializeMonitoring = () => {
  chrome.storage.local.get(
    ["toggleEnabled", "filterTexts", "productStatuses", "refreshIntervalMs", "scheduledTime"],
    (data) => {
      filterTexts = (data.filterTexts || []).filter((t) => t.trim() !== "");
      const intervalMs = data.refreshIntervalMs || 1210;

      // Завантажуємо збережені статуси
      persistedStatuses = {};
      if (data.productStatuses) {
        data.productStatuses.forEach((item) => {
          persistedStatuses[item.name] = item.status;
        });
      }

      if (isCatalogOrMainPage()) {
        if (data.toggleEnabled && filterTexts.length > 0) {
          isEnabled = true;
          checkProducts();
          startPageRefresh(intervalMs);
        } else if (data.scheduledTime && !data.toggleEnabled && filterTexts.length > 0) {
          const scheduledDate = new Date(data.scheduledTime);
          const now = new Date();
          if (scheduledDate > now) {
            const delay = scheduledDate - now;
            scheduleTimeout = setTimeout(() => {
              scheduleTimeout = null;
              if (filterTexts.length === 0) return;
              isEnabled = true;
              chrome.storage.local.set({ toggleEnabled: true });
              checkProducts();
              startPageRefresh(intervalMs);
            }, delay);
          }
        }
      } else {
        if (data.toggleEnabled) {
          isEnabled = true;
          checkProductPage();
          startPageRefresh(intervalMs);
        } else if (data.scheduledTime && !data.toggleEnabled) {
          const scheduledDate = new Date(data.scheduledTime);
          const now = new Date();
          if (scheduledDate > now) {
            const delay = scheduledDate - now;
            scheduleTimeout = setTimeout(() => {
              scheduleTimeout = null;
              isEnabled = true;
              chrome.storage.local.set({ toggleEnabled: true });
              checkProductPage();
              startPageRefresh(intervalMs);
            }, delay);
          }
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

      if (!isEnabled) {
        cancelClicking = true;
        stopPageRefresh();
        if (scheduleTimeout) {
          clearTimeout(scheduleTimeout);
          scheduleTimeout = null;
        }
      } else {
        cancelClicking = false;
        if (isCatalogOrMainPage()) {
          chrome.storage.local.get(["filterTexts", "refreshIntervalMs"], (data) => {
            filterTexts = (data.filterTexts || []).filter((t) => t.trim() !== "");
            checkProducts();
            startPageRefresh(data.refreshIntervalMs || 1210);
          });
        } else {
          chrome.storage.local.get(["refreshIntervalMs"], (data) => {
            checkProductPage();
            startPageRefresh(data.refreshIntervalMs || 1210);
          });
        }
      }
    }

    if (changes.filterTexts) {
      filterTexts = (changes.filterTexts.newValue || []).filter((t) => t.trim() !== "");
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
          chrome.storage.local.get(["refreshIntervalMs", "filterTexts"], (data) => {
            filterTexts = (data.filterTexts || []).filter((t) => t.trim() !== "");
            const intervalMs = data.refreshIntervalMs || 1210;
            const delay = scheduledDate - now;
            if (isCatalogOrMainPage()) {
              scheduleTimeout = setTimeout(() => {
                scheduleTimeout = null;
                if (filterTexts.length === 0) return;
                isEnabled = true;
                cancelClicking = false;
                chrome.storage.local.set({ toggleEnabled: true });
                checkProducts();
                startPageRefresh(intervalMs);
              }, delay);
            } else {
              scheduleTimeout = setTimeout(() => {
                scheduleTimeout = null;
                isEnabled = true;
                cancelClicking = false;
                chrome.storage.local.set({ toggleEnabled: true });
                checkProductPage();
                startPageRefresh(intervalMs);
              }, delay);
            }
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
    if (isEnabled && !isClickingInProgress) {
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
 * Зберігає статуси товарів в storage
 */
const saveStatusesToStorage = (items) => {
  chrome.storage.local.set({ productStatuses: items });
};

/**
 * Чекає поки клас clicked зникне з будь-якої кнопки кошика (polling кожні 50мс)
 */
const waitForClickedToDisappear = () => {
  return new Promise((resolve) => {
    const check = () => {
      const clickedBtn = document.querySelector(
        ".main-basked-icon.add2cart.clicked"
      );
      if (!clickedBtn) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    setTimeout(check, 50);
  });
};

/**
 * Перевіряє всі товари зі списку та клікає доступні по черзі
 */
const checkProducts = async () => {
  if (filterTexts.length === 0 || isClickingInProgress) return;

  try {
    const products = document.querySelectorAll(".product");

    // Будуємо Map: назва товару → DOM елемент
    const productMap = new Map();
    products.forEach((product) => {
      const modelEl = product.querySelector(".model_product");
      if (!modelEl) return;
      const name = modelEl.textContent.trim().replace(/\s+/g, " ");
      productMap.set(name, product);
    });

    const toClick = []; // знайдені з доступною кнопкою
    const notFound = []; // відсутні в DOM (і не кліковані раніше)
    const itemStatuses = []; // поточний стан для storage і попапу

    for (const text of filterTexts) {
      // Якщо вже клікали раніше — зберігаємо статус "clicked"
      if (persistedStatuses[text] === "clicked") {
        itemStatuses.push({ name: text, status: "clicked" });
        continue;
      }

      const normalized = text.trim().replace(/\s+/g, " ");
      const productEl = productMap.get(normalized);

      if (!productEl) {
        notFound.push(text);
        itemStatuses.push({ name: text, status: "not_found" });
        continue;
      }

      const button = productEl.querySelector(".main-basked-icon");
      if (!button || button.classList.contains("gray") || button.classList.contains("clicked")) {
        itemStatuses.push({ name: text, status: "searching" });
        continue;
      }

      toClick.push({ text, button });
      itemStatuses.push({ name: text, status: "searching" });
    }

    // Зберігаємо поточний стан і повідомляємо попап
    saveStatusesToStorage(itemStatuses);

    if (toClick.length === 0) {
      notifyPopup({
        status: "searching",
        message:
          notFound.length > 0
            ? `Шукаю товари на сторінці... (не знайдено: ${notFound.length})`
            : "Шукаю товари на сторінці...",
        items: itemStatuses,
      });
      return;
    }

    // Є що клікати — зупиняємо refresh
    isClickingInProgress = true;
    cancelClicking = false;
    stopPageRefresh();

    for (let i = 0; i < toClick.length; i++) {
      if (cancelClicking) break;

      const { text, button } = toClick[i];
      button.click();

      // Оновлюємо персистентний стан
      persistedStatuses[text] = "clicked";

      // Формуємо актуальний список статусів
      const currentItems = filterTexts.map((t) => {
        if (persistedStatuses[t] === "clicked") return { name: t, status: "clicked" };
        const normalized = t.trim().replace(/\s+/g, " ");
        if (!productMap.has(normalized)) return { name: t, status: "not_found" };
        return { name: t, status: "searching" };
      });

      saveStatusesToStorage(currentItems);
      notifyPopup({
        status: "clicking",
        message: `Клікнуто: ${text}`,
        items: currentItems,
      });

      // Чекаємо поки clicked зникне перед наступним кліком
      if (i < toClick.length - 1) {
        await waitForClickedToDisappear();
      }
    }

    isClickingInProgress = false;

    if (cancelClicking) return;

    // Перевіряємо чи всі товари вже клікнуто
    const allDone = filterTexts.every((t) => persistedStatuses[t] === "clicked");

    if (allDone) {
      const finalItems = filterTexts.map((t) => ({ name: t, status: "clicked" }));
      saveStatusesToStorage(finalItems);
      chrome.storage.local.set({ toggleEnabled: false });
      isEnabled = false;

      notifyPopup({
        status: "completed",
        message: "Всі товари додано до кошика!",
        items: finalItems,
      });
    } else {
      // Є незнайдені — продовжуємо refresh
      const finalItems = filterTexts.map((t) => {
        if (persistedStatuses[t] === "clicked") return { name: t, status: "clicked" };
        if (notFound.includes(t)) return { name: t, status: "not_found" };
        return { name: t, status: "searching" };
      });

      saveStatusesToStorage(finalItems);
      notifyPopup({
        status: "searching",
        message: "Деякі товари не знайдено, продовжую пошук...",
        items: finalItems,
      });

      chrome.storage.local.get("refreshIntervalMs", (data) => {
        startPageRefresh(data.refreshIntervalMs || 1210);
      });
    }
  } catch (error) {
    isClickingInProgress = false;
    console.error("Помилка при перевірці товарів:", error);
  }
};

/**
 * Перевіряє наявність кнопки «Купити» на сторінці товару
 */
const checkProductPage = () => {
  try {
    const button = document.querySelector("button.btn-primary.buy");

    if (!button) {
      console.log("Кнопка «Купити» відсутня. Очікування...");
      notifyPopup({
        status: "waiting",
        message: "Очікую появи кнопки «Купити»...",
        items: [],
      });
      return;
    }

    console.log("Кнопка «Купити» знайдена, клікаю...");
    isEnabled = false;
    stopPageRefresh();
    button.click();

    chrome.storage.local.set({ toggleEnabled: false }, () => {
      notifyPopup({
        status: "completed",
        message: "Клік виконано! Товар додається до кошика.",
        items: [],
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
      items: data.items || [],
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
