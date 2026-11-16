// Leitura do horário oficial (PDF). Recebe os blocos de texto de cada página (como o pdf.js os devolve)
// e devolve, por tipo de dia:
//   saidas    partidas do percurso principal (primeira coluna)
//   parciais  viagens que não começam na primeira coluna
//   paragens  nomes das colunas (paragens), da esquerda para a direita
//   linhas    o horário completo, linha a linha: { t: [min|null por coluna], nota }
(function (root) {
  const TEMPO = /^(\d{1,2}):(\d{2})\s*(.*)$/;
  const min = (s) => { const m = TEMPO.exec(s.trim()); return m ? +m[1] * 60 + +m[2] : null; };
  const resto = (s) => { const m = TEMPO.exec(s.trim()); return m ? m[3].trim() : ''; };
  const ROTULO = /^(P\.|C\.|C\. ?P\.?|C\.P\.?)$/;

  // paginas: [[{str, x, y, rot}, ...], ...]   rot = true se o texto está na vertical
  function lerHorario(paginas) {
    const vazio = () => ({ saidas: [], parciais: [], paragens: [], linhas: [] });
    const res = { linha: null, nome: null, versao: null, notas: [], util: vazio(), fds: vazio() };
    const tipoTitulo = (s) => { const t = s.trim(); if (/^dias\s+[úu]teis$/i.test(t)) return 'util'; if (/s[áa]bado/i.test(t)) return 'sab'; if (/^domingos?/i.test(t)) return 'dom'; return null; };
    for (const itens of paginas) {
      const todos = itens.filter((i) => i.str && i.str.trim());
      let versaoPag = null;
      for (const i of todos) {
        const v = /\d{4}-\d{2}-\d{2}\.\d+\.V\d+/.exec(i.str); if (v) versaoPag = v[0];
        const t = /^(\d+)\s*-\s*(.+)$/.exec(i.str.trim()); if (t && !res.linha && !TEMPO.test(i.str.trim())) { res.linha = t[1]; res.nome = t[2].trim(); }
      }
      // notas de rodapé (a)- …, b)- …): o pdf.js separa a letra do texto, por isso junta-se cada linha
      const porY = new Map();
      for (const i of todos) { const k = Math.round(i.y); (porY.get(k) || porY.set(k, []).get(k)).push(i); }
      for (const l of porY.values()) {
        const txt = l.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
        const n = /^([a-z])\)\s*-\s*(.+)$/.exec(txt); if (n && !res.notas.some((x) => x.k === n[1])) res.notas.push({ k: n[1], txt: n[2].trim() });
      }
      const horas = todos.map((i) => ({ m: min(i.str), r: resto(i.str), x: i.x, y: i.y })).filter((i) => i.m != null);
      if (!horas.length) continue;
      // Tabelas da página, identificadas pelo título ("Dias Úteis", "Sábado", "Domingos e Feriados"...). Cada PDF
      // arruma-as à sua maneira (a 74 tem úteis | fins de semana lado a lado; a 87 tem úteis numa página e
      // sábado | domingos noutra), por isso as colunas de horas dividem-se em tantos grupos quantos os títulos.
      const titulos = todos.map((i) => ({ tipo: tipoTitulo(i.str), x: i.x + (i.w || 0) / 2 })).filter((t) => t.tipo).sort((a, b) => a.x - b.x);
      const ux = [...new Set(horas.map((i) => Math.round(i.x)))].sort((a, b) => a - b);
      const nGrupos = Math.max(1, titulos.length || 2);
      const cortes = ux.slice(1).map((x, k) => ({ x: (x + ux[k]) / 2, g: x - ux[k] })).sort((a, b) => b.g - a.g).slice(0, nGrupos - 1).map((c) => c.x).sort((a, b) => a - b);
      const grupoDe = (x) => cortes.filter((c) => x > c).length;
      const tabelas = Array.from({ length: cortes.length + 1 }, (_, k) => ({
        tipo: titulos.length ? (titulos[k] || titulos[titulos.length - 1]).tipo : (k === 0 ? 'util' : 'fds'),
        sel: (i) => grupoDe(i.x) === k,
      }));
      const topo = Math.max(...horas.map((i) => i.y));
      for (const tab of tabelas) {
        // só interessam os dias úteis; a primeira tabela de outro tipo fica em fds (para referência)
        const tipo = tab.tipo === 'util' ? 'util' : 'fds';
        if (tipo === 'fds' && res.fds.linhas.length) continue;
        const sel = tab.sel, hs = horas.filter(sel);
        if (!hs.length) continue;
        if (tipo === 'util' && versaoPag) res.versao = versaoPag;
        // colunas = grupos de x próximos
        const xs = [...new Set(hs.map((i) => Math.round(i.x)))].sort((a, b) => a - b);
        const cols = [];
        for (const x of xs) { const c = cols[cols.length - 1]; if (c && x - c[c.length - 1] <= 10) c.push(x); else cols.push([x]); }
        const colDe = (x) => cols.findIndex((c) => x >= c[0] - 10 && x <= c[c.length - 1] + 10);
        // nomes das paragens e rótulos (P. / C. / C. P): texto acima da primeira hora, na coluna mais próxima
        const larg = cols.length > 1 ? (cols[cols.length - 1][0] - cols[0][0]) / (cols.length - 1) : 60;
        const cab = cols.map(() => []), rot = cols.map(() => '');
        const perto = (x) => { let k = -1, dm = Infinity; cols.forEach((c, j) => { const cx = (c[0] + c[c.length - 1]) / 2 + larg * 0.25, d = Math.abs(x - cx); if (d < dm) { dm = d; k = j; } }); return dm < larg * 0.75 ? k : -1; };
        for (const i of todos) {
          if (i.y <= topo + 4 || TEMPO.test(i.str.trim()) || grupoDe(i.x) !== tabelas.indexOf(tab)) continue;
          if (ROTULO.test(i.str.trim())) { const k = perto(i.x); if (k >= 0) rot[k] = i.str.trim().replace(/\s+/g, ' '); continue; }
          if (tipoTitulo(i.str) || /Dias|S[áa]bado|Domingo|Feriado|Hor[áa]rios|^\d+\s*-/.test(i.str)) continue;
          const k = perto(i.x); if (k >= 0) cab[k].push(i);
        }
        const R = res[tipo];
        if (!R.paragens.length) { R.paragens = cab.map((l) => l.sort((a, b) => a.x - b.x || b.y - a.y).map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim()); R.rotulos = rot; }
        // linhas: agrupa por altura (de cima para baixo); nova linha quando a diferença passa de 3 pontos
        const ordem = [];
        for (const h of [...hs].sort((a, b) => b.y - a.y)) { const u = ordem[ordem.length - 1]; if (u && u.y - h.y <= 3) u.r.push(h); else ordem.push({ y: h.y, r: [h] }); }
        for (const { r } of ordem) {
          r.sort((a, b) => a.x - b.x);
          const t = cols.map(() => null); let nota = '';
          for (const h of r) { const c = colDe(h.x); if (c >= 0) t[c] = h.m; if (h.r) nota = (nota + ' ' + h.r).trim(); }
          R.linhas.push({ t, nota });
          const c0 = colDe(r[0].x);
          if (c0 === 0) R.saidas.push(r[0].m);
          else R.parciais.push({ m: r[0].m, coluna: c0 });
        }
        R.saidas.sort((a, b) => a - b);
        R.parciais.sort((a, b) => a.m - b.m);
      }
    }
    return res;
  }

  const api = { lerHorario };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Horario = api;
})(typeof window !== 'undefined' ? window : globalThis);
