
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
    authDomain: "geinzworkapp.firebaseapp.com",
    projectId: "geinzworkapp",
    storageBucket: "geinzworkapp.appspot.com",
    messagingSenderId: "921389328767",
    appId: "1:921389328767:web:094e8a2a5fcd69395b524a"
};

const appGeinz = initializeApp(firebaseConfig, "geinz");
const db = getFirestore(appGeinz);
const params = new URLSearchParams(window.location.search);
const localidad = params.get('loc');


const gridContainer = document.getElementById("categoriasGrid");
const searchInput = document.getElementById("searchInput");

let categoriasOriginales = [];
let isLoading = true;

// ========== SKELETON RENDER (cards placeholder) ==========
function renderSkeletons(quantity = 6) {
    gridContainer.innerHTML = '';
    for (let i = 0; i < quantity; i++) {
        const skeletonCard = document.createElement('div');
        skeletonCard.className = 'skeleton-card';
        skeletonCard.innerHTML = `
                <div class="skeleton-img"></div>
                <div class="skeleton-content">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-chips">
                        <div class="skeleton-chip"></div>
                        <div class="skeleton-chip short"></div>
                        <div class="skeleton-chip medium"></div>
                    </div>
                </div>
            `;
        gridContainer.appendChild(skeletonCard);
    }
}

// ========== RENDER REAL (con skeleton por imagen y chips elegantes) ==========
function renderizarCategorias(lista) {
    if (!lista.length) {
        gridContainer.innerHTML = `<div class="empty-message">✨ No se encontraron categorías o negocios. Intenta con otra palabra ✨</div>`;
        return;
    }

    gridContainer.innerHTML = '';

    lista.forEach((categoria, index) => {

        const card = document.createElement('div');
        card.className = 'card';

        // Contenedor relativo para la imagen y su skeleton overlay
        const imgWrapper = document.createElement('div');
        imgWrapper.style.position = 'relative';
        imgWrapper.style.width = '100%';
        imgWrapper.style.height = '100%';
        imgWrapper.style.overflow = 'hidden';

        // Imagen real
        const img = document.createElement('img');
        img.className = 'card-img';
        img.alt = categoria.id || 'categoría';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.position = 'relative';
        img.style.zIndex = '0';

        // URL de imagen o placeholder sutil si no existe
        let imgUrl = categoria.img_categoria;
        if (!imgUrl || imgUrl.trim() === '') {
            imgUrl = 'https://placehold.co/600x400/1a1a2e/8b5cf6?text=GeinzWork';
        }
        img.src = imgUrl;

        // Skeleton overlay individual (shimmer) que desaparecerá al cargar la imagen
        const skeletonOverlay = document.createElement('div');
        skeletonOverlay.className = 'img-skeleton-overlay';

        // Eventos: cuando la imagen carga -> elimina skeleton overlay
        img.addEventListener('load', () => {
            if (skeletonOverlay && skeletonOverlay.remove) skeletonOverlay.remove();
        });
        img.addEventListener('error', () => {
            // Si falla la imagen, igual remover skeleton y poner un fallback visual
            if (skeletonOverlay && skeletonOverlay.remove) skeletonOverlay.remove();
            img.src = 'https://placehold.co/600x400/1e1e2f/8b5cf6?text=Imagen+Geinz';
        });

        imgWrapper.appendChild(img);
        imgWrapper.appendChild(skeletonOverlay);

        // Overlay de gradiente
        const overlayDiv = document.createElement('div');
        overlayDiv.className = 'overlay';

        // Contenido de texto (nombre y chips)
        const contentDiv = document.createElement('div');
        contentDiv.className = 'content';

        const title = document.createElement('h2');
        const nombre = categoria.id || 'Sin nombre';
        title.innerText = nombre.charAt(0).toUpperCase() + nombre.slice(1);

        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'tags';

        const subcategorias = categoria.subcategorias || [];
        // Mostramos max 8 subcategorias como chips, pero scroll horizontal
        const subList = subcategorias.slice(0, 8);
        subList.forEach(sub => {
            const chip = document.createElement('span');
            chip.className = 'tag';
            chip.innerText = sub;
            tagsContainer.appendChild(chip);
        });

        // Si no hay subcategorías, mostramos un chip sutil "explorar"
        if (subList.length === 0) {
            const emptyChip = document.createElement('span');
            emptyChip.className = 'tag';
            emptyChip.innerText = 'Próximamente';
            tagsContainer.appendChild(emptyChip);
        }

        contentDiv.appendChild(title);
        contentDiv.appendChild(tagsContainer);

        card.appendChild(imgWrapper);
        card.appendChild(overlayDiv);
        card.appendChild(contentDiv);
        card.style.animationDelay = `${index * 0.06}s`;
        card.addEventListener('click', () => {
            const categoriaSlug = (categoria.id || '')
                .toLowerCase()
                .trim()
                .replace(/\s+/g, '+');
            window.location.href = `negocios.html?localidad=${localidad}&categoria=${categoriaSlug}`;
        });

        gridContainer.appendChild(card);
    });
}

// ========== FILTRO BÚSQUEDA (nombre + subcategorías) ==========
function filtrarPorTexto(texto) {
    if (!texto.trim()) {
        renderizarCategorias(categoriasOriginales);
        return;
    }
    const term = texto.toLowerCase().trim();
    const filtradas = categoriasOriginales.filter(cat => {
        const nombreMatch = cat.id?.toLowerCase().includes(term) || false;
        const subcategoriasMatch = (cat.subcategorias || []).some(sub => sub.toLowerCase().includes(term));
        return nombreMatch || subcategoriasMatch;
    });
    renderizarCategorias(filtradas);
}

// ========== CARGA DESDE FIRESTORE CON SKELETON GLOBAL ==========
async function cargarCategorias() {
    try {
        // Mostrar skeleton global mientras se cargan los datos
        isLoading = true;
        renderSkeletons(8);  // 8 skeletons para grid moderno

        const categoriasRef = collection(db, "Tiendas", "categorias", "categorias");
        const snapshot = await getDocs(categoriasRef);
        const tempArray = [];

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            tempArray.push({
                id: docSnap.id,
                img_categoria: data.img_categoria || '',
                subcategorias: Array.isArray(data.subcategorias) ? data.subcategorias : []
            });
        });

        categoriasOriginales = tempArray;
        isLoading = false;

        // Render categorías reales
        if (categoriasOriginales.length === 0) {
            gridContainer.innerHTML = `<div class="empty-message">🏪 No hay categorías disponibles por ahora. Vuelve pronto.</div>`;
        } else {
            renderizarCategorias(categoriasOriginales);
        }
    } catch (error) {
        console.error("Error Firebase:", error);
        isLoading = false;
        gridContainer.innerHTML = `<div class="empty-message">⚠️ Error al cargar datos. Revisa tu conexión o contacta soporte.</div>`;
    }
}

// Evento de búsqueda (con debounce suave para mejor UX)
let debounceTimer;
searchInput.addEventListener('input', (e) => {
    if (isLoading) return;  // mientras carga, no filtramos skeletons
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        filtrarPorTexto(e.target.value);
    }, 280);
});

// Inicializar todo
cargarCategorias();
