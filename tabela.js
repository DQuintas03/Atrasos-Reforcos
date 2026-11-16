/* Tabela de atrasos, como numa folha de Excel: todas as viagens da linha em dias úteis, com filtros por sentido,
   paragem de partida, horas, datas e dia da semana; resumo do que está filtrado, quadro por hora e exportação. */
const TAB = { filtro: null, ordem: { col: 'data', asc: true }, mostrar: 300 };
const DSEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const Tabela = (() => {
  const linhas = () => S.dados.viagens.filter((v) => v.linha === S.linha && v.tipoDia === S.tipo);
  const novoFiltro = (vs) => ({
    sentido: '', origem: '', destino: '', de: 0, ate: 24 * 60, d0: vs.reduce((m, v) => (v.data < m ? v.data : m), '9999'),
    d1: vs.reduce((m, v) => (v.data > m ? v.data : m), ''), dia: '', so: false, casc: '',
  });

  function filtrar(vs, f) {
    return vs.filter((v) => (!f.sentido || v.sentido === f.sentido) && (!f.origem || v.origem === f.origem) && (!f.destino || v.destino === f.destino)
      && v.ini >= f.de && v.ini < f.ate && v.data >= f.d0 && v.data <= f.d1
      && (!f.dia || String(new Date(v.data + 'T12:00:00').getDay()) === f.dia) && (!f.so || v.atrasada)
      && (!f.casc || (f.casc === 'inicio' ? v.inicioCascata : v.emCascata)));
  }

  const COLS = [
    ['data', 'Data', (v) => v.data],
    ['dia', 'Dia', (v) => new Date(v.data + 'T12:00:00').getDay()],
    ['sentido', 'Sentido', (v) => v.sentido],
    ['origem', 'Partida de', (v) => nP(v.origem)],
    ['destino', 'Chegada a', (v) => nP(v.destino)],
    ['ini', 'Hora prevista', (v) => v.ini],
    ['atraso', 'Atraso (min)', (v) => v.atraso],
    ['casc', 'Cascata', (v) => (v.inicioCascata ? 2 : v.emCascata ? 1 : 0)],
    ['chapa', 'Chapa', (v) => +v.chapa || 0],
    ['viatura', 'Viatura', (v) => +v.viatura || 0],
  ];

  function resumo(vs) {
    const at = vs.filter((v) => v.atrasada), dias = new Set(vs.map((v) => v.data)).size;
    const media = at.length ? at.reduce((t, v) => t + v.atraso, 0) / at.length : 0;
    return { n: vs.length, at: at.length, dias, media, max: at.reduce((m, v) => Math.max(m, v.atraso), 0), inicios: vs.filter((v) => v.inicioCascata).length };
  }

  function porHora(vs) {
    const g = new Map();
    for (const v of vs) {
      const k = Math.floor(v.ini / 60) + '|' + v.sentido, o = g.get(k) || { h: Math.floor(v.ini / 60), s: v.sentido, n: 0, at: 0, soma: 0, inicios: 0 };
      o.n++; if (v.atrasada) { o.at++; o.soma += v.atraso; } if (v.inicioCascata) o.inicios++;
      g.set(k, o);
    }
    return [...g.values()].sort((a, b) => a.h - b.h || a.s.localeCompare(b.s));
  }

  function opcoes(vs, campo) {
    const c = new Map();
    for (const v of vs) c.set(v[campo], (c.get(v[campo]) || 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]);
  }

  function html() {
    const vs = linhas();
    if (!TAB.filtro) TAB.filtro = novoFiltro(vs);
    const f = TAB.filtro;
    const horas = Array.from({ length: 25 }, (_, h) => h);
    // horas inteiras + a hora exata, quando o filtro vem do clique numa partida do gráfico
    const opH = (lista, v) => { const o = lista.map((h) => [h * 60, String(h).padStart(2, '0') + ':00']); if (v % 60) o.push([v, H(v)]); return o.sort((p, q) => p[0] - q[0]); };
    const sel = (id, val, ops) => `<select id="${id}">${ops.map(([v, t]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    const sentidos = [...new Set(vs.map((v) => v.sentido))].filter((x) => x && x !== '?');
    return `
    <p class="sub">Todas as viagens da linha ${S.linha} em dias úteis, uma por linha, como no relatório de atrasos. Filtre e veja quantas saíram atrasadas; clique num título de coluna para ordenar. Atraso “–” = sem registo de atraso.</p>
    <div class="filtros">
      <div class="field"><label>Sentido</label>${sel('fSent', f.sentido, [['', 'Todos'], ...sentidos.map((s) => [s, s])])}</div>
      <div class="field"><label>Partida de</label>${sel('fOrig', f.origem, [['', 'Todas as paragens'], ...opcoes(vs, 'origem').map(([o, n]) => [o, `${nP(o)} (${n})`])])}</div>
      <div class="field"><label>Chegada a</label>${sel('fDest', f.destino, [['', 'Todas as paragens'], ...opcoes(vs, 'destino').map(([o, n]) => [o, `${nP(o)} (${n})`])])}</div>
      <div class="field"><label>Das</label>${sel('fDe', f.de, opH(horas.slice(0, 24), f.de))}</div>
      <div class="field"><label>Até às</label>${sel('fAte', f.ate, opH(horas.slice(1), f.ate))}</div>
      <div class="field"><label>De</label><input type="date" id="fD0" value="${f.d0}"></div>
      <div class="field"><label>Até</label><input type="date" id="fD1" value="${f.d1}"></div>
      <div class="field"><label>Dia da semana</label>${sel('fDia', f.dia, [['', 'Todos'], ['1', 'Segunda'], ['2', 'Terça'], ['3', 'Quarta'], ['4', 'Quinta'], ['5', 'Sexta']])}</div>
      <div class="field"><label>Cascatas</label>${sel('fCasc', f.casc, [['', 'Todas as viagens'], ['inicio', 'Só onde a cascata começa'], ['em', 'Só viagens em cascata']])}</div>
      <label class="check"><input type="checkbox" id="fSo" ${f.so ? 'checked' : ''}> Só atrasadas (&gt;10 min)</label>
      <button class="btn sec" id="fLimpar">Limpar filtros</button>
      <button class="btn" id="fXls">Exportar para Excel</button>
    </div>
    <div id="tabRes"></div>`;
  }

  function desenharRes() {
    const vs = filtrar(linhas(), TAB.filtro), r = resumo(vs), o = TAB.ordem;
    const col = COLS.find((c) => c[0] === o.col) || COLS[0];
    vs.sort((a, b) => { const x = col[2](a), y = col[2](b); return (x < y ? -1 : x > y ? 1 : a.data.localeCompare(b.data) || a.ini - b.ini) * (o.asc ? 1 : -1); });
    const ph = porHora(vs);
    const casc = (v) => (v.inicioCascata ? '<span class="selo">COMEÇA</span>' : v.emCascata ? '<span class="nota">em cascata</span>' : '');
    $('tabRes').innerHTML = `
      <div class="veredito" style="margin-top:14px">
        <div class="kpi"><div class="v">${r.n.toLocaleString('pt-PT')}</div><div class="l">viagens no filtro (${plural(r.dias, 'dia', 'dias')})</div></div>
        <div class="kpi mau"><div class="v">${r.at.toLocaleString('pt-PT')}</div><div class="l">saíram/chegaram atrasadas &gt;10 min (${r.n ? pc(r.at / r.n) : '0%'})</div></div>
        <div class="kpi"><div class="v">${r.dias ? d1(r.at / r.dias) : 0}</div><div class="l">viagens atrasadas por dia</div></div>
        <div class="kpi"><div class="v">${Math.round(r.media)} min</div><div class="l">atraso médio das atrasadas (máximo ${Math.round(r.max)} min)</div></div>
        <div class="kpi"><div class="v">${r.inicios}</div><div class="l">cascatas começaram nestas viagens</div></div>
      </div>
      <details class="aut" open><summary>Por hora e sentido</summary>
        <div class="rolo" style="max-height:300px;margin-top:8px"><table class="tabela"><thead><tr><th>Hora</th><th>Sentido</th><th>Viagens</th><th>Atrasadas</th><th>%</th><th></th><th>Atraso médio</th><th>Cascatas começam</th></tr></thead><tbody>
        ${ph.map((x) => `<tr><td class="h">${String(x.h).padStart(2, '0')}h</td><td>${x.s}</td><td>${x.n}</td><td>${x.at}</td><td>${x.n ? pc(x.at / x.n) : '–'}</td><td style="width:16%"><div class="barra"><i style="width:${x.n ? Math.round((x.at / x.n) * 100) : 0}%"></i></div></td><td>${x.at ? Math.round(x.soma / x.at) + ' min' : '–'}</td><td>${x.inicios || ''}</td></tr>`).join('')}
        </tbody></table></div></details>
      <div class="rolo xls" style="margin-top:12px"><table class="tabela"><thead><tr>${COLS.map(([k, t]) => `<th data-o="${k}" class="ord">${t}${o.col === k ? (o.asc ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
        ${vs.slice(0, TAB.mostrar).map((v) => `<tr class="${v.atrasada ? 'atr' : ''}"><td>${v.data.split('-').reverse().join('/')}</td><td>${DSEM[new Date(v.data + 'T12:00:00').getDay()]}</td><td>${v.sentido}</td><td>${nP(v.origem)}</td><td>${nP(v.destino)}</td><td class="h">${H(v.ini)}</td><td class="num">${v.atraso ? d1(v.atraso) : '–'}</td><td>${casc(v)}</td><td class="num">${v.chapa}</td><td class="num">${v.viatura}</td></tr>`).join('')}
      </tbody></table></div>
      ${vs.length > TAB.mostrar ? `<p class="nota" style="margin-top:8px">A mostrar ${TAB.mostrar} de ${vs.length.toLocaleString('pt-PT')} viagens. <button class="mini" id="fMais">Mostrar mais</button> Ou exporte para Excel para ver todas.</p>` : ''}`;
    document.querySelectorAll('#tabRes th.ord').forEach((th) => th.onclick = () => { const k = th.dataset.o; TAB.ordem = { col: k, asc: TAB.ordem.col === k ? !TAB.ordem.asc : true }; desenharRes(); });
    if ($('fMais')) $('fMais').onclick = () => { TAB.mostrar += 500; desenharRes(); };
  }

  function exportar() {
    const vs = filtrar(linhas(), TAB.filtro).sort((a, b) => a.data.localeCompare(b.data) || a.ini - b.ini), r = resumo(vs), f = TAB.filtro;
    const cab = { negrito: true, fundo: 'DDEBF7', borda: true };
    const fil = [f.sentido && 'sentido ' + f.sentido, f.origem && 'partida de ' + nP(f.origem), f.destino && 'chegada a ' + nP(f.destino), (f.de > 0 || f.ate < 1440) && `das ${H(f.de)} às ${H(f.ate)}`, f.dia && DSEM[+f.dia], f.so && 'só atrasadas', f.casc && (f.casc === 'inicio' ? 'só início de cascata' : 'só em cascata')].filter(Boolean).join(', ') || 'sem filtros';
    const viagens = [
      [{ v: `Linha ${S.linha} – viagens em dias úteis de ${f.d0.split('-').reverse().join('/')} a ${f.d1.split('-').reverse().join('/')} (${fil})`, negrito: true }],
      COLS.map(([, t]) => ({ v: t, ...cab })),
      ...vs.map((v) => [v.data.split('-').reverse().join('/'), DSEM[new Date(v.data + 'T12:00:00').getDay()], v.sentido, nP(v.origem), nP(v.destino), { v: v.ini, hora: true },
        v.atraso ? Math.round(v.atraso * 10) / 10 : '', v.inicioCascata ? 'começa' : v.emCascata ? 'em cascata' : '', +v.chapa || v.chapa, +v.viatura || v.viatura].map((c, i) => (v.atrasada && i === 6 ? { v: c, fundo: 'FFC7CE', cor: '9C0006' } : c))),
    ];
    const ph = porHora(vs);
    const horas = [
      [{ v: 'Resumo por hora e sentido', negrito: true }],
      ['Hora', 'Sentido', 'Viagens', 'Atrasadas (>10 min)', '% atrasadas', 'Atraso médio (min)', 'Cascatas começam'].map((t) => ({ v: t, ...cab })),
      ...ph.map((x) => [String(x.h).padStart(2, '0') + 'h', x.s, x.n, x.at, x.n ? Math.round((x.at / x.n) * 1000) / 10 : 0, x.at ? Math.round(x.soma / x.at) : '', x.inicios]),
      [],
      ['Total', '', r.n, r.at, r.n ? Math.round((r.at / r.n) * 1000) / 10 : 0, Math.round(r.media), r.inicios].map((c) => ({ v: c, negrito: true })),
    ];
    Excel.descarregar([
      { nome: 'Viagens', colunas: [11, 6, 8, 34, 34, 12, 12, 12, 8, 8], fixar: 2, filtro: `A2:J${vs.length + 2}`, linhas: viagens },
      { nome: 'Por hora', colunas: [8, 9, 9, 18, 12, 18, 18], fixar: 2, linhas: horas },
    ], `atrasos_linha${S.linha}_${f.d0}_${f.d1}.xlsx`);
  }

  function ligar() {
    const f = TAB.filtro, upd = () => { TAB.mostrar = 300; desenharRes(); };
    $('fSent').onchange = (e) => { f.sentido = e.target.value; upd(); };
    $('fOrig').onchange = (e) => { f.origem = e.target.value; upd(); };
    $('fDest').onchange = (e) => { f.destino = e.target.value; upd(); };
    $('fDe').onchange = (e) => { f.de = +e.target.value; upd(); };
    $('fAte').onchange = (e) => { f.ate = +e.target.value; upd(); };
    $('fD0').onchange = (e) => { f.d0 = e.target.value || f.d0; upd(); };
    $('fD1').onchange = (e) => { f.d1 = e.target.value || f.d1; upd(); };
    $('fDia').onchange = (e) => { f.dia = e.target.value; upd(); };
    $('fCasc').onchange = (e) => { f.casc = e.target.value; upd(); };
    $('fSo').onchange = (e) => { f.so = e.target.checked; upd(); };
    $('fLimpar').onclick = () => { TAB.filtro = null; $('cardTabela').innerHTML = html(); ligar(); };
    $('fXls').onclick = exportar;
    desenharRes();
  }

  // filtro de uma partida (clique no gráfico); null limpa
  function porPartida(sentido, origem, destino, m) {
    if (sentido === null) TAB.filtro = null;
    else { TAB.filtro = { ...novoFiltro(linhas()), sentido, origem, destino, de: m, ate: m + 1 }; TAB.mostrar = 300; }
    if ($('cardTabela')) { $('cardTabela').innerHTML = html(); ligar(); }
  }

  return { html, ligar, filtrar, porPartida };
})();
