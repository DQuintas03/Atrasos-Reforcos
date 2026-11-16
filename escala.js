// Horário proposto: parte do horário oficial (PDF, linha a linha, paragem a paragem), numera as viaturas como
// no Excel da TUB (1, 2, 3, 4 pela ordem em que entram) e monta os dois cenários de reforço:
//   A  alargar e depois reforço: as voltas do período ganham tempo de percurso e a viatura de reforço (VR)
//      faz a partida que fica a descoberto, a seguir às voltas alargadas (como no exemplo do colega);
//   B  reforço e depois alargar: a VR faz a primeira partida do período e as voltas seguintes são alargadas.
// Em ambos: nenhuma partida muda de hora nem desaparece (nunca se retira frequência). O alargamento de cada volta
// é igual ao intervalo entre partidas, para que, quando a VR sai, cada viatura caia certa na partida seguinte.
(function (root) {
  const mediana = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
  const quantil = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  const primeiro = (t) => t.findIndex((x) => x != null);
  const ultimo = (t) => { for (let i = t.length - 1; i >= 0; i--) if (t[i] != null) return i; return -1; };

  // Base: classifica as linhas do horário e numera as viaturas.
  //   volta    começa na 1.ª coluna (ou entra a meio) e acaba na última: é feita por uma viatura da rotação
  //   parcial  não acaba na última coluna, ou tem só uma hora (ex. 6:15 até à Av. Liberdade, 8:20 a) b))
  function base(hor) {
    const nc = hor.paragens.length || (hor.linhas[0] ? hor.linhas[0].t.length : 0);
    const linhas = hor.linhas.map((l, i) => {
      const p = primeiro(l.t), u = ultimo(l.t), n = l.t.filter((x) => x != null).length;
      // viagens com nota (ex. a) b): só em período escolar) ficam fora da rotação, como no Excel
      const volta = u === nc - 1 && !l.nota && (p === 0 || n >= 3);
      return { i, t: l.t.slice(), nota: l.nota || '', tipo: volta ? 'volta' : 'parcial', ini: l.t[p], fim: l.t[u], entra: volta && p > 0 };
    });
    const voltas = linhas.filter((l) => l.tipo === 'volta').sort((a, b) => a.ini - b.ini);
    const livres = []; // { v, chega }
    let n = 0;
    for (const l of voltas) {
      let v = null;
      if (!l.entra) {
        livres.sort((a, b) => a.chega - b.chega);
        const k = livres.findIndex((x) => x.chega <= l.ini);
        if (k >= 0) v = livres.splice(k, 1)[0].v;
      }
      if (v == null) v = String(++n);
      l.viatura = v;
      livres.push({ v, chega: l.fim });
    }
    // fim de serviço de cada viatura (para não a usar depois de recolher)
    const ultimaSaida = {};
    for (const l of voltas) ultimaSaida[l.viatura] = l.ini;
    const gaps = voltas.filter((l) => !l.entra).map((l) => l.ini);
    const iv = mediana(gaps.slice(1).map((x, i) => x - gaps[i]).filter((g) => g > 0)) || 15;
    const ciclo = mediana(voltas.filter((l) => !l.entra).map((l) => l.fim - l.ini)) || 60;
    return { paragens: hor.paragens.slice(), linhas, viaturas: n, intervalo: iv, ciclo, ultimaSaida };
  }

  // Intervalo entre partidas à volta de uma hora (as linhas podem ter frequências diferentes ao longo do dia).
  function intervaloEm(b, m) {
    const s = b.linhas.filter((l) => l.tipo === 'volta' && !l.entra).map((l) => l.ini).sort((x, y) => x - y);
    const perto = s.filter((x) => Math.abs(x - m) <= 90);
    const g = perto.slice(1).map((x, i) => x - perto[i]).filter((x) => x > 0);
    return mediana(g) || b.intervalo;
  }

  // Coluna do ponto de viragem (fim da ida / início da volta): a paragem com o nome do destino da ida, ou a do meio.
  function colunaViragem(b, destinoIda) {
    const alvo = norm(destinoIda);
    const k = b.paragens.findIndex((p, i) => i > 0 && i < b.paragens.length - 1 && alvo && (norm(p).includes(alvo) || alvo.includes(norm(p))));
    return k > 0 ? k : Math.floor((b.paragens.length - 1) / 2);
  }

  // Coluna de partida da volta no ponto de viragem: alguns horários (ex. 87) têm o Hospital em duas colunas,
  // chegada (C.) e partida (P.); outros (ex. 74) numa só (C. P).
  function colunaPartidaVolta(b, kv) {
    const p = b.paragens;
    return kv + 1 < p.length - 1 && norm(p[kv + 1]) === norm(p[kv]) ? kv + 1 : kv;
  }

  // Alargamento e (min) de uma volta: vai todo para a chegada final, para a viatura chegar a tempo ao início da
  // circulação seguinte; as horas intermédias ficam como no horário atual (decisão da chefia, 16/11/2026).
  function repartir(t, e) {
    const acc = t.map((x) => (x == null ? null : 0));
    const u = ultimo(t);
    if (u > primeiro(t)) acc[u] = e;
    return { acc };
  }

  // Atraso observado de uma partida (lista do diagnóstico): valores por dia, com os dias a horas a contar como 0.
  function atrasosDe(o) {
    if (!o) return null;
    const v = (o.atrasos || []).slice();
    for (let i = v.length; i < o.n; i++) v.push(0);
    return v;
  }

  // Colunas do ponto de viragem: kv = chegada (C.), kp = partida da volta (P.). Na 87 são duas colunas (Hospital
  // C. e P.); na 74 é uma só (C. P), porque o Hospital é paragem de passagem e não terminal.
  function colunas(b, perfil) {
    const S = perfil && perfil.sentidos ? perfil.sentidos : {};
    const destinoIda = S.Ida ? S.Ida.par.split('>')[1] : '';
    const kv = colunaViragem(b, destinoIda), kp = colunaPartidaVolta(b, kv);
    // o ponto de viragem é terminal quando o horário tem chegada e partida separadas (87) ou quando, nos dados, as
    // viagens acabam e recomeçam aí (ida termina onde a volta começa, ex. Bom Jesus na linha 2, Hospital na 74)
    const volta = S.Volta ? S.Volta.par.split('>')[0] : '';
    const nosDados = !!(S.Ida && S.Volta && norm(destinoIda) && norm(destinoIda) === norm(volta));
    return { kv, kp, doisTerminais: kp > kv || nosDados };
  }

  // Simula um cenário por meias-voltas: cada volta da rotação é uma ida (terminal 1 → ponto de viragem) e uma volta
  // (ponto de viragem → terminal 1). Assim a VR pode entrar e recolher em qualquer dos dois terminais.
  // jan: [{a, b, lado, vr}]  a <= partida da ida < b são as voltas do período;
  //   lado 'ida'   → a VR começa no terminal das idas e os +intervalo vão para a chegada final (publicado, a amarelo);
  //   lado 'volta' → a VR começa no ponto de viragem e as viaturas ganham a folga aí (as horas publicadas não mudam);
  //   vr = hora de partida (no terminal do lado) em que a VR entra; sem vr, entra na primeira partida sem viatura.
  function cenario(b, jan, modo, perfil) {
    const S = perfil && perfil.sentidos ? perfil.sentidos : {};
    const porIda = new Map(((S.Ida && S.Ida.lista) || []).map((o) => [o.m, o]));
    const porVolta = new Map(((S.Volta && S.Volta.lista) || []).map((o) => [o.m, o]));
    const { kv, kp, doisTerminais } = colunas(b, perfil);
    const ladoDe = (j) => (j && j.lado === 'volta' && doisTerminais ? 'volta' : 'ida');
    const janelaDe = (l) => (l.tipo === 'volta' && !l.entra ? jan.find((j) => l.ini >= j.a && l.ini < j.b) : null);
    const linhas = b.linhas.map((l) => ({ ...l, base: l.t, t: l.t.slice(), alt: l.t.map(() => false), viaturaBase: l.viatura, estica: 0 }));
    // 1. voltas do período: +intervalo na chegada final (lado ida) ou folga no ponto de viragem (lado volta)
    for (const l of linhas) {
      const j = janelaDe(l);
      if (!j) continue;
      const e = intervaloEm(b, l.ini);
      l.estica = e; l.ladoEstica = ladoDe(j);
      if (l.ladoEstica === 'ida') {
        const r = repartir(l.base, e);
        l.t = l.base.map((x, c) => (x == null ? null : x + (r.acc[c] || 0)));
        l.alt = l.base.map((x, c) => x != null && (r.acc[c] || 0) !== 0);
      }
      l.fim = l.t[ultimo(l.t)];
    }
    // 2. meias-voltas, por ordem de partida
    const meias = [];
    for (const l of linhas) {
      if (l.tipo !== 'volta') continue;
      const p0 = primeiro(l.t), u = ultimo(l.t);
      if (p0 < kv && l.t[kv] != null) meias.push({ l, key: l.i + 'i', lado: 'ida', term: 0, dep: l.t[p0], depBase: l.base[p0], arr: l.t[kv] + (l.ladoEstica === 'volta' ? l.estica : 0), fresca: !!l.entra });
      if (l.t[kp] != null && p0 <= kp) meias.push({ l, key: l.i + 'v', lado: 'volta', term: 1, dep: l.t[kp], depBase: l.base[kp], arr: l.t[u], fresca: !!l.entra && p0 >= kv });
    }
    meias.sort((x, y) => x.dep - y.dep || x.term - y.term);
    // VR forçada: a meia-volta do lado escolhido que parte à hora j.vr
    const forca = new Map();
    for (const j of jan) {
      const lado = ladoDe(j);
      let m = null;
      if (j.vr != null) m = meias.find((x) => x.lado === lado && x.dep === j.vr && !x.fresca);
      else if (modo === 'B') m = meias.find((x) => x.lado === 'ida' && x.l.ini >= j.a && x.l.ini < j.b);
      if (m) forca.set(m.key, j);
    }
    // a VR só pode entrar sozinha (sem hora escolhida) no terminal do lado do período, perto do período
    const entradaLivre = (m) => jan.some((j) => j.vr == null && ladoDe(j) === m.lado && m.dep >= j.a - b.ciclo && m.dep <= j.b + 2 * b.ciclo);
    const termInicio = new Map();
    for (const m of meias.slice().sort((x, y) => x.depBase - y.depBase)) if (!termInicio.has(m.l.viaturaBase)) termInicio.set(m.l.viaturaBase, m.term);
    const est = new Map(); // viatura normal -> { term, livre }
    const vista = new Set();
    let vrE = null; // { term, livre } enquanto a VR anda
    const vr = [], buracos = [];
    for (const m of meias) {
      // ponto de viragem que não é terminal (paragem de passagem): a volta segue com a viatura da ida
      if (!doisTerminais && m.lado === 'volta' && m.l.vIda != null && m.l.vIda !== '?') {
        const v0 = m.l.vIda;
        if (v0 === 'VR') { vr.push(m); vrE = { term: 0, livre: m.arr }; } else { est.set(v0, { term: 0, livre: m.arr }); vista.add(v0); }
        m.v = v0; m.l.vVolta = v0; continue;
      }
      let v = null;
      const forcada = forca.has(m.key);
      if (!forcada) {
        if (m.fresca) v = m.l.viaturaBase;
        else {
          let melhor = null;
          for (const [x, s] of est) {
            if (s.term !== m.term || s.livre > m.dep || m.dep > b.ultimaSaida[x] + b.ciclo + b.intervalo) continue;
            // a que chegou primeiro; em empate, a que saiu antes (mantém a ordem das viaturas) e depois a do horário atual
            if (!melhor || s.livre < melhor.h || (s.livre === melhor.h && ((s.ord || 0) < melhor.o || ((s.ord || 0) === melhor.o && x === m.l.viaturaBase)))) melhor = { x, h: s.livre, o: s.ord || 0 };
          }
          if (melhor) v = melhor.x;
          // viatura que entra ao serviço: só no terminal onde começa no horário atual (não aparece a meio da linha)
          else if (!vista.has(m.l.viaturaBase) && m.l.viaturaBase && m.term === termInicio.get(m.l.viaturaBase)) v = m.l.viaturaBase;
        }
      }
      if (v == null) {
        const continua = vrE && vrE.term === m.term && vrE.livre <= m.dep && m.dep - vrE.livre <= 2 * b.intervalo;
        const ocupada = vrE && vrE.livre > m.dep;
        if (!ocupada && (continua || forcada || entradaLivre(m))) { v = 'VR'; vr.push(m); vrE = { term: 1 - m.term, livre: m.arr }; }
        else { buracos.push(m.l); m.v = '?'; if (m.lado === 'ida') m.l.vIda = '?'; else m.l.vVolta = '?'; continue; }
      } else { est.set(v, { term: 1 - m.term, livre: m.arr, ord: m.dep }); vista.add(v); }
      m.v = v;
      if (m.lado === 'ida') m.l.vIda = v; else m.l.vVolta = v;
    }
    const voltas = linhas.filter((l) => l.tipo === 'volta').sort((x, y) => x.ini - y.ini);
    for (const l of voltas) {
      l.viatura = l.vIda != null ? l.vIda : l.vVolta;
      l.mIda = l.vIda != null && l.vIda !== l.viaturaBase;
      l.mVolta = l.vVolta != null && l.vVolta !== l.viaturaBase;
      l.mudou = l.mIda || l.mVolta;
    }
    // 2b. horário a publicar, uma linha por viatura (como o exemplo do colega na 87): a ida de cada viatura e a volta
    //     que ESSA viatura faz a seguir. Com a VR a começar no ponto de viragem, os +intervalo vão para a chegada da ida
    //     (tempo de percurso publicado, a amarelo); a VR fica com linhas próprias (só volta à entrada, só ida à saída).
    const nc = b.paragens.length || (linhas[0] ? linhas[0].t.length : 0);
    const porViatura = new Map();
    for (const m of meias) if (m.v != null && m.v !== '?') { if (!porViatura.has(m.v)) porViatura.set(m.v, []); porViatura.get(m.v).push(m); }
    const usada = new Set(), porLinha = [];
    const linhaVista = (ida, vol) => {
      const t = new Array(nc).fill(null), r = (ida || vol).l;
      if (ida) {
        const p0 = primeiro(ida.l.t);
        for (let k = p0; k <= kv; k++) t[k] = ida.l.t[k];
        t[kv] = ida.arr; // chegada ao ponto de viragem (com o tempo a mais, se for o caso)
      }
      if (vol) { const u = ultimo(vol.l.t); for (let k = kp; k <= u; k++) t[k] = vol.l.t[k]; }
      const base = ida ? ida.l.base : null;
      const v = (ida || vol).v;
      const alt = t.map((x, k) => !!(ida && base && x != null && k > 0 && x !== base[k]));
      return { i: r.i, tipo: 'volta', t, base: t, alt, nota: ida ? ida.l.nota : '', viatura: v, vIda: ida ? v : null, vVolta: vol ? v : null,
        viaturaBase: r.viaturaBase, mIda: !!(ida && v !== ida.l.viaturaBase), mVolta: !!(vol && v !== vol.l.viaturaBase),
        estica: ida ? ida.l.estica : 0, ladoEstica: ida ? ida.l.ladoEstica : null, entra: !ida,
        ordem: ida ? ida.dep : vol.dep - (vol.l.base[kp] - vol.l.base[primeiro(vol.l.base)]) - 0.5 };
    };
    for (const m of meias) {
      if (m.lado !== 'ida' || m.v == null || m.v === '?') continue;
      const seq = porViatura.get(m.v), k = seq.indexOf(m), n = seq[k + 1];
      const vol = n && n.lado === 'volta' && !usada.has(n.key) ? n : null;
      if (vol) usada.add(vol.key);
      porLinha.push(linhaVista(m, vol));
    }
    for (const m of meias) if (m.lado === 'volta' && m.v != null && m.v !== '?' && !usada.has(m.key)) porLinha.push(linhaVista(null, m));
    for (const l of linhas) if (l.tipo !== 'volta') porLinha.push({ ...l, ordem: l.t[primeiro(l.t)] });
    porLinha.sort((x, y) => x.ordem - y.ordem);
    // na vista, as voltas do lado 'volta' mostram a chegada da ida mais tarde (publicada)
    for (const l of linhas) if (l.ladoEstica === 'volta') { l.alt = l.alt.map(() => false); l.alt[kv] = true; }

    // 3. estadias da VR: viagens seguidas (com espera curta) contam como uma só entrada; recolhe onde chega
    const estadias = [];
    for (const m of vr) {
      const e = estadias[estadias.length - 1];
      if (e && e.saiEm === m.term && m.dep - e.sai <= 2 * b.intervalo) { e.sai = m.arr; e.saiEm = 1 - m.term; e.viagens++; e.partidas.push(m.dep); }
      else estadias.push({ entra: m.dep, entraEm: m.term, sai: m.arr, saiEm: 1 - m.term, viagens: 1, partidas: [m.dep] });
    }
    estadias.forEach((e) => { e.voltas = e.viagens / 2; });
    // 4. avaliação, nos dois terminais: cada partida sai com mais de 10 min de atraso?
    //    Hoje: o atraso observado. Proposto: a viatura chega com o atraso que hoje se vê na partida que fazia a seguir
    //    no horário atual, menos o tempo a mais que ganhou; a VR (ou uma viatura que entra fresca) sai a horas.
    //    Estimativa direta sobre a distribuição observada, sem simular a propagação.
    const LIM = 10, dias = (perfil && perfil.dias) || 1;
    const obs = (m) => atrasosDe(m.lado === 'ida' ? porIda.get(m.depBase) : porVolta.get(m.depBase)) || [];
    const seguinteBase = new Map(), temAnteriorBase = new Set();
    {
      const ord = meias.slice().sort((x, y) => x.depBase - y.depBase || x.term - y.term), ult = new Map();
      for (const m of ord) { const p = ult.get(m.l.viaturaBase); if (p && !m.fresca) { seguinteBase.set(p.key, m); temAnteriorBase.add(m.key); } ult.set(m.l.viaturaBase, m); }
    }
    let antes = 0, depois = 0, prot = 0;
    const porPartida = [], anterior = new Map();
    for (const m of meias) {
      if (m.v == null || m.v === '?') continue;
      const P = anterior.get(m.v);
      anterior.set(m.v, m);
      if (m.fresca) continue;
      const hoje = obs(m);
      let prop = null;
      if (P && seguinteBase.has(P.key)) {
        const nb = seguinteBase.get(P.key), g = m.dep - nb.depBase;
        if (nb.key !== m.key || g) prop = obs(nb).map((x) => x - g);
        if (m.lado === 'ida') m.l.ganho = g;
      } else if (!P && temAnteriorBase.has(m.key)) prop = hoje.map(() => 0);
      if (prop) prot++;
      const a0 = hoje.filter((x) => x > LIM).length, d0 = (prop || hoje).filter((x) => x > LIM).length;
      antes += a0; depois += d0;
      porPartida.push({ m: m.dep, term: m.term, antes: a0 / dias, depois: d0 / dias, viatura: m.v });
    }
    const horasVR = estadias.reduce((t, e) => t + (e.sai - e.entra), 0) / 60;
    const alargadas = voltas.filter((l) => l.estica).length;
    return { modo, linhas, vista: porLinha, voltas, meias, estadias, horasVR, viagensVR: vr.length, voltasVR: vr.length / 2, buracos, alargadas, protegidas: prot, kv, kp, porPartida,
      avaliacao: { antes: antes / dias, depois: depois / dias, absorvidas: (antes - depois) / dias, totalAntes: antes, totalDepois: depois, dias } };
  }

  const partidasDe = (b) => b.linhas.filter((l) => l.tipo === 'volta' && !l.entra).map((l) => l.ini).sort((x, y) => x - y);
  // partidas de um terminal: 'ida' = 1.ª coluna; 'volta' = partida no ponto de viragem
  function partidasLado(b, perfil, lado) {
    const { kp } = colunas(b, perfil);
    const vs = b.linhas.filter((l) => l.tipo === 'volta' && !l.entra).map((l) => (lado === 'volta' ? l.t[kp] : l.ini)).filter((x) => x != null);
    return [...new Set(vs)].sort((x, y) => x - y);
  }

  // Estadias da VR que pertencem ao período j.
  function estadiasDoPeriodo(c, b, j) {
    const F = partidasDe(b).find((m) => m >= j.a && m < j.b);
    if (F == null) return [];
    return c.estadias.filter((e) => e.entra >= F - b.ciclo && e.entra <= F + b.ciclo + 2 * b.intervalo);
  }

  const resumoVR = (est) => ({
    entra: est.length ? est[0].entra : null, entraEm: est.length ? est[0].entraEm : null,
    sai: est.length ? Math.max(...est.map((e) => e.sai)) : null, saiEm: est.length ? est[est.length - 1].saiEm : null,
    viagens: est.reduce((t, e) => t + e.viagens, 0), voltas: est.reduce((t, e) => t + e.viagens, 0) / 2,
    horas: est.reduce((t, e) => t + e.sai - e.entra, 0) / 60,
  });

  // Todas as entradas possíveis da VR no período i, nos dois terminais (o da volta só onde há dois terminais).
  function hipoteses(b, jan, i, perfil) {
    const j = jan[i], F = partidasDe(b).find((m) => m >= j.a && m < j.b);
    if (F == null) return [];
    const lados = colunas(b, perfil).doisTerminais ? ['ida', 'volta'] : ['ida'];
    const out = [];
    for (const lado of lados) {
      // da 1.ª volta do período (nesse terminal) até à 1.ª partida que ficaria sem viatura
      const l0 = b.linhas.find((l) => l.tipo === 'volta' && !l.entra && l.ini === F), Fs = lado === 'volta' ? l0.t[colunas(b, perfil).kp] : F;
      for (const d of partidasLado(b, perfil, lado).filter((m) => m >= Fs && m <= Fs + b.ciclo + b.intervalo)) {
        const jj = jan.map((x, k) => (k === i ? { ...x, lado, vr: d } : x));
        const c = cenario(b, jj, 'P', perfil);
        if (c.buracos.length) continue;
        const r = resumoVR(estadiasDoPeriodo(c, b, jj[i]));
        if (r.entra !== d || r.entraEm !== (lado === 'volta' ? 1 : 0)) continue;
        out.push({ lado, ...r, antes: c.avaliacao.antes, depois: c.avaliacao.depois });
      }
    }
    return out.sort((x, y) => x.entra - y.entra || x.entraEm - y.entraEm);
  }

  // Sugestão: a entrada (terminal e hora) com menos partidas atrasadas; em empate (±0,05/dia), a de menos horas de VR.
  function sugerir(hs) {
    if (!hs.length) return null;
    const min = Math.min(...hs.map((h) => h.depois));
    return hs.filter((h) => h.depois <= min + 0.05).sort((x, y) => x.horas - y.horas || x.depois - y.depois)[0];
  }

  // Saídas possíveis da VR no período i, com a entrada escolhida: cada uma corresponde a uma última volta diferente;
  // a VR pode recolher em qualquer dos terminais. Devolve [{sai, saiEm, b}] por ordem.
  function saidas(b, jan, i, perfil) {
    const j = jan[i], ps = partidasDe(b), F = ps.find((m) => m >= j.a && m < j.b);
    if (F == null) return [];
    const prox = jan.filter((x, k) => k !== i && x.a > j.a).map((x) => x.a);
    const lim = Math.min(F + 6 * 60, ...prox.map((a) => a - b.ciclo - b.intervalo));
    const vistas = new Map();
    for (const L of ps.filter((m) => m >= F && m <= lim)) {
      const jj = jan.map((x, k) => (k === i ? { ...x, b: L + 1 } : x));
      const c = cenario(b, jj, 'P', perfil);
      if (c.buracos.length) continue;
      const r = resumoVR(estadiasDoPeriodo(c, b, jj[i]));
      if (r.sai == null || (j.vr != null && r.entra !== j.vr)) continue;
      const k = r.sai + '|' + r.saiEm;
      if (!vistas.has(k)) vistas.set(k, { sai: r.sai, saiEm: r.saiEm, b: L + 1 });
    }
    return [...vistas.values()].sort((x, y) => x.sai - y.sai || x.saiEm - y.saiEm);
  }

  // Horário mínimo a partir dos dados, quando não há PDF: partida, ponto de viragem e chegada.
  function deDados(perfil, nomeParagem) {
    const S = perfil.sentidos, ida = S.Ida || Object.values(S)[0];
    const [o, d] = ida.par.split('>');
    const dIda = perfil.durIda || 30;
    const dVolta = S.Volta ? dIda : dIda; // sem PDF assume-se tempo igual nos dois sentidos
    const linhas = ida.lista.map((x) => ({ t: [x.m, x.m + dIda, x.m + dIda + dVolta], nota: '' }));
    return { paragens: [nomeParagem(o), nomeParagem(d), nomeParagem(o)], linhas, deDados: true };
  }

  const api = { base, cenario, deDados, repartir, intervaloEm, colunaViragem, colunaPartidaVolta, colunas, hipoteses, sugerir, saidas, estadiasDoPeriodo, resumoVR, partidasDe, partidasLado };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Escala = api;
})(typeof window !== 'undefined' ? window : globalThis);
