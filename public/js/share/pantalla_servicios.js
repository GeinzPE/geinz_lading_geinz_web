
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import {
            getFirestore,
            collection,
            getDocs
        } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

        /* =========================
           FIREBASE
        ========================= */

        const config = {
            apiKey: "AIzaSyBFV4SF7hMFifKz45GaBiu2xwTq7T_gxBQ",
            authDomain: "geinzworkapp.firebaseapp.com",
            projectId: "geinzworkapp",
            storageBucket: "geinzworkapp.appspot.com",
            messagingSenderId: "921389328767",
            appId: "1:921389328767:web:dc6fffc43a51444f5b524a"
        };

        const app = initializeApp(config);
        const db = getFirestore(app);

        /* =========================
           DATA
        ========================= */

        let allData = [];

        const categories = [
            "Todos",
            "agua",
            "gas",
            "luz",
            "cable",
            "internet",
            "telefonia movil",
            "tramites"
        ];

        const categoryIcon = {
            "Todos": "fa-solid fa-grid-2",
            "agua": "fa-solid fa-droplet",
            "gas": "fa-solid fa-fire",
            "luz": "fa-solid fa-bolt",
            "cable": "fa-solid fa-tower-cell",
            "internet": "fa-solid fa-wifi",
            "telefonia movil": "fa-solid fa-mobile-screen",
            "tramites": "fa-regular fa-file-lines"
        };

        /* =========================
           SKELETON FULL PAGE
        ========================= */

        function showSkeletons() {
            document.getElementById('app').innerHTML = `
    <div class="page-skeleton">

        <header class="sticky-header">
            <div class="container">
                <div class="sk-line sk-title"></div>
                <div class="sk-line sk-sub"></div>
                <div class="sk-line sk-mini"></div>

                <div class="sk-filters">
                    ${Array(7).fill('<div class="sk-chip"></div>').join('')}
                </div>
            </div>
        </header>

        <main class="container">
            <div class="sk-grid">
                ${Array(12).fill('<div class="sk-card"></div>').join('')}
            </div>
        </main>

    </div>
    `;
        }

        /* =========================
           RENDER APP
        ========================= */

        function renderApp() {
            document.getElementById('app').innerHTML = `

    <header class="sticky-header">
        <div class="container">

            <h1 class="hero-title">servicios esenciales Geinz</h1>

            <p class="hero-desc">
                Obten los contactos y direcciones de los servicios esenciales de barranca
            </p>

            <p class="hero-mini">Barranca · verificado</p>

            <div class="filter-wrapper" id="filterArea"></div>

        </div>
    </header>

    <main class="container">
        <div class="grid" id="mainGrid"></div>
    </main>

    <div class="modal" id="modalUI" onclick="closeM(event)">
        <div class="modal-content" onclick="event.stopPropagation()">

            <div class="m-banner">
                <button class="close-x" onclick="hideM()">
                    <i class="fas fa-times"></i>
                </button>

                <img id="mi" src="" />
            </div>

            <div class="m-body">
                <h2 id="mt" class="m-title"></h2>

                <div class="m-location">
                    <i class="fas fa-map-pin"></i> Barranca, Perú
                </div>

                <p id="md" class="m-desc"></p>

                <a id="ml" class="btn-main" target="_blank">
                    <i class="fas fa-location-arrow"></i> Cómo llegar
                </a>

                <div class="socials" id="ms"></div>
            </div>

        </div>
    </div>

    `;

            renderFilters();
            render(allData);
        }

        /* =========================
           FILTERS
        ========================= */

        function renderFilters() {
            const area = document.getElementById('filterArea');

            area.innerHTML = categories.map(c => {
                const icon = categoryIcon[c] || "fa-solid fa-tag";

                return `
        <button class="f-btn ${c === 'Todos' ? 'active' : ''}"
                onclick="filter('${c.toLowerCase()}',this)">
            <i class="${icon}" style="margin-right:6px;"></i>
            ${c}
        </button>`;
            }).join('');
        }

        /* =========================
           GRID
        ========================= */

        function render(data) {
            const grid = document.getElementById('mainGrid');

            if (!data.length) {
                grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;">
            Sin resultados
        </div>`;
                return;
            }

            grid.innerHTML = data.map(item => `
        <div class="card" onclick="showM('${item.id}')">
            <img src="${item.img_logo || ''}"
                 loading="lazy"
                 onload="this.classList.add('loaded')" />
        </div>
    `).join('');
        }

        /* =========================
           FILTER
        ========================= */

        window.filter = (cat, btn) => {
            document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const res = cat === 'todos'
                ? allData
                : allData.filter(i =>
                    i.categoria?.some(x => x.toLowerCase() === cat)
                );

            render(res);
        };

        /* =========================
           MODAL
        ========================= */

        window.showM = (id) => {

            const item = allData.find(x => x.id === id);
            if (!item) return;

            document.getElementById('mi').src =
                item.img_logo || 'https://placehold.co/600x400';

            document.getElementById('mt').innerText =
                item.lugar_nombre || '';

            document.getElementById('md').innerText =
                item.descripcion || '';

            /* MAPS ROUTE */
            const lat = item.direccion?.lat;
            const lng = item.direccion?.log;

            let mapsUrl = "https://maps.google.com/?q=Barranca";

            if (lat && lng) {
                mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
            }

            document.getElementById('ml').href = mapsUrl;

            /* SOCIALS */
            const social = document.getElementById('ms');
            social.innerHTML = '';

            const c = item.contacto || {};

            const add = (url, icon) => {
                social.innerHTML += `
        <a class="s-item" target="_blank" href="${url}">
            <i class="${icon}"></i>
        </a>`;
            };

            if (c.whatsapp?.[0]) {
                let n = c.whatsapp[0].replace(/\s/g, '').replace(/^\+?51/, '');
                add(`https://wa.me/51${n}`, 'fab fa-whatsapp');
            }

            if (c.telefono?.[0]) {
                add(`tel:${c.telefono[0]}`, 'fas fa-phone');
            }

            if (c.ig) {
                let ig = c.ig.startsWith('http')
                    ? c.ig
                    : `https://instagram.com/${c.ig.replace('@', '')}`;
                add(ig, 'fab fa-instagram');
            }

            if (c.facebook) {
                let fb = c.facebook.startsWith('http')
                    ? c.facebook
                    : `https://facebook.com/${c.facebook}`;
                add(fb, 'fab fa-facebook-f');
            }

            if (c.tk) {
                let tk = c.tk.startsWith('http')
                    ? c.tk
                    : `https://tiktok.com/@${c.tk.replace('@', '')}`;
                add(tk, 'fab fa-tiktok');
            }

            if (c.sitio_web) {
                let w = c.sitio_web.startsWith('http')
                    ? c.sitio_web
                    : `https://${c.sitio_web}`;
                add(w, 'fas fa-globe');
            }

            document.getElementById('modalUI').classList.add('active');
            document.body.style.overflow = 'hidden';
        };

        window.hideM = () => {
            document.getElementById('modalUI').classList.remove('active');
            document.body.style.overflow = '';
        };

        window.closeM = (e) => {
            if (e.target.id === 'modalUI') hideM();
        };

        /* =========================
           START
        ========================= */

        async function start() {

            showSkeletons();

            try {

                const snap = await getDocs(
                    collection(db, "Tiendas", "servicios_basicos", "barranca")
                );

                allData = snap.docs.map(d => ({
                    id: d.id,
                    ...d.data()
                }));

                renderApp();

            } catch (e) {
                console.error(e);
            }
        }

        start();

