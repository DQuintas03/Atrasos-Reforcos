/* Relatório em Excel: um fio condutor do problema à solução, com gráficos nativos e pronto a imprimir em A4.
   Resumo → 1 Atrasos (por hora) → 2 Partidas → 3 Zonas críticas → 4 Proposta e simulação → 5 Horário proposto →
   6 Horário atual → Dados (todas as viagens, com filtros). */
const COR = { navy: '07506A', ida: '16A5C6', volta: '7C6FD6', red: 'EF3F36', ambar: 'F2A413', cinza: '6B8292', cab: 'DDEBF7', claro: 'F3F7F9', verde: '00804A' };

function exportarRelatorio(M) {
  const hoje = new Date(), hojeTxt = hoje.toLocaleDateString('pt-PT');
  const dataPt = (s) => s.split('-').reverse().join('/');
  const r1 = (x) => Math.round(x * 10) / 10;
  const rodape = `Linha ${S.linha} · atrasos e reforço · ${hojeTxt}`;
  const cab = (t) => ({ v: t, negrito: true, fundo: COR.cab, borda: true, quebra: true });
  const cel = (v, o = {}) => ({ v, borda: true, ...o });
  const titulo = (t) => [{ v: t, negrito: true, tam: 16, cor: COR.navy }];
  const seccao = (t) => [{ v: t, negrito: true, tam: 12.5, cor: COR.navy }];
  // parágrafo numa célula juntada de A até à última coluna, com altura calculada pelo comprimento do texto
  const paragrafo = (F, t, o = {}) => {
    const r = F.linhas.length, ncol = F.colunas.length, larg = F.colunas.reduce((s, w) => s + w, 0);
    F.linhas.push([{ v: t, quebra: true, ...o }]);
    F.juntar.push(`A${r + 1}:${Excel.letra(ncol - 1)}${r + 1}`);
    F.alturas[r] = Math.max(16, Math.ceil(String(t).length / (larg * 1.05)) * 15 + 3);
  };
  const nova = (nome, colunas, paisagem) => ({ nome, colunas, linhas: [], juntar: [], alturas: {}, graficos: [], semGrelha: true, rodape, imprimir: { paisagem } });
  const SS = perfil.sentidos, ks = Object.keys(SS).filter((k) => k !== '?'), ks2 = ks.length ? ks : Object.keys(SS);
  const nomeS = (k) => NOMES_S[k] || k;
  const corS = (k) => (k === 'Volta' ? COR.volta : COR.ida);
  const c = M.P, ev = c.avaliacao;
  const todas = Object.values(SS).flatMap((s) => s.lista);
  const atrasadas = todas.reduce((t, o) => t + o.atrasadas, 0), total = todas.reduce((t, o) => t + o.n, 0);
  const picoTxt = perfil.picos.map((p) => `${H(p.ini)}–${H(p.fim)}`).join(' e ');

  /* ---------- Resumo ---------- */
  const R = nova('Resumo', [46, 13, 13, 13, 13], false);
  R.linhas.push(titulo(`Linha ${S.linha} · atrasos e proposta de reforço`));
  R.linhas.push([{ v: `Dias úteis de ${dataPt(perfil.de)} a ${dataPt(perfil.ate)} (${perfil.dias} dias)${M.hor && M.hor.versao ? ` · horário ${M.hor.versao}` : ''} · gerado em ${hojeTxt}`, cor: COR.cinza }]);
  R.linhas.push([]);
  R.linhas.push(seccao('1. O que se passa'));
  paragrafo(R, `${picoTxt ? `Os atrasos concentram-se em ${picoTxt} (${pc(perfil.picos.reduce((t, p) => t + p.parte, 0))} das viagens atrasadas). ` : ''}${anat ? `Em média há ${d1(anat.porDia)} cascatas por dia: a mesma viatura chega atrasada (mais de 10 min) em 2 ou mais viagens seguidas e o atraso cresce. ${pc(anat.propaga)} dos atrasos vêm da viagem anterior da mesma viatura.` : ''}`);
  R.linhas.push([]);
  R.linhas.push([cab('Indicador'), cab('Valor')]);
  R.linhas.push([cel('Viagens com mais de 10 min de atraso'), cel(atrasadas / Math.max(1, total), { pct: true, negrito: true })]);
  if (anat) {
    R.linhas.push([cel('Cascatas por dia'), cel(r1(anat.porDia), { d1: true, negrito: true })]);
    R.linhas.push([cel('Atrasos que vêm da viagem anterior'), cel(anat.propaga, { pct: true, negrito: true })]);
    R.linhas.push([cel('Atraso no pico de uma cascata típica (min)'), cel(Math.round(anat.atrasoPico || 0), { negrito: true })]);
  }
  if (cic && !cic.unica) R.linhas.push([cel('Ciclo da linha'), cel(`${cic.ciclo} min · ${cic.viaturas} viaturas · de ${cic.intervalo} em ${cic.intervalo} min`)]);
  R.linhas.push([]);
  R.linhas.push(seccao('2. Onde nascem as cascatas'));
  if (perfil.zonas.length) perfil.zonas.forEach((z, i) => { const p = partesZona(z, i); paragrafo(R, `• ${faixa(z.hIni, z.hFim)} (${nomeS(z.sentido).toLowerCase()}, ${nP(z.origem)} → ${nP(z.destino)}): ${p.titulo.charAt(0).toLowerCase() + p.titulo.slice(1)}. ${p.consequencia}`); });
  else paragrafo(R, 'Nenhuma partida se destaca da média.');
  R.linhas.push([]);
  R.linhas.push(seccao('3. O que se propõe'));
  if (M.jan.length) {
    paragrafo(R, `Nenhuma partida muda de hora nem desaparece. Nas voltas de cada período as viaturas ganham ${M.b.intervalo} min (o intervalo entre partidas): se a VR começa no terminal das idas, esse tempo vai para a chegada final; se começa no outro terminal, vai para a ida (chegada a esse terminal mais tarde) e cada viatura faz a volta seguinte. As horas alteradas aparecem a amarelo. A viatura de reforço (VR) cobre a partida que ficaria sem viatura e, quando sai, cada viatura encaixa na partida seguinte.`);
    M.jan.forEach((j, i) => {
      const v = M.vrs[i], vs = partidas(M.b).filter((m) => m >= j.a && m < j.b);
      paragrafo(R, `• Período ${i + 1}: alargar as voltas que saem entre as ${Hc(vs[0])} e as ${Hc(vs[vs.length - 1])}; a VR entra em ${M.terms[v.entraEm] || '—'} às ${v.entra != null ? Hc(v.entra) : '—'} e recolhe em ${M.terms[v.saiEm] || '—'} às ${v.sai != null ? Hc(v.sai) : '—'} (${descVR(M, v)}, ${d1(v.horas)} h)${j.lado === 'volta' ? `; a ida passa a demorar mais ${M.b.intervalo} min até ${M.terms[1]}` : ''}.`);
    });
  } else paragrafo(R, 'Ainda não há períodos de reforço escolhidos.');
  R.linhas.push([]);
  R.linhas.push(seccao('4. Resultado esperado'));
  R.linhas.push([cab('Partidas (nos dois terminais) com mais de 10 min de atraso, por dia'), cab('Hoje'), cab('Com reforço'), cab('Diferença')]);
  R.linhas.push([cel('Dia inteiro'), cel(r1(ev.antes), { d1: true }), cel(r1(ev.depois), { d1: true, negrito: true, cor: COR.verde }), cel(ev.antes ? (ev.depois - ev.antes) / ev.antes : 0, { pct: true })]);
  R.linhas.push([cel('Horas de viatura + motorista de reforço por dia'), cel(r1(c.horasVR), { d1: true }), cel(''), cel('')]);
  R.alturas[R.linhas.length - 3] = 32;
  paragrafo(R, 'Estimativa direta: cada viatura chega com o atraso que hoje se observa, menos o tempo a mais que ganhou na volta anterior; a VR entra a horas. Não simula a propagação do atraso ao resto do dia.', { cor: COR.cinza });
  R.linhas.push([]);
  R.linhas.push(seccao('Como ler este relatório'));
  ['1 Atrasos — quantas viagens atrasam, por hora e sentido', '2 Partidas — cada partida do dia: dias com atraso e onde nascem cascatas', '3 Zonas críticas — onde o reforço deve atuar e porquê', '4 Proposta e simulação — períodos, entrada/saída da VR e efeito esperado', '5 e 6 — horário proposto e horário atual, no formato do horário da TUB', 'Dados — todas as viagens analisadas, com filtros'].forEach((t) => R.linhas.push([{ v: t }]));

  /* ---------- 1 Atrasos ---------- */
  const A = nova('1 Atrasos', [8, 10, 11, 10, 10, 11, 10, 11], true);
  A.linhas.push(titulo('1. Atrasos por hora e sentido'));
  paragrafo(A, `Viagens que chegaram com mais de 10 min de atraso, somando os ${perfil.dias} dias úteis, pela hora de partida.${picoTxt ? ` Horas com mais atrasos: ${picoTxt}.` : ''}`);
  const g = perfil.grelha, horas = [...new Set(ks2.flatMap((k) => Object.keys(g[k] || {}).map(Number)))].sort((a, b) => a - b);
  const casH = {}; for (const k of ks2) for (const o of SS[k].lista) { const h = Math.floor(o.m / 60); casH[h] = (casH[h] || 0) + o.inicios; }
  const ia = A.linhas.length;
  A.linhas.push([cab('Hora'), ...ks2.flatMap((k) => [cab(`${nomeS(k)}: viagens`), cab(`${nomeS(k)}: atrasadas`), cab(`${nomeS(k)}: %`)]), cab('Cascatas começam')]);
  A.alturas[ia] = 32;
  const r0 = A.linhas.length;
  for (const h of horas) {
    A.linhas.push([cel(String(h).padStart(2, '0') + 'h', { centro: true }), ...ks2.flatMap((k) => { const o = (g[k] || {})[h]; return [cel(o ? o.n : 0), cel(o ? o.atrasadas : 0, { negrito: true }), cel(o && o.n ? o.atrasadas / o.n : 0, { pct: true })]; }), cel(casH[h] || 0)]);
  }
  const rF = A.linhas.length - 1;
  A.colunas.length = Math.max(A.colunas.length, 2 + ks2.length * 3);
  // mapa de calor (como no ecrã): horas em colunas, sentidos em linhas
  A.linhas.push([]);
  A.linhas.push(seccao('Mapa de calor: viagens atrasadas por hora'));
  const mx = Math.max(1, ...ks2.flatMap((k) => horas.map((h) => ((g[k] || {})[h] || {}).atrasadas || 0)));
  const corCalor = (v) => {
    const t = Math.pow(v / mx, 0.85), P = [255, 245, 240], Q = [252, 146, 114], Z = [103, 0, 13];
    const mix = (p, q, f) => p.map((x, i) => Math.round(x + (q[i] - x) * f));
    const rgb = t < 0.5 ? mix(P, Q, t / 0.5) : mix(Q, Z, (t - 0.5) / 0.5);
    return { fundo: rgb.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(), cor: t > 0.55 ? 'FFFFFF' : '3A1D1A' };
  };
  // o mapa ocupa as colunas A.. (uma por hora); para caber, vai em duas metades
  const meio = Math.ceil(horas.length / 2);
  [horas.slice(0, meio), horas.slice(meio)].forEach((hs) => {
    A.linhas.push([cel(''), ...hs.map((h) => cel(String(h).padStart(2, '0') + 'h', { negrito: true, centro: true, fundo: COR.claro }))]);
    for (const k of ks2) A.linhas.push([cel(nomeS(k), { negrito: true }), ...hs.map((h) => { const v = ((g[k] || {})[h] || {}).atrasadas || 0; return cel(v, { centro: true, negrito: true, ...corCalor(v) }); })]);
  });
  A.colunas.length = Math.max(A.colunas.length, meio + 1);
  for (let i = 0; i < A.colunas.length; i++) if (A.colunas[i] == null) A.colunas[i] = 8;
  // gráficos por baixo do mapa, na largura da tabela, a começar numa página nova
  const ga = A.linhas.length + 1, nc = A.colunas.length;
  A.imprimir.quebras = [ga];
  A.graficos.push({ tipo: 'coluna', titulo: 'Viagens atrasadas (>10 min) por hora', eixoY: 'viagens (soma dos dias)', cat: { c: 0, r0, r1: rF }, series: ks2.map((k, i) => ({ c: 2 + i * 3, nome: nomeS(k), cor: corS(k) })), pos: { c0: 0, r0: ga, c1: nc, r1: ga + 15 } });
  A.graficos.push({ tipo: 'linha', titulo: '% das viagens atrasadas, por hora', pct: true, cat: { c: 0, r0, r1: rF }, series: ks2.map((k, i) => ({ c: 3 + i * 3, nome: nomeS(k), cor: corS(k) })), pos: { c0: 0, r0: ga + 16, c1: nc, r1: ga + 31 } });

  /* ---------- 2 Partidas ---------- */
  const P2 = nova('2 Partidas', [9, 8, 34, 8, 10, 10, 12, 11, 12, 9], true);
  P2.linhas.push(titulo('2. Cada partida do dia'));
  paragrafo(P2, 'Em quantos dias cada partida chegou com mais de 10 min de atraso e em quantos é aí que nasce uma cascata. As partidas críticas são as que o reforço deve proteger. Os gráficos estão por cima; a tabela completa, por baixo.');
  const blocos = [];
  const linhaTab0 = 3 + 15 * ks2.length + 1; // a tabela começa depois dos gráficos
  while (P2.linhas.length < linhaTab0) P2.linhas.push([]);
  P2.linhas.push([cab('Partida'), cab('Sentido'), cab('Percurso'), cab('Dias'), cab('Dias com atraso'), cab('% dias com atraso'), cab('Atraso típico (min)'), cab('Cascatas nascidas'), cab('% dias em que nasce cascata'), cab('Crítica')]);
  P2.alturas[P2.linhas.length - 1] = 46;
  P2.imprimir.titulos = [P2.linhas.length, P2.linhas.length];
  for (const k of ks2) {
    const s = SS[k], b0 = P2.linhas.length;
    for (const o of s.lista) P2.linhas.push([cel(H(o.m), { centro: true }), cel(nomeS(k)), cel(trajeto(s.par)), cel(o.n), cel(o.atrasadas), cel(o.pAtraso, { pct: true }), cel(o.atrasadas ? Math.round(o.atrasoTipico) : ''), cel(o.inicios), cel(o.pInicio, { pct: true }), cel(o.critica ? 'CRÍTICA' : '', o.critica ? { negrito: true, cor: 'FFFFFF', fundo: COR.red, centro: true } : {})]);
    blocos.push({ k, r0: b0, r1: P2.linhas.length - 1 });
  }
  blocos.forEach((b, i) => P2.graficos.push({ tipo: 'coluna', titulo: `${nomeS(b.k)} · ${trajeto(SS[b.k].par)}: % de dias com atraso e com início de cascata`, pct: true, cat: { c: 0, r0: b.r0, r1: b.r1 }, series: [{ c: 5, nome: '% dias com atraso', cor: corS(b.k) }, { c: 8, nome: '% dias em que nasce cascata', cor: COR.red }], pos: { c0: 0, r0: 3 + i * 15, c1: 10, r1: 3 + i * 15 + 14 } }));
  P2.imprimir.quebras = [linhaTab0];

  /* ---------- 3 Zonas críticas ---------- */
  const Z = nova('3 Zonas críticas', [17, 8, 30, 32, 9, 10, 9, 10, 46], true);
  Z.linhas.push(titulo('3. Zonas críticas: onde as cascatas nascem'));
  paragrafo(Z, 'Partidas seguidas onde as cascatas nascem muito mais vezes do que no resto do dia. É aqui que o reforço deve atuar.');
  if (perfil.zonas.length) {
    Z.linhas.push([cab('Horas'), cab('Sentido'), cab('Percurso'), cab('Tipo de problema'), cab('Dias'), cab('Cascatas'), cab('% de todas'), cab('Atraso até (min)'), cab('O que acontece')]);
    Z.alturas[Z.linhas.length - 1] = 32;
    const z0 = Z.linhas.length;
    perfil.zonas.forEach((z, i) => {
      const p = partesZona(z, i);
      const t = { quebra: true };
      Z.linhas.push([cel(`${faixa(z.hIni, z.hFim)} ${nomeS(z.sentido)}`, { negrito: true, cor: COR.red, ...t }), cel(nomeS(z.sentido), t), cel(`${nP(z.origem)} → ${nP(z.destino)}`, t), cel(p.titulo, { negrito: true, ...t }), cel(`${z.dias} de ${perfil.dias}`, t), cel(z.inicios, t), cel(z.parte, { pct: true, ...t }), cel(Math.round(z.atrasoPico || 0), t), cel(`${p.consequencia} ${p.partidas}.`, t)]);
      Z.alturas[Z.linhas.length - 1] = Math.max(32, Math.ceil((p.consequencia.length + p.partidas.length) / 48) * 15 + 4);
    });
    Z.graficos.push({ tipo: 'barra', titulo: 'Cascatas nascidas em cada zona crítica', cat: { c: 0, r0: z0, r1: Z.linhas.length - 1 }, series: [{ c: 5, nome: 'Cascatas', cor: COR.red }], pos: { c0: 0, r0: Z.linhas.length + 1, c1: 6, r1: Z.linhas.length + 1 + Math.max(10, perfil.zonas.length * 3) } });
  } else paragrafo(Z, 'Nenhuma partida se destaca da média.');

  /* ---------- 4 Proposta e simulação ---------- */
  const PS = nova('4 Proposta e simulação', [16, 18, 12, 12, 12, 12, 30, 30], true);
  PS.linhas.push(titulo('4. Proposta de reforço e simulação'));
  paragrafo(PS, `Nenhuma partida muda de hora nem desaparece. Nas voltas de cada período as viaturas ganham ${M.b.intervalo} min (o intervalo entre partidas): se a VR começa no terminal das idas, esse tempo vai para a chegada final; se começa no outro terminal, vai para a ida (chegada a esse terminal mais tarde) e cada viatura faz a volta seguinte. As horas alteradas aparecem a amarelo. A viatura de reforço (VR) cobre a partida que ficaria sem viatura e, quando sai, cada viatura encaixa na partida seguinte.`);
  PS.linhas.push([cab('Período'), cab('Voltas alargadas'), cab('VR entra'), cab('VR sai'), cab(M.dois ? 'Viagens da VR' : 'Voltas da VR'), cab('Horas da VR'), cab('Zonas protegidas'), cab('Escolha da entrada')]);
  M.jan.forEach((j, i) => {
    const v = M.vrs[i], vs = partidas(M.b).filter((m) => m >= j.a && m < j.b), hs = M.hip[i], k = hs.findIndex((h) => mesmaHip(h, j));
    const zs = perfil.zonas.filter((z) => j.a <= z.fim && j.b > z.ini).map((z) => `${faixa(z.hIni, z.hFim)} (${nomeS(z.sentido).toLowerCase()})`).join(', ');
    PS.linhas.push([cel(`Período ${i + 1}`, { negrito: true }), cel(vs.length ? `${Hc(vs[0])} a ${Hc(vs[vs.length - 1])}` : '—'), cel(v.entra != null ? `${Hc(v.entra)} · ${M.terms[v.entraEm]}` : '—'), cel(v.sai != null ? `${Hc(v.sai)} · ${M.terms[v.saiEm]}` : '—'), cel(M.dois ? v.viagens : v.voltas), cel(r1(v.horas), { d1: true }), cel(zs || '—', { quebra: true }), cel([mesmaHip(M.sug[i], { lado: j.lado, vr: j.vr }) ? 'sugestão (menos atrasos)' : 'escolha manual', nomeHip(hs, k)].filter(Boolean).join(' · '))]);
  });
  PS.linhas.push([]);
  PS.linhas.push([cab('Partidas atrasadas >10 min por dia'), cab('Hoje'), cab('Com reforço'), cab('Diferença'), cab('Horas VR/dia')]);
  PS.alturas[PS.linhas.length - 1] = 32;
  PS.linhas.push([cel('Dia inteiro'), cel(r1(ev.antes), { d1: true }), cel(r1(ev.depois), { d1: true, negrito: true, cor: COR.verde }), cel(ev.antes ? (ev.depois - ev.antes) / ev.antes : 0, { pct: true }), cel(r1(c.horasVR), { d1: true })]);
  // hipóteses de entrada da VR
  const hipG = [];
  M.hip.forEach((hs, i) => {
    if (hs.length < 2) return;
    PS.linhas.push([]);
    PS.linhas.push(seccao(`Período ${i + 1}: a que horas pode entrar a VR`));
    PS.linhas.push([cab('Hipótese'), cab('VR entra'), cab('VR sai'), cab(M.dois ? 'Viagens da VR' : 'Voltas da VR'), cab('Horas da VR'), cab('Atrasadas/dia hoje'), cab('Atrasadas/dia com reforço'), cab('')]);
    PS.alturas[PS.linhas.length - 1] = 32;
    const h0 = PS.linhas.length;
    hs.forEach((h, k) => {
      const sel = mesmaHip(h, M.jan[i]), sg = mesmaHip(h, { lado: M.sug[i] && M.sug[i].lado, vr: M.sug[i] && M.sug[i].entra }), o = sel ? { negrito: true, fundo: 'FFF2CC' } : {};
      PS.linhas.push([cel(`${Hc(h.entra)} ${M.terms[h.entraEm]}`, o), cel(`${Hc(h.entra)} · ${M.terms[h.entraEm]}`, o), cel(`${Hc(h.sai)} · ${M.terms[h.saiEm]}`, o), cel(M.dois ? h.viagens : h.voltas, o), cel(r1(h.horas), { d1: true, ...o }), cel(r1(h.antes), { d1: true, ...o }), cel(r1(h.depois), { d1: true, ...o }), cel([sel ? 'escolhida' : '', sg ? 'sugestão' : '', nomeHip(hs, k)].filter(Boolean).join(' · '), o)]);
    });
    hipG.push({ i, r0: h0, r1: PS.linhas.length - 1 });
  });
  // simulação por hora: partidas atrasadas por dia, hoje e com reforço
  PS.linhas.push([]);
  PS.imprimir.quebras = [PS.linhas.length + 1];
  PS.linhas.push(seccao('Simulação por hora: partidas (nos dois terminais) com mais de 10 min de atraso, por dia'));
  PS.linhas.push([cab('Hora'), cab('Hoje'), cab('Com reforço')]);
  const sh0 = PS.linhas.length, porH = new Map();
  for (const p of c.porPartida) { const h = Math.floor(p.m / 60), o = porH.get(h) || { a: 0, d: 0 }; o.a += p.antes; o.d += p.depois; porH.set(h, o); }
  [...porH.keys()].sort((a, b) => a - b).forEach((h) => { const o = porH.get(h); PS.linhas.push([cel(String(h).padStart(2, '0') + 'h', { centro: true }), cel(Math.round(o.a * 100) / 100, { d1: true }), cel(Math.round(o.d * 100) / 100, { d1: true, negrito: true })]); });
  const sh1 = PS.linhas.length - 1;
  paragrafo(PS, 'Estimativa direta: cada viatura chega com o atraso que hoje se observa menos o tempo a mais que ganhou; a VR sai a horas. Não simula a propagação ao resto do dia.', { cor: COR.cinza });
  let gy = PS.linhas.length + 1;
  PS.graficos.push({ tipo: 'coluna', titulo: 'Partidas atrasadas por dia, por hora: hoje e com reforço', eixoY: 'partidas por dia', cat: { c: 0, r0: sh0, r1: sh1 }, series: [{ c: 1, nome: 'Hoje', cor: 'A5B4BE' }, { c: 2, nome: 'Com reforço', cor: COR.verde }], pos: { c0: 0, r0: gy, c1: 8, r1: gy + 18 } });
  gy += 19;
  if (hipG.length) PS.imprimir.quebras.push(gy + 1);
  hipG.forEach((b) => { PS.graficos.push({ tipo: 'coluna', titulo: `Período ${b.i + 1}: partidas atrasadas por dia com reforço, conforme a hora de entrada da VR (hoje: ${d1(ev.antes)})`, eixoY: 'partidas atrasadas por dia', cat: { c: 0, r0: b.r0, r1: b.r1 }, series: [{ c: 6, nome: 'Com reforço', cor: COR.verde }], pos: { c0: 0, r0: gy, c1: 8, r1: gy + 16 } }); gy += 17; });

  /* ---------- 5, 6 horários e dados ---------- */
  const HPf = folhaHorario(M, c, '5 Horário proposto'), HAf = folhaHorario(M, null, '6 Horário atual');
  for (const F of [HPf, HAf]) { F.rodape = rodape; F.imprimir = { paisagem: false, titulos: [2, 3] }; }
  const DSEMx = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const vs = S.dados.viagens.filter((v) => v.linha === S.linha && v.tipoDia === S.tipo).sort((a, b) => a.data.localeCompare(b.data) || a.ini - b.ini);
  const Dd = { nome: 'Dados', colunas: [11, 6, 8, 30, 30, 10, 10, 12, 8, 8], fixar: 2, rodape, imprimir: { paisagem: true, titulos: [2, 2] }, filtro: `A2:J${vs.length + 2}`,
    linhas: [[{ v: `Linha ${S.linha} · todas as viagens em dias úteis de ${dataPt(perfil.de)} a ${dataPt(perfil.ate)}`, negrito: true }],
      ['Data', 'Dia', 'Sentido', 'Partida de', 'Chegada a', 'Hora prevista', 'Atraso (min)', 'Cascata', 'Chapa', 'Viatura'].map((t) => ({ v: t, negrito: true, fundo: COR.cab, borda: true })),
      ...vs.map((v) => [dataPt(v.data), DSEMx[new Date(v.data + 'T12:00:00').getDay()], v.sentido, nP(v.origem), nP(v.destino), { v: v.ini, hora: true }, v.atraso ? (v.atrasada ? { v: r1(v.atraso), fundo: 'FFC7CE', cor: '9C0006' } : r1(v.atraso)) : '', v.inicioCascata ? 'começa' : v.emCascata ? 'em cascata' : '', +v.chapa || v.chapa, +v.viatura || v.viatura])] };

  Excel.descarregar([R, A, P2, Z, PS, HPf, HAf, Dd], `relatorio_linha${S.linha}_${perfil.de}_${perfil.ate}.xlsx`);
}
