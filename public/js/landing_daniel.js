 
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
        import { getFirestore, doc, getDoc, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
        import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

        const firebaseConfig = {
            apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
            authDomain: "geinzworkapp.firebaseapp.com",
            projectId: "geinzworkapp",
            storageBucket: "geinzworkapp.appspot.com",
            messagingSenderId: "921389328767",
            appId: "1:921389328767:web:dc6fffc43a51444f5b524a",
        };

        // ==================== SEGUNDA APP FIREBASE (planes) ====================
        const appPlanes = initializeApp(
            {
                apiKey: "AIzaSyA47YFtXgzUQe8w_Wb6AlfDcQSjOB5rT_U",
                authDomain: "proyectolista-95172.firebaseapp.com",
                projectId: "proyectolista-95172",
                storageBucket: "proyectolista-95172.firebasestorage.app",
                messagingSenderId: "250365546182",
                appId: "1:250365546182:web:732f2342d416eb909111c7",
            },
            "planes"
        );
        const dbPlanes = getFirestore(appPlanes);
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const storage = getStorage(app);

        const params = new URLSearchParams(window.location.search);
        const id = params.get("id") || "fW7W8RsgkkQ3IYfxKHGR";
        const localidad = params.get("localidad") || "barranca";

        const waCardImage = document.getElementById("wa-card-image");
        const waTextRenderer = document.getElementById("wa-text-renderer");

        // Estado global
        const state = {
            planActivo: false,      // true = Pro activo en DB
            planSeleccionado: null, // 'free' | 'pro' — lo que el usuario tiene seleccionado en UI
        };

        const originalValues = { descripcion: "", whatsapp: "", msje_whatsapp: "" };

        // ==================== TOAST ====================
        function showToast(msg, isError = false) {
            const t = document.getElementById("global-toast");
            t.textContent = msg;
            t.className = "toast-confirm" + (isError ? " error" : "");
            t.classList.add("show");
            setTimeout(() => t.classList.remove("show"), 3000);
        }

        // ==================== COUNTER ====================
        function updateCounter(counterId, current, max) {
            const el = document.getElementById(counterId);
            if (!el) return;
            el.textContent = `${current} / ${max}`;
            el.className = current >= max ? "field-char-counter at-limit"
                : current >= max * 0.85 ? "field-char-counter near-limit"
                    : "field-char-counter";
        }

        // ==================== CHECK CHANGED ====================
        function checkFieldChanged(campo, currentValue) {
            const btnId = campo === 'msje_whatsapp' ? 'btn-save-msje'
                : campo === 'whatsapp' ? 'btn-save-whatsapp'
                    : 'btn-save-descripcion';
            const dotId = campo === 'msje_whatsapp' ? 'dot-msje'
                : campo === 'whatsapp' ? 'dot-whatsapp'
                    : 'dot-descripcion';

            const btn = document.getElementById(btnId);
            const dot = document.getElementById(dotId);
            if (!btn) return;

            const changed = currentValue.trim() !== originalValues[campo].trim();
            if (changed) {
                btn.classList.add("visible");
                btn.classList.remove("saved");
                btn.textContent = campo === 'descripcion' ? '💾 Guardar descripción'
                    : campo === 'whatsapp' ? '💾 Guardar número'
                        : '💾 Guardar mensaje';
                if (dot) dot.classList.add("visible");
            } else {
                btn.classList.remove("visible");
                if (dot) dot.classList.remove("visible");
            }
        }

        // ==================== GUARDAR CAMPO ====================
        window.guardarCampo = async function (campo) {
            const btn = document.getElementById(
                campo === 'msje_whatsapp' ? 'btn-save-msje'
                    : campo === 'whatsapp' ? 'btn-save-whatsapp'
                        : 'btn-save-descripcion'
            );

            let value = "";
            if (campo === 'descripcion') value = document.getElementById("seo-global-input").value.trim();
            else if (campo === 'whatsapp') value = document.getElementById("input-whatsapp").value.trim();
            else if (campo === 'msje_whatsapp') value = document.getElementById("input-msje").value.trim();

            if (!value) return showToast("⚠️ El campo no puede estar vacío", true);

            btn.classList.add("saving");
            btn.textContent = "Guardando...";

            try {
                const refLugar = doc(db, "lugares", id);
                let updateData = {};

                if (campo === 'descripcion') {
                    updateData = { descripcion: value };
                } else if (campo === 'whatsapp') {
                    const num = parseInt(value.replace(/\D/g, ''), 10);
                    if (isNaN(num)) {
                        showToast("⚠️ Ingresa un número válido", true);
                        btn.classList.remove("saving");
                        btn.textContent = "💾 Guardar número";
                        return;
                    }
                    updateData = { whatsapp: num };
                } else if (campo === 'msje_whatsapp') {
                    updateData = { msje_whatsapp: value };
                }

                await updateDoc(refLugar, updateData);
                originalValues[campo] = value;

                btn.classList.remove("saving");
                btn.classList.add("saved");
                btn.textContent = "✅ Guardado";
                showToast(`✅ ${campo === 'descripcion' ? 'Descripción' : campo === 'whatsapp' ? 'Número' : 'Mensaje'} guardado`);

                const dotId = campo === 'msje_whatsapp' ? 'dot-msje' : campo === 'whatsapp' ? 'dot-whatsapp' : 'dot-descripcion';
                const dot = document.getElementById(dotId);
                if (dot) dot.classList.remove("visible");

                setTimeout(() => btn.classList.remove("visible", "saved"), 2000);
                if (campo === 'descripcion') actualizarPreview();

            } catch (err) {
                console.error(err);
                btn.classList.remove("saving");
                btn.textContent = "💾 Reintentar";
                showToast("❌ Error al guardar. Intenta de nuevo.", true);
            }
        };

        // ==================== PREVIEW ====================
        // ==================== PREVIEW ====================
        function actualizarPreview() {
            const isPro = state.planSeleccionado === 'pro' || state.planActivo === true;

            const imgContainer = document.getElementById("wa-img-container");

            // Mostrar/ocultar imagen según plan
            imgContainer.style.display = isPro ? "block" : "none";

            const proText = `Descripción optimizada por Daniel IA para potenciar la visibilidad y conversión de tu negocio. 
Basado en análisis SEO, comportamiento de clientes y millones de datos entrenados para generar 
mensajes más atractivos, estratégicos y orientados a maximizar el ROI y atraer más clientes para ti.`;

            const freeText = `Tu contacto personal no será mostrado públicamente. 
Los clientes podrán comunicarse contigo de forma segura desde Geinz. ✨`;

            waTextRenderer.innerHTML = isPro ? proText : freeText;
        }

        // ==================== SELECCIONAR PLAN (UI) ====================
        window.seleccionarPlan = function (plan) {
            state.planSeleccionado = plan;

            document.getElementById("plan-free-card").classList.toggle("selected", plan === "free");
            document.getElementById("plan-pro-card").classList.toggle("selected", plan === "pro");
            document.getElementById("pro-form-fields").classList.toggle("active-view", plan === "pro");

            actualizarBotonPlan();
            actualizarPreview(); // ← esta línea faltaba
        };

        function actualizarBotonPlan() {
            const btn = document.getElementById("btn-action-submit");
            const planActivoDB = state.planActivo ? 'pro' : 'free';
            const planUI = state.planSeleccionado;

            if (planUI === planActivoDB) {
                // misma que DB → botón deshabilitado
                btn.className = "btn-submit-main same-plan";
                btn.textContent = planUI === 'pro' ? "✅ Plan Pro activo" : "✅ Plan Gratis activo";
            } else if (planUI === 'pro') {
                // quiere activar Pro
                btn.className = "btn-submit-main activate-pro";
                btn.textContent = "🚀 Activar Plan Pro";
            } else {
                // quiere degradar a Gratis
                btn.className = "btn-submit-main activate-free";
                btn.textContent = "⬇️ Cambiar a Plan Gratis";
            }
        }

        // ==================== CAMBIAR PLAN EN DB ====================
        // ==================== CAMBIAR PLAN EN DB ====================
        window.cambiarPlan = async function () {
            const planActivoDB = state.planActivo ? 'pro' : 'free';
            if (state.planSeleccionado === planActivoDB) return;

            const activarPro = state.planSeleccionado === 'pro';
            const btn = document.getElementById("btn-action-submit");
            btn.classList.add("loading");
            btn.textContent = "Guardando plan...";

            try {
                const refLugar = doc(db, "lugares", id);
                const refTienda = doc(db, "Tiendas", localidad, localidad, id);
                const refCreditos = doc(dbPlanes, "creditos_tienda", id);

                const updateData = {
                    plantilla: activarPro,
                    bot_plan_pro: activarPro
                };

                if (activarPro) {
                    // Leer puntos_tienda actuales desde /Tiendas/localidad/localidad/id
                    const snapTienda = await getDoc(refTienda);
                    const saldoActual = snapTienda.exists()
                        ? (snapTienda.data().puntos_tienda ?? 0)
                        : 0;

                    // Actualizar las 3 rutas en paralelo
                    await Promise.all([
                        updateDoc(refLugar, updateData),
                        updateDoc(refTienda, updateData),
                        // Equivalente al setOptions.merge() de Kotlin
                        setDoc(refCreditos, {
                            creditos: saldoActual,
                            fecha_activacion_inicial: serverTimestamp()
                        }, { merge: true })
                    ]);

                } else {
                    // Degradar a gratis — solo actualizar las 2 rutas principales
                    await Promise.all([
                        updateDoc(refLugar, updateData),
                        updateDoc(refTienda, updateData)
                    ]);
                }

                state.planActivo = activarPro;

                document.getElementById("status-badge").textContent =
                    activarPro ? "Activo (Pro)" : "Activo (Gratis)";

                actualizarBotonPlan();
                actualizarPreview();

                showToast(activarPro
                    ? "🚀 Plan Pro activado correctamente"
                    : "✅ Cambiado a Plan Gratis"
                );

            } catch (err) {
                console.error("Error cambiando plan:", err);
                showToast("❌ Error al cambiar el plan", true);
                btn.classList.remove("loading");
                actualizarBotonPlan();
            }
        };
        // ==================== OPTIMIZAR IMAGEN (canvas) ====================
        async function optimizarImagen(file) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(file);

                img.onload = () => {
                    URL.revokeObjectURL(url);

                    // Máx 900px — suficiente para WhatsApp, reduce peso dramáticamente
                    const MAX = 900;
                    let w = img.naturalWidth;
                    let h = img.naturalHeight;

                    if (w > MAX) {
                        h = Math.round((h * MAX) / w);
                        w = MAX;
                    }

                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;

                    const ctx = canvas.getContext("2d");
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);

                    const TARGET_KB = 100;
                    const TARGET_BYTES = TARGET_KB * 1024;

                    // Compresión iterativa: baja calidad hasta entrar en el target
                    let quality = 0.75;
                    const MIN_QUALITY = 0.30; // nunca bajar de aquí para no destruir la imagen
                    const step = 0.05;

                    function intentar() {
                        canvas.toBlob((blob) => {
                            if (!blob) return reject(new Error("Error al convertir"));

                            if (blob.size <= TARGET_BYTES || quality <= MIN_QUALITY) {
                                // Llegamos al target o al límite mínimo
                                console.log(`✅ Imagen final: ${(blob.size / 1024).toFixed(1)}KB — calidad: ${quality.toFixed(2)}`);
                                resolve(blob);
                            } else {
                                // Todavía pesa más de 100KB, bajar calidad y reintentar
                                quality = Math.max(MIN_QUALITY, quality - step);
                                intentar();
                            }
                        }, "image/jpeg", quality);
                    }

                    intentar();
                };

                img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
                img.src = url;
            });
        }
        // ==================== SUBIR IMAGEN A STORAGE ====================
        // ==================== SUBIR IMAGEN A STORAGE ====================
        async function subirImagenStorage(blob) {
            const timestamp = Date.now();
            const storagePath = `tiendas/${id}/imagenes/para_whatsapp/bot_${timestamp}.jpg`;
            const storageRef = ref(storage, storagePath);

            const progressBar = document.getElementById("upload-progress-bar");
            const progressFill = document.getElementById("upload-progress-fill");
            progressBar.classList.add("active");
            progressFill.style.width = "0%";

            return new Promise((resolve, reject) => {
                const uploadTask = uploadBytesResumable(storageRef, blob, { contentType: "image/jpeg" });

                uploadTask.on("state_changed",
                    (snapshot) => {
                        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                        progressFill.style.width = pct + "%";
                    },
                    (error) => {
                        progressBar.classList.remove("active");
                        reject(error);
                    },
                    async () => {
                        progressBar.classList.remove("active");
                        progressFill.style.width = "0%";
                        const url = await getDownloadURL(uploadTask.snapshot.ref);
                        resolve(url);
                    }
                );
            });
        }
        // ==================== SELECCIONAR & PROCESAR IMAGEN ====================
        window.seleccionarImagen = function () {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // Preview local inmediato
                const localUrl = URL.createObjectURL(file);
                waCardImage.src = localUrl;

                showToast("⏳ Optimizando y subiendo imagen...");

                try {
                    // 1. Optimizar
                    const blob = await optimizarImagen(file);


                    // 2. Subir a Storage
                    const downloadUrl = await subirImagenStorage(blob);

                    // 3. Guardar URL en Firestore (lugares)
                    const refLugar = doc(db, "lugares", id);
                    await updateDoc(refLugar, { imagen_bot: downloadUrl });

                    // 4. Actualizar src real con URL de Storage
                    waCardImage.src = downloadUrl;
                    URL.revokeObjectURL(localUrl);

                    showToast("✅ Imagen guardada correctamente");

                } catch (err) {
                    console.error("Error subiendo imagen:", err);
                    showToast("❌ Error al subir la imagen", true);
                }
            };

            input.click();
        };


        // ==================== GENERAR DESCRIPCIÓN CON IA ====================
        window.generarDescripcionIA = async function () {
            const btn = document.getElementById("btn-ia-generar");
            btn.classList.add("loading");
            btn.textContent = "Generando";

            try {
                // Leer datos frescos de la tienda
                const refTienda = doc(db, "Tiendas", localidad, localidad, id);
                const snap = await getDoc(refTienda);

                if (!snap.exists()) {
                    showToast("⚠️ No se encontraron datos del negocio", true);
                    return;
                }

                const data = snap.data();

                // ── Subcategorías ──
                const subcats = Array.isArray(data.subcategoria)
                    ? data.subcategoria.filter(Boolean).join(", ")
                    : "";

                // ── Métodos de pago habilitados ──
                const metodos = data.metodos_pago || {};
                const pagosActivos = Object.entries(metodos)
                    .filter(([key, val]) => val?.enable === true && key !== "stability")
                    .map(([key]) => {
                        const nombres = {
                            efectivo: "Efectivo",
                            yape: "Yape",
                            plin: "Plin",
                            agora: "Agora",
                            visa_mastercard: "Visa/Mastercard"
                        };
                        return nombres[key] || key;
                    })
                    .join(", ");

                // ── Construir texto para la IA ──
                const partes = [];
                if (subcats) partes.push(`Especialidades: ${subcats}`);
                if (pagosActivos) partes.push(`Métodos de pago: ${pagosActivos}`);

                if (partes.length === 0) {
                    showToast("⚠️ No hay subcategorías ni métodos de pago configurados", true);
                    return;
                }

                const texto = partes.join(". ");

                // ── Llamar a la Cloud Function ──
                const { getFunctions, httpsCallable } = await import(
                    "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js"
                );
                const functions = getFunctions(app, "us-central1");
                const generarFn = httpsCallable(functions, "generar_descripcion_whatsapp_ia");

                const result = await generarFn({ texto });

                if (result.data?.ok && result.data?.descripcion) {
                    const desc = result.data.descripcion.trim();

                    // Setear en el textarea
                    const textarea = document.getElementById("seo-global-input");
                    textarea.value = desc;

                    // Disparar detección de cambios y preview
                    updateCounter("counter-descripcion", desc.length, 200);
                    checkFieldChanged('descripcion', desc);
                    actualizarPreview();

                    showToast("✨ Descripción generada — revísala y guárdala");
                } else {
                    showToast("⚠️ La IA no devolvió resultado", true);
                }

            } catch (err) {
                console.error("Error generando descripción:", err);
                showToast("❌ Error al generar descripción", true);
            } finally {
                btn.classList.remove("loading");
                btn.textContent = "Generar descripción con IA ✨";
            }
        };

        // ==================== ACORDEÓN MÓVIL ====================
        window.toggleSeoAccordion = function () {
            document.getElementById("seo-collapsible-container").classList.toggle("expanded");
            document.getElementById("seo-arrow-indicator").classList.toggle("rotated");
        };

        // ==================== CARGAR DATOS ====================
        async function cargarTienda() {
            try {
                const refTienda = doc(db, "Tiendas", localidad, localidad, id);
                const refLugar = doc(db, "lugares", id);

                const [snapTienda, snapLugar] = await Promise.all([
                    getDoc(refTienda),
                    getDoc(refLugar)
                ]);

                if (snapTienda.exists()) {
                    const tData = snapTienda.data();
                    if (tData?.img_tienda?.lista_img?.ambientales?.[0]) {
                        waCardImage.src = tData.img_tienda.lista_img.ambientales[0];
                    }
                }

                if (snapLugar.exists()) {
                    const lugar = snapLugar.data();

                    // Determinar plan activo desde DB
                    const esPro = lugar.plantilla === true;
                    state.planActivo = esPro;
                    state.planSeleccionado = esPro ? 'pro' : 'free';

                    // Imagen bot
                    if (lugar.imagen_bot) waCardImage.src = lugar.imagen_bot;

                    // Campos
                    const desc = lugar.descripcion || "";
                    const wa = lugar.whatsapp !== undefined ? String(lugar.whatsapp) : "";
                    const msje = lugar.msje_whatsapp || "";

                    originalValues.descripcion = desc;
                    originalValues.whatsapp = wa;
                    originalValues.msje_whatsapp = msje;

                    document.getElementById("seo-global-input").value = desc;
                    document.getElementById("input-whatsapp").value = wa;
                    document.getElementById("input-msje").value = msje;

                    updateCounter("counter-descripcion", desc.length, 200);
                    updateCounter("counter-msje", msje.length, 200);

                    // Dataset para preview
                    waTextRenderer.dataset.nombre = lugar.nombre || "Negocio";
                    waTextRenderer.dataset.categoria = lugar.categoria || "";

                    // Badge de estado
                    const badge = document.getElementById("status-badge");
                    badge.textContent = esPro ? "Activo (Pro)" : "Activo (Gratis)";

                    // Marcar plan en UI
                    document.getElementById("plan-free-card").classList.toggle("selected", !esPro);
                    document.getElementById("plan-pro-card").classList.toggle("selected", esPro);
                    document.getElementById("pro-form-fields").classList.toggle("active-view", esPro);

                    actualizarBotonPlan();
                    actualizarPreview();
                }

            } catch (err) {
                console.error("Error cargando datos:", err);
            } finally {
                document.getElementById("skeleton-loader").style.display = "none";
            }
        }

        // ==================== EVENTOS ====================
        document.getElementById("seo-global-input").addEventListener("input", (e) => {
            updateCounter("counter-descripcion", e.target.value.length, 200);
            checkFieldChanged('descripcion', e.target.value);
            actualizarPreview();
        });

        document.getElementById("input-whatsapp").addEventListener("input", (e) => {
            checkFieldChanged('whatsapp', e.target.value);
        });

        document.getElementById("input-msje").addEventListener("input", (e) => {
            updateCounter("counter-msje", e.target.value.length, 200);
            checkFieldChanged('msje_whatsapp', e.target.value);
        });

        // Iniciar
        cargarTienda();
