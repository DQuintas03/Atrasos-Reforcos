// Motor de simulação: repete um dia real com alterações ao horário e recalcula os atrasos.
//
// Modelo: cada viatura faz as suas viagens por ordem. A viagem seguinte parte à hora prevista,
// ou mais tarde se a viatura ainda não chegou:
//   partida = max(hora prevista, fim da viagem anterior)
//   fim     = partida + duração prevista + excesso da viagem
// O "excesso" é o tempo a mais (ou a menos) que aquela viagem demorou nesse dia. É deduzido dos
// atrasos observados e fica associado à viagem (hora do dia), por isso acompanha-a quando muda de viatura.
(function (root) {
  const LIMIAR = 10;
  const SAIDA = 0; // minutos depois do período em que a rotação continua sem a viatura extra
  const O_MAX = 15, O_MIN = -5; // limites do excesso que acompanha uma viagem quando muda de viatura
  const TOL_SAIDA = 3;
  const TOL_ROT = 8; // atraso (min) que ainda se considera "a horas" ao escolher a viatura
  const BASES = new WeakMap(); // simulação sem reforço de cada dia (para não a repetir)
  const QUEBRA = 20; // folga (min) a partir da qual se considera pausa e não há propagação de atraso

  const mediana = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor((s.length - 1) / 2)];
  };

  function prepararDias(viagens) {
    const porDia = new Map();
    for (const v of viagens) {
      if (v.soNosAtrasos || !(v.dur > 0)) continue;
      const k = v.data + '|' + v.linha;
      if (!porDia.has(k)) porDia.set(k, []);
      porDia.get(k).push(v);
    }
    const dias = [];
    const obs = new Map(); // excessos observados por linha|tipoDia|chave e por hora
    for (const arr of porDia.values()) {
      const trips = arr.map((v, i) => ({
        id: i, viatura: v.viatura, chapa: v.chapa, motorista: v.motorista, ini: v.ini, dur: v.dur,
        origem: v.origem, destino: v.destino, passageiros: v.passageiros,
        chave: v.origem + '>' + v.destino + '@' + v.ini, dObs: v.atraso, segInicio: true, oObs: null, oLim: null,
      }));
      const grupos = new Map();
      trips.forEach((t) => { if (!grupos.has(t.viatura)) grupos.set(t.viatura, []); grupos.get(t.viatura).push(t); });
      const linha = arr[0].linha, tipoDia = arr[0].tipoDia;
      for (const g of grupos.values()) {
        g.sort((a, b) => a.ini - b.ini);
        for (let i = 0; i + 1 < g.length; i++) {
          const t = g[i], n = g[i + 1];
          const s = n.ini - (t.ini + t.dur);
          if (s > QUEBRA) continue; // pausa: a viagem seguinte arranca por si
          n.segInicio = false;
          if (n.dObs > 0) {
            t.oObs = n.dObs - t.dObs + s;
            const kk = linha + '|' + tipoDia + '|' + t.chave, kh = linha + '|' + tipoDia + '|h' + Math.floor(t.ini / 60);
            (obs.get(kk) || obs.set(kk, []).get(kk)).push(t.oObs);
            (obs.get(kh) || obs.set(kh, []).get(kh)).push(t.oObs);
          } else {
            t.oLim = s - t.dObs; // a viagem foi, no máximo, tão longa como isto
          }
        }
      }
      dias.push({ data: arr[0].data, linha, tipoDia, trips });
    }
    const tip = new Map();
    for (const [k, v] of obs) tip.set(k, mediana(v));
    for (const d of dias) {
      for (const t of d.trips) {
        if (t.oObs != null) { t.o = t.oObs; continue; }
        const pref = d.linha + '|' + d.tipoDia + '|';
        const tipico = tip.get(pref + t.chave) ?? tip.get(pref + 'h' + Math.floor(t.ini / 60)) ?? 0;
        t.o = t.oLim != null ? Math.min(t.oLim, tipico) : tipico;
      }
    }
    // Percurso principal: o par origem>destino mais frequente da linha e o seu sentido contrário.
    const freq = new Map();
    for (const d of dias) for (const t of d.trips) { const k = d.linha + '|' + d.tipoDia + '|' + t.origem + '>' + t.destino; freq.set(k, (freq.get(k) || 0) + 1); }
    const principal = new Map();
    for (const [k, n] of freq) { const g = k.split('|').slice(0, 2).join('|'); if (!principal.has(g) || principal.get(g).n < n) principal.set(g, { k: k.split('|')[2], n }); }
    for (const d of dias) {
      const pk = principal.get(d.linha + '|' + d.tipoDia).k, [po, pd] = pk.split('>');
      for (const t of d.trips) {
        const par = t.origem + '>' + t.destino;
        t.sentidoP = par === pk;
        t.principal = t.sentidoP || par === pd + '>' + po;
      }
    }
    return dias;
  }

  // Simula um dia. ed.janelas: [{a,b}] períodos (minutos) com uma viatura extra e motorista.
  // Nesses períodos as viagens do circuito principal passam a rodar por N+1 viaturas: a extra faz a
  // primeira viagem e cada viagem seguinte vai para a viatura que está livre há mais tempo. Assim cada
  // viatura ganha folga em cada ciclo (ninguém fica parado: avança para a viagem que lhe cabe).
  // A extra só começa viagens que acabam dentro do período (ciclo completo). Depois do período, durante
  // 'saida' minutos, a rotação continua só com as viaturas normais, para a saída ser suave.
  // ed.viatura / ed.deslocar: alterações manuais por viagem.
  function simular(dia, ed = {}) {
    const viat = ed.viatura || {}, desl = ed.deslocar || {}, jan = ed.janelas || [];
    const itens = dia.trips.map((t) => ({ ...t, viaturaSim: viat[t.id] ?? t.viatura, iniSim: t.ini + (desl[t.id] || 0) }))
      .sort((a, b) => a.iniSim - b.iniSim || a.id - b.id);
    const saida = ed.saida ?? SAIDA, fixa = !!ed.fixa; // fixa: a escala é seguida à risca, sem ajustes ao vivo
    const est = new Map();
    const estado = (id) => { if (!est.has(id)) est.set(id, { pronto: -Infinity, fimPrev: null, loc: null }); return est.get(id); };
    // a viatura só pode fazer uma viagem se estiver no sítio onde ela parte
    const noSitio = (id, it) => { const l = estado(id).loc; return l == null || l === it.origem; };
    // período de serviço de cada viatura (nas viagens reais): só entra na rotação enquanto está em serviço
    const turno = new Map();
    for (const t of itens) {
      const o = turno.get(t.viaturaSim) || { ini: Infinity, fim: -Infinity };
      o.ini = Math.min(o.ini, t.iniSim); o.fim = Math.max(o.fim, t.iniSim + t.dur); turno.set(t.viaturaSim, o);
    }
    // viagens fora do circuito principal (recolhas, parciais): fixas na viatura que as faz
    const fixas = new Map();
    for (const t of itens) if (!t.principal) (fixas.get(t.viaturaSim) || fixas.set(t.viaturaSim, []).get(t.viaturaSim)).push(t.iniSim);
    const livre = (id, it) => !(fixas.get(id) || []).some((x) => x > it.iniSim && x < it.iniSim + it.dur);
    const zonaDe = (t, j) => t.principal && t.iniSim >= j.a && (t.iniSim + t.dur <= j.b || t.iniSim <= j.b + saida);
    const pools = jan.map((j) => [...new Set(itens.filter((t) => zonaDe(t, j)).map((t) => t.viaturaSim))]);
    const extras = jan.map((j, w) => Array.from({ length: j.k || 1 }, (_, i) => ({ id: 'REFORÇO ' + (w + 1) + (j.k > 1 ? '.' + (i + 1) : ''), entrou: false })));
    // Depois do período, uma viagem cuja viatura chega mais tarde do que chegaria sem reforço (porque a rotação a
    // desfasou) passa para a viatura da rotação que estiver livre: assim o fim do período não deixa atrasos novos.
    let base = null;
    if (jan.length) {
      const manual = Object.keys(viat).length || Object.keys(desl).length;
      base = !manual && BASES.get(dia);
      if (!base) {
        base = new Map(simular(dia, { ...ed, janelas: [] }).map((t) => [t.id, t.dep]));
        if (!manual) BASES.set(dia, base);
      }
    }
    const todas = [...new Set(pools.flat())];
    for (const it of itens) {
      const w = jan.findIndex((j) => zonaDe(it, j));
      if (w >= 0) {
        const j = jan[w], exts = extras[w], comExtra = it.iniSim + it.dur <= j.b;
        const cand = pools[w].filter((id) => { const tn = turno.get(id); return tn.ini <= it.iniSim && tn.fim >= it.iniSim && livre(id, it) && noSitio(id, it); });
        const novo = comExtra && it.iniSim >= j.a ? exts.find((e) => !e.entrou) : null;
        if (comExtra) for (const e of exts) if (e.entrou && noSitio(e.id, it)) cand.push(e.id);
        let esc = null;
        if (novo) esc = novo.id;
        else {
          // escolhe a viatura que chega a horas (até TOL_SAIDA de atraso); entre essas, a que tem o compromisso fixo
          // mais próximo (as livres ficam para depois); por fim, a que está parada há mais tempo
          const fimV = it.iniSim + it.dur;
          const chave = (x) => {
            const pp = fixa ? (estado(x).fimPrev ?? -Infinity) : estado(x).pronto, lat = Math.max(0, pp - it.iniSim), fx = (fixas.get(x) || []).filter((y) => y >= fimV);
            return [lat <= (fixa ? 0 : TOL_ROT) ? 0 : lat, fx.length ? Math.min(...fx) - fimV : Infinity, pp];
          };
          const menor = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
          let ke = null;
          for (const id of cand) { const k = chave(id); if (esc == null || menor(k, ke)) { esc = id; ke = k; } }
        }
        if (esc != null) {
          const ee = exts.find((e) => e.id === esc); if (ee) ee.entrou = true;
          const V = estado(esc), orig = it.viaturaSim;
          let oRun = it.o;
          if (esc !== orig) {
            // excessos muito grandes são incidentes da viatura que os teve (avaria, desvio): não passam para quem a substitui
            oRun = Math.max(O_MIN, Math.min(O_MAX, it.o));
            if (it.o > O_MAX) { const Y = estado(orig); Y.pronto = Math.max(Y.pronto, it.iniSim + Math.max(0, it.dObs) + it.dur + it.o); Y.fimPrev = it.iniSim + it.dur; }
          }
          it.viaturaSim = esc;
          it.dep = Math.max(it.iniSim, V.pronto); it.atraso = it.dep - it.iniSim; it.fim = it.dep + it.dur + oRun;
          V.pronto = it.fim; V.fimPrev = it.iniSim + it.dur; V.loc = it.destino;
          continue;
        }
      }
      const V = estado(it.viaturaSim);
      const cadeia = V.fimPrev != null && it.iniSim - V.fimPrev <= QUEBRA;
      const arranque = cadeia ? V.pronto : it.iniSim + (it.segInicio ? it.dObs : 0);
      if (base && w < 0 && it.principal && jan.some((j) => it.iniSim > j.b) && arranque > base.get(it.id) + TOL_SAIDA) {
        let esc = null;
        for (const id of todas) {
          const tn = turno.get(id); if (id === it.viaturaSim || !(tn.ini <= it.iniSim && tn.fim >= it.iniSim) || !livre(id, it) || !noSitio(id, it)) continue;
          const pr = Math.max(it.iniSim, estado(id).pronto);
          if (pr < arranque - TOL_SAIDA && (esc == null || pr < Math.max(it.iniSim, estado(esc).pronto))) esc = id;
        }
        if (esc != null) {
          const E = estado(esc);
          it.viaturaSim = esc;
          it.dep = Math.max(it.iniSim, E.pronto); it.atraso = it.dep - it.iniSim; it.fim = it.dep + it.dur + it.o;
          E.pronto = it.fim; E.fimPrev = it.iniSim + it.dur; E.loc = it.destino;
          continue;
        }
      }
      it.dep = Math.max(it.iniSim, arranque); it.atraso = it.dep - it.iniSim; it.fim = it.dep + it.dur + it.o;
      V.pronto = it.fim; V.fimPrev = it.iniSim + it.dur; V.loc = it.destino;
    }
    return itens;
  }

  function metricas(trips) {
    const grupos = new Map();
    trips.forEach((t) => { if (!grupos.has(t.viaturaSim)) grupos.set(t.viaturaSim, []); grupos.get(t.viaturaSim).push(t); });
    let casc = 0;
    for (const g of grupos.values()) {
      g.sort((a, b) => a.iniSim - b.iniSim);
      let i = 0;
      while (i < g.length) {
        if (g[i].atraso <= LIMIAR) { i++; continue; }
        let j = i;
        while (j + 1 < g.length && g[j + 1].atraso > LIMIAR) j++;
        if (j > i && g[j].atraso > g[i].atraso) casc++;
        i = j + 1;
      }
    }
    const at = trips.filter((t) => t.atraso > LIMIAR);
    return {
      viagens: trips.length, atrasadas: at.length, minutosAtraso: at.reduce((a, t) => a + t.atraso, 0),
      cascatas: casc, passageiros: at.reduce((a, t) => a + t.passageiros, 0),
    };
  }

  const ZERO = () => ({ atrasadas: 0, minutosAtraso: 0, cascatas: 0, passageiros: 0 });
  const soma = (acc, m) => { for (const c in acc) acc[c] += m[c]; };

  // Aplica os períodos a todos os dias do filtro. opc.filtroDia escolhe um subconjunto (validação).
  function backtest(dias, linha, tipoDia, janelas, opc = {}) {
    const r = { prejudicadas: 0, melhoradas: 0, dias: 0, antes: ZERO(), depois: ZERO(), horasExtra: janelas.reduce((s, j) => s + (j.b - j.a), 0) / 60, porHora: {}, porPartida: {} };
    for (const d of dias) {
      if (d.linha !== linha || d.tipoDia !== tipoDia || (opc.filtroDia && !opc.filtroDia(d))) continue;
      r.dias++;
      const a = simular(d), b = simular(d, { janelas, tolerancia: opc.tolerancia, fixa: opc.fixa });
      { const m = new Map(a.map((t) => [t.id, t.atraso])); for (const t of b) { const x = m.get(t.id); if (t.atraso > x + 5) r.prejudicadas++; else if (t.atraso < x - 5) r.melhoradas++; } }
      soma(r.antes, metricas(a)); soma(r.depois, metricas(b));
      const acum = (trips, campo) => trips.forEach((t) => {
        const h = Math.floor(t.iniSim / 60);
        const o = (r.porHora[h] = r.porHora[h] || { n: 0, antes: 0, depois: 0 });
        if (campo === 'antes') o.n++;
        if (t.atraso > LIMIAR) o[campo]++;
        if (t.sentidoP) { const q = (r.porPartida[t.ini] = r.porPartida[t.ini] || { n: 0, antes: 0, depois: 0 }); if (campo === 'antes') q.n++; if (t.atraso > LIMIAR) q[campo]++; }
      });
      acum(a, 'antes'); acum(b, 'depois');
    }
    return r;
  }

  const ganho = (r) => r.antes.minutosAtraso - r.depois.minutosAtraso;

  // Ganho de cada período candidato (todas as partidas de 10 em 10 min, várias durações), somado nos dias.
  function candidatos(sel, tol) {
    let min = Infinity, max = -Infinity;
    for (const d of sel) for (const t of d.trips) { min = Math.min(min, t.ini); max = Math.max(max, t.ini + t.dur); }
    const base = new Map(sel.map((d) => [d, metricas(simular(d)).minutosAtraso]));
    const cand = [];
    for (let a = Math.floor(min / 10) * 10; a < max; a += 10) {
      for (const len of [60, 80, 120, 160, 200, 240]) {
        const b = a + len;
        if (b > max + 30) continue;
        let g = 0;
        for (const d of sel) g += base.get(d) - metricas(simular(d, { janelas: [{ a, b }], tolerancia: tol })).minutosAtraso;
        if (g > 0) cand.push({ a, b, g });
      }
    }
    return cand;
  }

  // Melhor conjunto de períodos sem sobreposição: no máximo maxJ períodos e maxMin minutos no total.
  function escolher(cand, maxJ, maxMin) {
    const porInicio = new Map();
    for (const c of cand) (porInicio.get(c.a) || porInicio.set(c.a, []).get(c.a)).push(c);
    const inicios = [...porInicio.keys()].sort((x, y) => x - y);
    const seguinte = (t) => { let i = 0; while (i < inicios.length && inicios[i] < t) i++; return i; };
    const memo = new Map();
    const f = (i, c, m) => {
      if (i >= inicios.length || c === 0 || m <= 0) return { g: 0, esc: [] };
      const k = i + '|' + c + '|' + m;
      if (memo.has(k)) return memo.get(k);
      let melhor = f(i + 1, c, m);
      for (const w of porInicio.get(inicios[i])) {
        const len = w.b - w.a;
        if (len > m) continue;
        const sub = f(seguinte(w.b), c - 1, m - len);
        if (w.g + sub.g > melhor.g) melhor = { g: w.g + sub.g, esc: [w, ...sub.esc] };
      }
      memo.set(k, melhor);
      return melhor;
    };
    return f(0, maxJ, maxMin);
  }

  // Períodos seguidos passam a ser um só (a mesma viatura continua).
  function juntar(jan) {
    const o = [];
    for (const j of [...jan].sort((x, y) => x.a - y.a)) {
      if (o.length && o[o.length - 1].b >= j.a) o[o.length - 1].b = Math.max(o[o.length - 1].b, j.b); else o.push({ a: j.a, b: j.b });
    }
    return o;
  }

  // Plano para o orçamento pedido e curva "horas de reforço -> atraso evitado".
  function planear(dias, linha, tipoDia, opc = {}) {
    const maxJ = opc.maxJanelas ?? 3, maxH = opc.maxHoras ?? 6, tol = opc.tolerancia, filtro = opc.filtroDia;
    const sel = dias.filter((d) => d.linha === linha && d.tipoDia === tipoDia && (!filtro || filtro(d)));
    if (!sel.length) return null;
    const cand = opc.candidatos || candidatos(sel, tol);
    const avaliar = (h) => {
      const e = escolher(cand, maxJ, h * 60);
      const jan = juntar(e.esc);
      const r = backtest(dias, linha, tipoDia, jan, { tolerancia: tol, filtroDia: filtro });
      return { horas: h, janelas: jan, g: ganho(r), r };
    };
    const curva = [];
    for (let h = 1; h <= Math.max(maxH, 1); h++) {
      const p = avaliar(h);
      if (!p.janelas.length) continue;
      const ant = curva[curva.length - 1];
      curva.push(ant && ant.g >= p.g ? { ...ant, horas: h } : p); // mais horas nunca devem dar menos
    }
    const melhor = curva.filter((p) => p.horas <= maxH).pop() || null;
    return melhor && { ...melhor, curva, candidatos: cand };
  }

  // Validação: escolhe os períodos com os meses ímpares e mede o ganho nos meses pares.
  function validarPlano(dias, linha, tipoDia, opc = {}) {
    const mes = (d) => +d.data.slice(5, 7);
    const p = planear(dias, linha, tipoDia, { ...opc, filtroDia: (d) => mes(d) % 2 === 1 });
    if (!p) return null;
    const r = backtest(dias, linha, tipoDia, p.janelas, { tolerancia: opc.tolerancia, filtroDia: (d) => mes(d) % 2 === 0 });
    return { janelas: p.janelas, treino: p.r, teste: r };
  }

  // Ciclo da linha: tempo que uma viatura demora até repetir o circuito principal (ex. 60 min), intervalo
  // entre partidas (ex. 20 min) e viaturas necessárias. Sugestão de reforço: +1 viatura e ciclo + intervalo.
  function ciclo(dias, linha, tipoDia) {
    const moda = (a) => { const c = new Map(); for (const x of a) { const k = Math.round(x / 5) * 5; c.set(k, (c.get(k) || 0) + 1); } let m = null, n = 0; for (const [k, v] of c) if (v > n) { m = k; n = v; } return a.length && n / a.length >= 0.3 ? m : null; };
    const gc = [], gi = [];
    for (const d of dias) {
      if (d.linha !== linha || d.tipoDia !== tipoDia) continue;
      const pr = d.trips.filter((t) => t.sentidoP).sort((a, b) => a.ini - b.ini);
      for (let i = 0; i + 1 < pr.length; i++) { const g = pr[i + 1].ini - pr[i].ini; if (g >= 5 && g <= 45) gi.push(g); }
      const por = new Map();
      for (const t of pr) (por.get(t.viatura) || por.set(t.viatura, []).get(t.viatura)).push(t);
      // volta completa = ida + volta, sem assumir que duram o mesmo (87: 20 + 25 = 45 min > 2,2 x 20)
      for (const g of por.values()) for (let i = 0; i + 1 < g.length; i++) { const x = g[i + 1].ini - g[i].ini; if (x >= g[i].dur * 0.9 && x <= g[i].dur * 3) gc.push(x); }
    }
    const c = moda(gc), iv = moda(gi);
    const durs = []; for (const d of dias) if (d.linha === linha && d.tipoDia === tipoDia) for (const t of d.trips) if (t.sentidoP) durs.push(t.dur);
    const durP = mediana(durs);
    if (!c || !iv) return null;
    const n = Math.max(1, Math.round(c / iv));
    return { ciclo: c, intervalo: iv, viaturas: n, cicloNovo: (n + 1) * iv, viaturasNovo: n + 1, unica: n < 2, dur: durP };
  }

  // Quando começam os atrasos: em cada dia, a primeira viagem atrasada (>LIMIAR) de manhã (até às 12h) e à tarde
  // (a partir das 14h). Devolve a mediana e os quartis dos dias em que isso aconteceu.
  function inicios(dias, linha, tipoDia) {
    const per = { manha: [], tarde: [] }, nd = dias.filter((d) => d.linha === linha && d.tipoDia === tipoDia);
    for (const d of nd) {
      const at = d.trips.filter((t) => t.dObs > LIMIAR).map((t) => t.ini).sort((a, b) => a - b);
      const m = at.find((t) => t < 720), t = at.find((t) => t >= 840);
      if (m != null) per.manha.push(m);
      if (t != null) per.tarde.push(t);
    }
    const q = (a, f) => a[Math.floor(f * (a.length - 1))];
    const res = {};
    for (const k in per) {
      const a = per[k].sort((x, y) => x - y);
      if (a.length >= 5 && a.length >= nd.length * 0.3) res[k] = { dias: a.length, de: nd.length, p25: q(a, 0.25), mediana: q(a, 0.5), p75: q(a, 0.75) };
    }
    return res;
  }

  // Partidas do percurso principal que existem na maioria dos dias (horário "típico" tirado do rep20).
  function saidasTipicas(dias, linha, tipoDia) {
    const nd = dias.filter((d) => d.linha === linha && d.tipoDia === tipoDia), c = new Map();
    for (const d of nd) for (const m of new Set(d.trips.filter((t) => t.sentidoP).map((t) => t.ini))) c.set(m, (c.get(m) || 0) + 1);
    return [...c].filter(([, n]) => n >= nd.length * 0.4).map(([m]) => m).sort((a, b) => a - b);
  }

  // Compara o horário oficial com o que o rep20 diz que foi realizado (só dias a partir da data da versão do horário).
  function realizacao(dias, linha, tipoDia, saidas, desde) {
    const nd = dias.filter((d) => d.linha === linha && d.tipoDia === tipoDia && (!desde || d.data >= desde));
    if (!nd.length) return null;
    const por = new Map(saidas.map((m) => [m, 0]));
    for (const d of nd) for (const m of new Set(d.trips.filter((t) => t.sentidoP).map((t) => t.ini))) if (por.has(m)) por.set(m, por.get(m) + 1);
    const lista = [...por].map(([m, n]) => ({ m, pc: n / nd.length })).sort((a, b) => a.pc - b.pc);
    return { dias: nd.length, media: lista.reduce((t, x) => t + x.pc, 0) / lista.length, piores: lista.slice(0, 5), nunca: lista.filter((x) => x.pc === 0).length };
  }

  // Escala ideal de um período de reforço (sem atrasos): quem faz cada partida antes e depois, e se na saída
  // as viaturas normais estão livres a horas (senão o reforço acaba mal: há partidas que ficam sem viatura).
  function escala(saidas, cic, j) {
    const n = cic.viaturas, iv = cic.intervalo, ciclo = cic.ciclo, k = j.k || 1, dd = cic.dur || ciclo;
    const nomes = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
    const extras = Array.from({ length: k }, (_, i) => (k > 1 ? 'Extra ' + (i + 1) : 'Extra'));
    const S = [...saidas].sort((a, b) => a - b), i0 = S.findIndex((d) => d >= j.a);
    if (i0 < 0) return null;
    const lo = j.a - ciclo, hi = j.b + ciclo, add = (m, v, d) => (m.get(v) || m.set(v, []).get(v)).push(d);
    const antes = new Map(), depois = new Map(), avisos = [];
    S.forEach((d, i) => { if (d >= lo && d <= hi) add(antes, nomes[i % n], d); });
    const rot = [...extras, ...nomes.slice(i0 % n), ...nomes.slice(0, i0 % n)];
    const ultimo = new Map(nomes.map((v) => [v, -Infinity])); let idx = 0;
    S.forEach((d, i) => {
      let v;
      if (d < j.a) { v = nomes[i % n]; }
      else if (d + dd <= j.b) { v = rot[idx % rot.length]; idx++; }
      else {
        let melhor = null;
        for (const x of nomes) { const pronto = ultimo.get(x) + ciclo; if (melhor == null || pronto < melhor.pronto) melhor = { x, pronto }; }
        v = melhor.x; if (melhor.pronto > d && d <= hi) avisos.push({ m: d, atraso: melhor.pronto - d });
      }
      ultimo.set(v, d); if (d >= lo && d <= hi) add(depois, v, d);
    });
    return { antes, depois, avisos, ciclo, cicloNovo: (n + k) * iv, de: lo, ate: hi };
  }

  const api = { candidatos, saidasTipicas, realizacao, escala, inicios, ciclo, prepararDias, simular, metricas, backtest, planear, validarPlano, ganho, LIMIAR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sim = api;
})(typeof window !== 'undefined' ? window : globalThis);
