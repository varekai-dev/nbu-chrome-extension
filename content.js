// Content script з автоматичним моніторингом та фільтрацією товарів

let monitoringInterval = null;
let refreshInterval = null;
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

/**
 * Запускає автоматичний refresh сторінки кожні 1210 мс
 */
const startPageRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(() => {
    if (isEnabled) {
      location.reload();
    }
  }, 1210);
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

  // Чекаємо поки товари з'являться на сторінці
  const waitForProducts = () => {
    const products = document.querySelectorAll(".product");
    if (products.length > 0) {
      // Товари знайдені, починаємо моніторинг
      console.log("Сторінка завантажена, знайдено товарів:", products.length);
      checkProduct();

      // Потім кожні 500мс
      monitoringInterval = setInterval(() => {
        if (isEnabled) {
          checkProduct();
        }
      }, 500);
    } else {
      // Товари ще не з'явилися, чекаємо ще трохи
      console.log("Очікування завантаження товарів...");
      setTimeout(waitForProducts, 300);
    }
  };

  waitForProducts();
};

/**
 * Зупиняє моніторинг товарів
 */
const stopMonitoring = () => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
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

    // Шукаємо товар за точною назвою
    let targetProduct = null;
    // Нормалізуємо пошуковий текст (замінюємо множинні пробіли на один)
    const normalizedSearchText = searchText.replace(/\s+/g, " ");

    products.forEach((product) => {
      const modelElement = product.querySelector(".model_product");
      if (!modelElement) return;

      // Нормалізуємо текст товару (замінюємо множинні пробіли на один)
      const productName = modelElement.textContent.trim().replace(/\s+/g, " ");

      // Точна відповідність назви після нормалізації пробілів
      if (productName === normalizedSearchText) {
        targetProduct = product;
      }
    });

    // Товар не знайдено - сторінка буде оновлена через 1 секунду
    if (!targetProduct) {
      console.log("Товар не знайдено. Очікування refresh...");
      notifyPopup({
        status: "searching",
        message: "Шукаю товар на сторінці...",
      });
      return;
    }

    // Товар знайдено
    console.log("Товар знайдено:", searchText);

    // Знаходимо кнопку
    const button = targetProduct.querySelector(".main-basked-icon");
    if (!button) {
      console.log("Кнопка не знайдена");
      notifyPopup({
        status: "error",
        message: "Товар знайдено, але кнопка відсутня",
      });
      return;
    }

    // Перевіряємо чи кнопка недоступна
    if (
      button.classList.contains("gray") ||
      button.classList.contains("clicked")
    ) {
      console.log("Товар знайдено, але кнопка недоступна. Очікування...");
      notifyPopup({
        status: "waiting",
        message: "Товар знайдено! Очікую доступності товару...",
      });
      // Продовжуємо моніторинг і refresh - сторінка буде оновлена через 1 секунду
      return;
    }

    // СПОЧАТКУ зупиняємо все (перед кліком!)
    console.log("Товар знайдено, зупиняю моніторинг і refresh...");
    isEnabled = false;
    stopMonitoring();
    stopPageRefresh();

    // Тепер клікаємо на кнопку
    console.log("Клікаю на кнопку додавання...");
    button.click();

    // Оновлюємо storage і відправляємо повідомлення
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
  // DOM ще завантажується
  document.addEventListener("DOMContentLoaded", () => {
    // Додаємо затримку після завантаження DOM для завантаження товарів
    setTimeout(() => {
      initializeMonitoring();
    }, 1000);
  });
} else {
  // DOM вже завантажений
  setTimeout(() => {
    initializeMonitoring();
  }, 1000);
}

// Cleanup при вивантаженні сторінки
window.addEventListener("beforeunload", () => {
  stopMonitoring();
  stopPageRefresh();
});
