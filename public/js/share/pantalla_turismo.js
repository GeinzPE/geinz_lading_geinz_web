import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../db/db.js";
import { tiendaCol } from "../rutas/rutas.js";

let allPlaces = [];
const params = new URLSearchParams(window.location.search);
const localidad = params.get("loc") || "barranca";

console.log(localidad);

async function renderWithSmoothImages(data) {

    const grid = document.getElementById("placesGrid");

    if (data.length === 0) {

        grid.innerHTML = `
                    <p style="
                        grid-column:1/-1;
                        text-align:center;
                        color:#888;
                        padding:50px;
                    ">
                        No se encontraron lugares.
                    </p>
                `;

        return;
    }

    grid.innerHTML = data.map((item, idx) => {

        const imgUrl =
            item.img?.principal ||
            item.img ||
            "https://placehold.co/600x500/1a1a2e/8800F2?text=Geinz";

      return `
    <a 
        class="card"
        data-id="${item.id}"
        href="/turismo/${item.alias_key || item.id}"
        style="animation-delay:${Math.min(idx * .04, .5)}s; text-decoration:none; display:block;"
    >
        <div class="img-wrapper loading" id="img-wrapper-${item.id}">
            <img
                data-src="${imgUrl}"
                alt="${item.titulo || 'Lugar'}"
                id="img-${item.id}"
            >
        </div>

        <div class="card-body">
            <div class="status-badge">
                <i class="fas fa-clock"></i>
                Abierto 24 h
            </div>

            <h3 class="card-title">
                ${item.titulo || "Lugar turístico"}
            </h3>

            <div class="tag-container">
                ${(Array.isArray(item.categoria)
                    ? item.categoria
                    : [item.categoria])
                    .filter(c => c)
                    .map(c => `<span class="tag">${c}</span>`)
                    .join("")}
            </div>
        </div>
    </a>
`;

    }).join("");

    for (const item of data) {

        const imgElement = document.getElementById(`img-${item.id}`);

        const wrapperElement =
            document.getElementById(`img-wrapper-${item.id}`);

        if (!imgElement) continue;

        const src = imgElement.getAttribute("data-src");

        const tempImg = new Image();

        tempImg.onload = () => {

            imgElement.src = src;

            imgElement.classList.add("loaded");

            wrapperElement?.classList.remove("loading");

        };

        tempImg.onerror = () => {

            imgElement.src =
                "https://placehold.co/600x500/1a1a2e/8800F2?text=Geinz";

            imgElement.classList.add("loaded");

            wrapperElement?.classList.remove("loading");

        };

        tempImg.src = src;

    }
}

async function startApp() {

    try {

        const [filterSnap, placesSnap] = await Promise.all([

            getDoc(
                doc(
                    db,
                    "Tiendas",
                    "categorias",
                    "categorias",
                    "turismo"
                )
            ),

            getDocs(
                tiendaCol(localidad, "lugares_turisticos")
            )

        ]);

        if (filterSnap.exists()) {

            const subcats =
                filterSnap.data().subcategorias || [];

            const container =
                document.getElementById("filterContainer");

            subcats.forEach(cat => {

                const btn = document.createElement("button");

                btn.className = "filter-btn";

                btn.textContent = cat;

                btn.setAttribute(
                    "data-filter",
                    cat.toLowerCase()
                );

                btn.onclick = e => filterAction(e.target);

                container.appendChild(btn);

            });

        }

        allPlaces = placesSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        await renderWithSmoothImages(allPlaces);

        document
            .getElementById("fullscreenSkeleton")
            .style.display = "none";

        document
            .getElementById("appContent")
            .style.display = "block";

        document
            .getElementById("placesGrid")
            .classList.add("loaded");

    } catch (error) {

        console.error(error);

        document.getElementById("fullscreenSkeleton").innerHTML = `
                
                    <div style="
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        flex-direction:column;
                        min-height:100vh;
                        text-align:center;
                        padding:30px;
                    ">

                        <i class="fas fa-exclamation-triangle"
                            style="
                                font-size:3rem;
                                color:#8800F2;
                                margin-bottom:20px;
                            ">
                        </i>

                        <h2 style="margin-bottom:10px;">
                            Error al cargar
                        </h2>

                        <p style="color:#888;">
                            ${error.message}
                        </p>

                        <button
                            onclick="location.reload()"
                            style="
                                margin-top:25px;
                                background:#8800F2;
                                border:none;
                                padding:14px 26px;
                                border-radius:16px;
                                color:white;
                                cursor:pointer;
                                font-weight:700;
                            "
                        >
                            Reintentar
                        </button>

                    </div>

                `;
    }
}

async function filterAction(btn) {

    document
        .querySelectorAll(".filter-btn")
        .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    const filterValue =
        btn.getAttribute("data-filter");

    const grid =
        document.getElementById("placesGrid");

    grid.style.opacity = "0";

    setTimeout(async () => {

        let filteredData;

        if (filterValue === "todos") {

            filteredData = allPlaces;

        } else {

            filteredData = allPlaces.filter(p => {

                if (!p.categoria) return false;

                const categories = Array.isArray(p.categoria)
                    ? p.categoria.map(c => c.toLowerCase())
                    : [p.categoria.toLowerCase()];

                return categories.includes(filterValue);

            });

        }

        await renderWithSmoothImages(filteredData);

        grid.style.opacity = "1";

    }, 150);

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

startApp();