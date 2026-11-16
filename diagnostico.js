// Diagnóstico por partida: para cada partida do dia típico, com que frequência chega atrasada e com que
// frequência é aí que nasce uma cascata. Trabalha sobre as viagens já juntas (rep3 + rep20).
(function (root) {
  const mediana = (a) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor((s.length - 1) / 2)];
  };

  // Percurso principal da linha: o par origem>destino mais frequente (ex. HOSPITAL>HOSPITAL).
  function parPrincipal(vs) {
    const c = new Map();
    for (const v of vs) if (!v.soNosAtrasos) { const k = v.origem + '>' + v.destino; c.set(k, (c.get(k) || 0) + 1); }
    let m = null, n = 0;
    for (const [k, x] of c) if (x > n) { m = k; n = x; }
    return m;
  }

  // Perfil das partidas de um sentido (lista ordenada, com % de dias em atraso e cascatas nascidas).
  function perfilSentido(vs, par, nd, saidas, cascPorChave) {
    const porSlot = new Map();
    for (const v of vs) {
      if (v.origem + '>' + v.destino !== par) continue;
      const o = porSlot.get(v.ini) || { m: v.ini, n: 0, atrasadas: 0, inicios: 0, atrasos: [], casc: [] };
      o.n++;
      if (v.atrasada) { o.atrasadas++; o.atrasos.push(v.atraso); }
      if (v.inicioCascata) { o.inicios++; const c = cascPorChave.get(v.data + '|' + v.viatura + '|' + v.ini); if (c) o.casc.push(c); }
      porSlot.set(v.ini, o);
    }
    let lista;
    if (saidas && saidas.length) lista = saidas.map((m) => porSlot.get(m) || { m, n: 0, atrasadas: 0, inicios: 0, atrasos: [], casc: [] });
    else lista = [...porSlot.values()].filter((o) => o.n >= nd * 0.3);
    lista = lista.sort((a, b) => a.m - b.m).map((o) => ({
      m: o.m, n: o.n, presenca: o.n / nd,
      pAtraso: o.n ? o.atrasadas / o.n : 0, atrasadas: o.atrasadas, atrasos: o.atrasos,
      atrasoTipico: mediana(o.atrasos), inicios: o.inicios, pInicio: o.n ? o.inicios / o.n : 0, casc: o.casc,
    }));
    const gaps = lista.slice(1).map((o, i) => o.m - lista[i].m).filter((g) => g > 0);
    return { par, lista, intervalo: mediana(gaps) || 30 };
  }

  // saidas: { Ida: [...], Volta: [...] } partidas do horário oficial (opcional). Sem elas, usa as que existem na maioria dos dias.
  // Devolve: lista (sentido principal, usada pela proposta), sentidos {Ida, Volta}, zonas críticas (com sentido e
  // explicação), picos de atraso por hora e a grelha hora × sentido.
  function perfilPartidas(viagens, linha, tipoDia, saidas, cascatas) {
    const vs = viagens.filter((v) => v.linha === linha && v.tipoDia === tipoDia);
    if (!vs.length) return null;
    const datas = [...new Set(vs.map((v) => v.data))].sort(), nd = datas.length;
    const cascPorChave = new Map();
    for (const c of cascatas || []) if (c.linha === linha && c.tipoDia === tipoDia) cascPorChave.set(c.data + '|' + c.viatura + '|' + c.inicio, c);
    const nomesS = ['Ida', 'Volta'].filter((x) => vs.some((v) => v.sentido === x));
    const sentidos = {};
    for (const sn of (nomesS.length ? nomesS : ['?'])) {
      const par = sn === '?' ? parPrincipal(vs) : parPrincipal(vs.filter((v) => v.sentido === sn));
      if (par) sentidos[sn] = perfilSentido(vs, par, nd, saidas && saidas[sn], cascPorChave);
    }
    const principal = sentidos.Ida || Object.values(sentidos)[0];
    // duração típica do sentido principal (leva uma partida da volta para a partida da ida que a origina)
    const dIda = mediana(vs.filter((v) => v.origem + '>' + v.destino === principal.par && v.dur > 0).map((v) => v.dur)) || 0;
    // partida crítica: aquela onde as cascatas nascem claramente mais vezes do que na média (dos dois sentidos)
    const todas = Object.values(sentidos).flatMap((s) => s.lista);
    const media = todas.reduce((t, o) => t + o.pInicio, 0) / Math.max(1, todas.length);
    for (const o of todas) o.critica = o.inicios >= 5 && o.pInicio >= Math.max(0.04, media * 1.6);
    const totalIn = todas.reduce((t, o) => t + o.inicios, 0);
    // zonas críticas: partidas críticas seguidas do mesmo sentido (permite falhar uma)
    const zonas = [];
    for (const [sn, P] of Object.entries(sentidos)) {
      const [orig, dest] = P.par.split('>');
      let z = null;
      for (const o of P.lista) {
        if (!o.critica) continue;
        if (z && o.m - z.hFim <= P.intervalo * 2.01) { z.hFim = o.m; z.partidas++; z.inicios += o.inicios; z.casc.push(...o.casc); z.lista.push(o.m); }
        else { z = { sentido: sn, origem: orig, destino: dest, hIni: o.m, hFim: o.m, partidas: 1, inicios: o.inicios, casc: [...o.casc], lista: [o.m] }; zonas.push(z); }
      }
    }
    const pl = principal.lista.map((o) => o.m);
    const perto = (t) => pl.reduce((m, x) => (Math.abs(x - t) < Math.abs(m - t) ? x : m), pl[0]);
    for (const z of zonas) {
      z.parte = totalIn ? z.inicios / totalIn : 0;
      // em termos de partida do sentido principal (a proposta trabalha sobre essas partidas)
      const desloca = z.sentido === 'Volta' && sentidos.Ida ? dIda : 0;
      z.ini = perto(z.hIni - desloca); z.fim = perto(z.hFim - desloca);
      z.dias = new Set(z.casc.map((c) => c.data)).size;
      z.viagensTipica = mediana(z.casc.map((c) => c.viagens));
      z.atrasoPico = mediana(z.casc.map((c) => c.atrasoPico));
      z.atrasoInicial = mediana(z.casc.map((c) => c.atrasoInicial));
      z.ateTipico = mediana(z.casc.map((c) => c.fim));
    }
    zonas.sort((a, b) => a.ini - b.ini || a.hIni - b.hIni);
    // grelha hora × sentido (viagens atrasadas acima do limiar)
    const grelha = {};
    for (const v of vs) {
      if (v.sentido !== 'Ida' && v.sentido !== 'Volta') continue;
      const h = Math.floor(v.ini / 60), g = (grelha[v.sentido] = grelha[v.sentido] || {}), o = (g[h] = g[h] || { n: 0, atrasadas: 0 });
      o.n++; if (v.atrasada) o.atrasadas++;
    }
    // períodos com mais atrasos: horas seguidas com pelo menos metade do máximo de viagens atrasadas
    const porHora = {};
    for (const g of Object.values(grelha)) for (const [h, o] of Object.entries(g)) porHora[h] = (porHora[h] || 0) + o.atrasadas;
    const horas = Object.keys(porHora).map(Number).sort((a, b) => a - b);
    const mx = Math.max(0, ...Object.values(porHora)), totAt = Object.values(porHora).reduce((t, x) => t + x, 0);
    const picos = [];
    for (const h of horas) {
      if (porHora[h] < mx * 0.5) continue;
      const p = picos[picos.length - 1];
      if (p && p.fim === h * 60) { p.fim = (h + 1) * 60; p.n += porHora[h]; } else picos.push({ ini: h * 60, fim: (h + 1) * 60, n: porHora[h] });
    }
    picos.forEach((p) => { p.parte = totAt ? p.n / totAt : 0; });
    return {
      par: principal.par, dias: nd, de: datas[0], ate: datas[nd - 1], lista: principal.lista, sentidos, zonas,
      intervalo: principal.intervalo, mediaInicio: media, totalInicios: totalIn, grelha, picos, porHora, durIda: dIda,
    };
  }

  // Como se forma uma cascata nesta linha: quantas, quão longas, quão grandes, e onde nasce o atraso.
  function anatomia(viagens, cascatas, linha, tipoDia) {
    const vs = viagens.filter((v) => v.linha === linha && v.tipoDia === tipoDia);
    const cs = cascatas.filter((c) => c.linha === linha && c.tipoDia === tipoDia);
    const dias = new Set(vs.map((v) => v.data)).size;
    const grupos = new Map();
    for (const v of vs) { const k = v.data + '|' + v.viatura; (grupos.get(k) || grupos.set(k, []).get(k)).push(v); }
    let nasce = 0, propaga = 0;
    for (const g of grupos.values()) {
      g.sort((a, b) => a.ini - b.ini);
      g.forEach((v, i) => { if (!v.atrasada) return; if (i > 0 && g[i - 1].atrasada) propaga++; else nasce++; });
    }
    const atras = nasce + propaga;
    return {
      dias, cascatas: cs.length, porDia: dias ? cs.length / dias : 0,
      viagensTipica: mediana(cs.map((c) => c.viagens)), atrasoInicial: mediana(cs.map((c) => c.atrasoInicial)),
      atrasoPico: mediana(cs.map((c) => c.atrasoPico)), nasce: atras ? nasce / atras : 0, propaga: atras ? propaga / atras : 0,
      viagens: vs.length, atrasadas: atras,
    };
  }

  const api = { perfilPartidas, anatomia, parPrincipal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Diagnostico = api;
})(typeof window !== 'undefined' ? window : globalThis);
