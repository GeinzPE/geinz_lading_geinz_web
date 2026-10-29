/* Gráficos de pastel ligeros: un solo recorrido de datos, sin animaciones */
const COL = ["#8b5cf6", "#22d3ee", "#f472b6", "#fbbf24", "#34d399", "#fb7185", "#60a5fa", "#a3e635", "#f97316", "#c084fc"];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function pieCards(F, R) {
  const qs = F.questions.filter((q) => q.type !== "text");
  if (!qs.length) return "";
  const cnt = {};
  qs.forEach((q) => (cnt[q.id] = Object.create(null)));
  for (const r of R) {
    const a = r.a;
    if (!a) continue;
    for (const q of qs) {
      const v = a[q.id];
      if (v == null) continue;
      const c = cnt[q.id];
      for (const x of Array.isArray(v) ? v : [v]) {
        const s = String(x),
          k = s.startsWith("Otro:") ? "Otro" : s;
        c[k] = (c[k] || 0) + 1;
      }
    }
  }
  const html = qs
    .map((q) => {
      const L = q.type === "scale" ? ["1", "2", "3", "4", "5"] : [...(q.opts || []), ...(q.other ? ["Otro"] : [])];
      const w = L.map((l) => cnt[q.id][l] || 0);
      const t = w.reduce((a, b) => a + b, 0);
      if (!t) return `<div class="pie"><h4>${esc(q.text)}</h4><p class="sub" style="margin:0">Sin respuestas todavía.</p></div>`;
      let a = 0;
      const stops = w
        .map((n, i) => {
          const s = a;
          a += (n / t) * 100;
          return n ? `${COL[i % COL.length]} ${s}% ${a}%` : "";
        })
        .filter(Boolean)
        .join(",");
      const items = L.map((l, i) => ({ l, n: w[i], c: COL[i % COL.length] })).sort((x, y) => y.n - x.n);
      const top = items[0],
        tie = items[1] && items[1].n === top.n;
      const avg = q.type === "scale" ? (w.reduce((s, n, i) => s + n * (i + 1), 0) / t).toFixed(1) : "";
      const badge = tie
        ? '<span class="chip">Empate</span>'
        : `<span class="chip ok">🏆 ${esc(top.l)} · ${Math.round((top.n / t) * 100)}%</span>`;
      return `<div class="pie"><h4>${esc(q.text)}</h4>${badge}<div class="pie-b"><div class="donut" style="background:conic-gradient(${stops})"><b>${avg ? "★ " + avg : t}<small>${avg ? "promedio" : t === 1 ? "voto" : "votos"}</small></b></div><div class="leg">${items
        .filter((x) => x.n)
        .map((x) => `<div><i style="background:${x.c}"></i><span>${esc(x.l)}</span><u>${x.n} · ${Math.round((x.n / t) * 100)}%</u></div>`)
        .join("")}</div></div></div>`;
    })
    .join("");
  return `<div class="card"><h2>Gráficos de pastel · qué opción gana</h2><div class="pies">${html}</div></div>`;
}