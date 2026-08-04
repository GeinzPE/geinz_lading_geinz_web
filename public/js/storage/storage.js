// ═══════════════════════════════════════════
//  LIMPIEZA TOTAL DE STORAGE
// ═══════════════════════════════════════════
const StorageCleaner = {
  /**
   * Limpia TODO: localStorage, sessionStorage, cookies del dominio,
   * y notifica a todos los iframes hijos para que hagan lo mismo.
   *
   * @param {boolean} recargarIframes - Si true, fuerza recarga de los iframes tras notificar.
   * @param {boolean} notificar - Si true, envía postMessage a los iframes hijos.
   *                              Ponlo en false cuando esta función se ejecute
   *                              DENTRO de un iframe hijo, para evitar bucles.
   */
  limpiarTodo({ recargarIframes = false, notificar = true } = {}) {
    // 1. localStorage completo
    try {
      localStorage.clear();
    } catch (e) {
      console.warn("No se pudo limpiar localStorage:", e);
    }

    // 2. sessionStorage completo
    try {
      sessionStorage.clear();
    } catch (e) {
      console.warn("No se pudo limpiar sessionStorage:", e);
    }

    // 3. Cookies accesibles desde JS (no httpOnly)
    this._limpiarCookies();

    // 4. Avisar a todos los iframes hijos (solo si aplica)
    if (notificar) {
      this._notificarIframes(recargarIframes);
    }

    console.log("🧹 Storage limpiado por completo (local + session + cookies)");
  },

  _limpiarCookies() {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf("=");
      const nombre = (eqPos > -1 ? cookie.substr(0, eqPos) : cookie).trim();
      if (!nombre) continue;

      // Borra la cookie en distintas combinaciones de path/domain
      // para asegurar que se elimine sin importar cómo se creó
      document.cookie = `${nombre}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
      document.cookie = `${nombre}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=${window.location.hostname}`;
      document.cookie = `${nombre}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=.${window.location.hostname}`;
    }
  },

  _notificarIframes(recargar) {
    document.querySelectorAll("iframe").forEach((frame) => {
      try {
        // Mensaje para que el iframe (si escucha) limpie su propio storage
        frame.contentWindow?.postMessage(
          { type: "LIMPIAR_STORAGE_TOTAL" },
          "*",
        );

        // Opcional: forzar recarga del iframe para matar cualquier variable en memoria
        if (recargar && frame.src) {
          const src = frame.src;
          frame.src = "about:blank";
          setTimeout(() => (frame.src = src), 50);
        }
      } catch (e) {
        console.warn("No se pudo notificar/recargar iframe:", e);
      }
    });
  },
};

window.StorageCleaner = StorageCleaner;