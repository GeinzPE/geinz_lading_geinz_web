import { initLegalTextPage } from "./legal-text-core.js";
import { politicasPrivacidadDoc } from "../js/rutas/rutas.js"; // ⚠️ ajusta esta ruta a donde tengas paths.js

initLegalTextPage({
  getContenidoDoc: (localidad, negocioId) => politicasPrivacidadDoc(localidad, negocioId),
  footerFlag: "politicas_privacidad", // requiere biz.footer.activo === true y biz.footer.politicas_privacidad === true
  tituloFallback: "Políticas de Privacidad",
  labelSuperior: "Políticas de Privacidad",
  pathPrefix: "/legal/politicas_privacidad/", // compatibilidad con links viejos
  seccion: "politicas_privacidad", // habilita /perfil/{alias}/politicas_privacidad
});