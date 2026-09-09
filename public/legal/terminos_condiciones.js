import { initLegalTextPage } from "./legal-text-core.js";
import { terminosCondicionesDoc } from "../js/rutas/rutas.js"; // ⚠️ ajusta esta ruta a donde tengas paths.js

initLegalTextPage({
  getContenidoDoc: (localidad, negocioId) => terminosCondicionesDoc(localidad, negocioId),
  footerFlag: "terminos_condiciones", // requiere biz.footer.activo === true y biz.footer.terminos_condiciones === true
  tituloFallback: "Términos y Condiciones",
  labelSuperior: "Términos y Condiciones",
  pathPrefix: "/legal/terminos_condiciones/", // compatibilidad con links viejos
  seccion: "terminos_condiciones", // habilita /perfil/{alias}/terminos_condiciones
});