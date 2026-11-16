/* Passo 3: horário proposto, no formato do Excel da TUB (paragens em colunas, uma linha por viagem, coluna da
   viatura). Em cada período escolhe-se a primeira e a última volta alargada e a hora a que a VR entra e sai; uma
   tabela compara todas as horas possíveis de entrada da VR. Exporta para Excel. */
const HP = { ver: 'prop', alcance: 'periodo' };

function passo2() {
  if (!perfil || !perfil.lista.length) return passo1();
  $('vista').innerHTML = '<section class="card"><h2>Reforço</h2><div class="pos">A calcular…</div></section>';
  setTimeout(() => {
    const chave = S.linha + '|' + S.tipo;
    if (!S.prop || S.prop.chave !== chave) { calcularProposta(); S.prop.chave = chave; }
    desenharHP();
  }, 30);
}

const partidas = (b) => Escala.partidasDe(b);

function montarHP() {
  const hor = S.horarios[S.linha];
  const fonte = hor && hor.util && hor.util.linhas.length ? hor.util : Escala.deDados(perfil, nP);
  const b = Escala.base(fonte);
  const col = Escala.colunas(b, perfil);
  // nomes dos dois terminais onde a VR pode começar/recolher (1.ª coluna e partida no ponto de viragem)
  const terms = [fonte.paragens[0], fonte.paragens[col.kp]];
  const jan = S.prop.janelas.map((j) => ({ a: j.a, b: j.b, lado: j.lado, vr: j.vr }));
  // hipóteses de entrada (nos dois terminais) e a sugestão de cada período: a de menos atrasos. Um período novo, ou
  // uma escolha que deixou de ser possível, fica com a sugestão; depois o utilizador pode mudar.
  let hip = [], sug = [], mudou = false;
  const avaliar = () => {
    hip = []; sug = []; mudou = false;
    jan.forEach((j, i) => {
      const hs = Escala.hipoteses(b, jan, i, perfil), s = Escala.sugerir(hs);
      const valida = j.lado != null && j.vr != null && hs.some((h) => h.lado === j.lado && h.entra === j.vr);
      if (!valida && s) { j.lado = s.lado; j.vr = s.entra; S.prop.janelas[i].lado = s.lado; S.prop.janelas[i].vr = s.entra; mudou = true; }
      hip.push(hs); sug.push(s);
    });
  };
  avaliar();
  // os números de cada período dependem dos outros: se algum mudou para a sugestão, volta a contar com tudo certo
  if (mudou) avaliar();
  const P = Escala.cenario(b, jan, 'P', perfil);
  const vrs = jan.map((j) => Escala.resumoVR(Escala.estadiasDoPeriodo(P, b, j)));
  const sai = jan.map((j, i) => Escala.saidas(b, jan, i, perfil));
  return { b, fonte, hor, jan, P, hip, sug, vrs, sai, kp: col.kp, dois: col.doisTerminais, terms };
}

// nome da hipótese (só no terminal das idas): a mais cedo é o cenário B (VR primeiro), a mais tarde o A (alargar primeiro)
const nomeHip = (hs, k) => {
  const h = hs[k], ida = hs.filter((x) => x.lado === 'ida');
  if (!h || h.lado !== 'ida' || ida.length < 2) return '';
  return h === ida[0] ? 'cenário B · VR primeiro' : h === ida[ida.length - 1] ? 'cenário A · alargar primeiro' : '';
};
const mesmaHip = (h, j) => h && j && h.lado === j.lado && h.entra === j.vr;
// "4 viagens" onde há dois terminais; "2 voltas" quando o ponto de viragem é só paragem de passagem (ex. 74)
const descVR = (M, v) => (M.dois ? plural(v.viagens, 'viagem', 'viagens') : plural(v.voltas, 'volta', 'voltas'));

function desenharHP() {
  const P = S.prop;
  // duas colunas: comandos à esquerda (fixos), resultado e horário à direita
  const layout = (painel, ver) => `<div class="reforco"><aside class="painel">${painel}</aside><div class="ver">${ver}</div></div>`;
  if (!P.janelas.length) {
    $('vista').innerHTML = layout(htmlOndeReforcar(), '<section class="card"><div class="pos"><b>Sem período de reforço.</b> Ligue uma zona crítica à esquerda, junte um período livre ou peça a sugestão automática.</div></section>');
    ligarOndeReforcar(desenharHP); return;
  }
  const M = montarHP(), { b, fonte, hor } = M, c = M.P;
  HP.M = M;
  const iv = b.intervalo;
  const seta = (i, k, d, on) => `<button class="mini" data-hj="${i}" data-k="${k}" data-d="${d}"${on ? '' : ' disabled'} aria-label="${d < 0 ? 'Antes' : 'Depois'}">${d < 0 ? '◀' : '▶'}</button>`;
  const ctrl = (rot, i, k, val, menos, mais, vr) => `<div class="ctrl${vr ? ' vr' : ''}"><label>${rot}</label><div class="v">${seta(i, k, -1, menos)}<b>${val}</b>${seta(i, k, 1, mais)}</div></div>`;
  const janCard = P.janelas.map((j, i) => {
    const vs = b.linhas.filter((l) => l.tipo === 'volta' && !l.entra && l.ini >= j.a && l.ini < j.b).map((l) => l.ini);
    const zs = perfil.zonas.filter((z) => j.a <= z.fim && j.b > z.ini);
    const v = M.vrs[i], hsT = M.hip[i], ss = M.sai[i], s = M.sug[i];
    const hs = hsT.filter((h) => h.lado === j.lado);
    const ie = hs.findIndex((h) => h.entra === v.entra), is = ss.findIndex((x) => x.sai === v.sai && x.saiEm === v.saiEm);
    const qual = nomeHip(hsT, hsT.findIndex((h) => mesmaHip(h, j)));
    const ehSug = mesmaHip(s, j);
    const semVolta = ' disabled title="Nos dados, as viagens não acabam nem recomeçam neste ponto: não é terminal, por isso a VR só pode começar no terminal das idas."';
    const lados = `<div class="ladoVR"><span>VR começa em</span><div class="seg">${['ida', 'volta'].map((l, k) => `<button data-lado="${l}" data-j="${i}" class="${j.lado === l ? 'on' : ''}"${l === 'volta' && !M.dois ? semVolta : ''}>${M.terms[k]}</button>`).join('')}</div></div>`;
    const sugTxt = s ? (ehSug ? `<span class="sugOk">✓ sugestão</span> é a entrada com menos partidas atrasadas (${d1(s.depois)} por dia)` : `Sugestão: começar em <b>${M.terms[s.lado === 'volta' ? 1 : 0]}</b> às <b>${Hc(s.entra)}</b> (${d1(s.depois)} atrasadas/dia, ${d1(s.horas)} h) <button class="mini" data-repor="${i}">Repor</button>`) : '';
    return `<section class="card per">
      <div class="pt"><span class="n">Período ${i + 1}</span><b>${vs.length ? Hc(vs[0]) + ' – ' + Hc(vs[vs.length - 1]) : '—'}</b><button class="mini rm" data-rm="${i}">Remover</button></div>
      <p class="nota" style="margin:2px 0 0">${plural(vs.length, 'volta alargada', 'voltas alargadas')} em +${iv} min${v.entra != null ? ` · VR ${Hc(v.entra)}–${Hc(v.sai)} (${descVR(M, v)}, ${d1(v.horas)} h)` : ''}</p>
      ${lados}
      <p class="nota sugL">${sugTxt}</p>
      ${v.entra != null && v.saiEm !== v.entraEm ? `<p class="aviso" style="margin:8px 0 0">A VR entra em ${M.terms[v.entraEm]} e recolhe em ${M.terms[v.saiEm]}: as viaturas ficam desfasadas meia volta até ao fim do serviço (voltas alteradas depois do período). Para voltar ao horário normal, escolha uma saída em ${M.terms[v.entraEm]}.</p>` : ''}
      ${vs.length ? `<div class="ctrls">
        ${ctrl('Primeira volta', i, 'a', Hc(vs[0]), true, vs.length > 1)}
        ${ctrl('Última volta', i, 'b', Hc(vs[vs.length - 1]), vs.length > 1, true)}
        ${ctrl('VR entra', i, 'e', v.entra != null ? Hc(v.entra) : '—', ie > 0, ie >= 0 && ie < hs.length - 1, true)}
        ${ctrl('VR sai', i, 's', v.sai != null ? `${Hc(v.sai)}<small>${M.terms[v.saiEm]}</small>` : '—', is > 0, is >= 0 && is < ss.length - 1, true)}
      </div>` : ''}
      <p class="jp">${vs.length ? `Alargam-se as voltas que saem de ${fonte.paragens[0]} entre as <b>${Hc(vs[0])}</b> e as <b>${Hc(vs[vs.length - 1])}</b>` : 'Nenhuma volta neste período'}${v.entra != null ? `; a VR entra em ${M.terms[v.entraEm]} às <b>${Hc(v.entra)}</b>${qual ? ` (${qual})` : ''} e recolhe em ${M.terms[v.saiEm]} às <b>${Hc(v.sai)}</b>.` : '.'}${j.lado === 'volta' ? ` A ida destas voltas passa a demorar mais ${iv} min (chegada a ${M.terms[1]} +${iv}), e cada viatura faz a volta seguinte; as partidas não mudam de hora.` : ''}${zs.length ? ` Protege ${zs.map((z) => `${faixa(z.hIni, z.hFim)} (${NOMES_S[z.sentido].toLowerCase()})`).join(' e ')}.` : ''}</p>
    </section>`;
  }).join('');
  const tabHip = M.hip.map((hs, i) => {
    if (hs.length < 2) return '';
    const v = M.vrs[i], j = M.jan[i], melhor = Math.min(...hs.map((h) => h.depois)), s = M.sug[i];
    return `<h3 class="hh">Período ${i + 1} · a que horas pode entrar a VR</h3><div class="rolo"><table class="hip"><thead><tr><th>Começa em</th><th>VR entra</th><th>Recolhe em</th><th>VR sai</th><th>${M.dois ? 'Viagens' : 'Voltas'} da VR</th><th>Horas da VR</th><th>Partidas atrasadas por dia<br><span>hoje → com reforço</span></th><th></th></tr></thead><tbody>
      ${hs.map((h, k) => `<tr data-hi="${i}" data-e="${h.entra}" data-l="${h.lado}" class="${mesmaHip(h, j) ? 'sel' : ''}"><td>${M.terms[h.entraEm]}</td><td><b>${Hc(h.entra)}</b></td><td>${M.terms[h.saiEm]}</td><td>${Hc(h.sai)}</td><td>${M.dois ? h.viagens : h.voltas}</td><td>${d1(h.horas)} h</td><td>${d1(h.antes)} → <b class="${h.depois === melhor ? 'bom' : ''}">${d1(h.depois)}</b></td><td class="nota">${[mesmaHip(h, j) ? '<b>escolhida</b>' : '', mesmaHip(h, { lado: s && s.lado, vr: s && s.entra }) ? '<span class="sugOk">sugestão</span>' : '', nomeHip(hs, k)].filter(Boolean).join(' · ')}</td></tr>`).join('')}
    </tbody></table></div>`;
  }).join('');
  const ev = c.avaliacao;
  const vistas = [['prop', 'Horário proposto'], ['lado', 'Proposto e atual lado a lado'], ['atual', 'Horário atual']];
  const painel = htmlOndeReforcar() + janCard
    + '<p class="nota painelNota">A VR só pode entrar entre a primeira volta alargada e a primeira partida que ficaria sem viatura. Mudar a saída muda a última volta alargada: a VR sai quando as viaturas voltam a encaixar.</p>';
  const ver = `
  <section class="card">
    <div class="cabCard"><h2>Resultado</h2><button class="btn" id="btXlsHP" title="Resumo, atrasos, partidas, zonas críticas, proposta, simulação, horários e dados, com gráficos; pronto a imprimir em A4">Relatório em Excel</button></div>
    <div class="faixaKpi tres">
      <div><b>${c.estadias.length ? c.estadias.map((e) => Hc(e.entra) + '–' + Hc(e.sai)).join(', ') : '—'}</b><span>VR em serviço (${M.dois ? plural(c.viagensVR, 'viagem', 'viagens') : plural(c.voltasVR, 'volta', 'voltas')})</span></div>
      <div><b>${d1(c.horasVR)} h</b><span>de viatura + motorista de reforço por dia</span></div>
      <div><b class="bom">${d1(ev.antes)} → ${d1(ev.depois)}</b><span>partidas por dia, nos dois terminais, com mais de 10 min de atraso (hoje → com reforço)</span></div>
    </div>
    ${c.buracos.length ? `<p class="aviso" style="margin-top:12px">Há ${plural(c.buracos.length, 'partida', 'partidas')} sem viatura: ${c.buracos.map((l) => Hc(l.ini)).join(', ')}.</p>` : ''}
    ${tabHip}
    <p class="nota" style="margin-top:8px">Clique numa linha da tabela para escolher essa hora de entrada. Partidas atrasadas: partidas dos dois terminais, no dia todo, com mais de 10 min de atraso. A sugestão é a entrada com menos partidas atrasadas (em empate, a de menos horas de VR). Com reforço, cada viatura chega com o atraso que hoje se observa menos o tempo a mais que ganhou, e a VR sai a horas (estimativa direta, sem simular a propagação).</p>
  </section>
  <section class="card">
    <h2>Horário proposto</h2>
    <p class="sub">Linha ${S.linha}, dias úteis${hor && hor.versao ? `, a partir do horário ${hor.versao}` : ''}. Nenhuma partida muda de hora nem desaparece: as horas intermédias ficam iguais e só a <b>chegada final</b> das voltas do período ganha ${iv} min (o intervalo entre partidas), para a viatura chegar a tempo à circulação seguinte. A VR cobre a partida que ficaria sem viatura e, quando sai, cada viatura encaixa na partida seguinte.</p>
    ${fonte.deDados ? '<p class="aviso">Sem o horário em PDF desta linha: mostro só a partida, o ponto de viragem e a chegada, com tempos tirados dos dados. Junte o PDF no topo para ver todas as paragens.</p>' : ''}
    <div class="deck">
      <div class="seg" id="segVer">${vistas.map(([v, t]) => `<button data-v="${v}" class="${HP.ver === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="seg" id="segAlc"><button data-v="periodo" class="${HP.alcance === 'periodo' ? 'on' : ''}">Período do reforço</button><button data-v="dia" class="${HP.alcance === 'dia' ? 'on' : ''}">Dia inteiro</button></div>
    </div>
    <div class="leg" style="margin:12px 0"><span><i style="background:#ffff00;border:1px solid #d6d600"></i>hora alterada (volta alargada)</span><span><i style="background:#00b0f0"></i>viagem da viatura de reforço (VR)</span><span><b style="color:#00a651">7:45</b> partida que muda de viatura</span><span><b style="color:#e00">8:30</b> partida feita pela VR</span><span><i style="background:#eef1f3"></i>viagem fora da rotação (ex. só em período escolar)</span></div>
    <div class="folhas ${HP.ver === 'lado' ? 'duas' : ''}">${HP.ver === 'lado' ? folha(c, M) + folha(null, M) : HP.ver === 'atual' ? folha(null, M) : folha(c, M)}</div>
    ${hor && hor.notas.length ? `<p class="nota" style="margin-top:8px">${hor.notas.map((n) => `<b>${n.k})</b> ${n.txt}`).join(' · ')}</p>` : ''}
  </section>`;
  const rolo = document.querySelector('.painel') ? document.querySelector('.painel').scrollTop : 0;
  $('vista').innerHTML = layout(painel, ver);
  document.querySelector('.painel').scrollTop = rolo; // mantém a posição do painel ao redesenhar
  const muda = () => desenharHP();
  ligarOndeReforcar(desenharHP);
  document.querySelectorAll('[data-rm]').forEach((bt) => bt.onclick = () => { P.janelas.splice(+bt.dataset.rm, 1); desenharHP(); });
  document.querySelectorAll('[data-hj]').forEach((bt) => bt.onclick = () => {
    const i = +bt.dataset.hj, j = P.janelas[i], k = bt.dataset.k, d = Math.sign(+bt.dataset.d);
    if (k === 'e') { const hs = M.hip[i].filter((h) => h.lado === j.lado), x = hs.findIndex((h) => h.entra === M.vrs[i].entra) + d; if (hs[x]) { j.vr = hs[x].entra; muda(); } return; }
    if (k === 's') { const ss = M.sai[i], x = ss.findIndex((s) => s.sai === M.vrs[i].sai && s.saiEm === M.vrs[i].saiEm) + d; if (ss[x]) { j.b = ss[x].b; muda(); } return; }
    // anda uma partida de cada vez: a janela fica sempre [primeira volta, última volta + 1 min)
    const deps = partidas(b), dentro = deps.filter((m) => m >= j.a && m < j.b);
    if (!dentro.length) return;
    let i0 = deps.indexOf(dentro[0]), i1 = deps.indexOf(dentro[dentro.length - 1]);
    if (k === 'a') i0 = Math.max(0, Math.min(i1, i0 + d)); else i1 = Math.min(deps.length - 1, Math.max(i0, i1 + d));
    j.a = deps[i0]; j.b = deps[i1] + 1;
    muda();
  });
  document.querySelectorAll('tr[data-hi]').forEach((tr) => tr.onclick = () => { const j = P.janelas[+tr.dataset.hi]; j.lado = tr.dataset.l; j.vr = +tr.dataset.e; muda(); });
  // terminal onde a VR começa: fica com a melhor entrada nesse terminal
  document.querySelectorAll('[data-lado]').forEach((bt) => bt.onclick = () => { const i = +bt.dataset.j, j = P.janelas[i], m = Escala.sugerir(M.hip[i].filter((h) => h.lado === bt.dataset.lado)); if (m) { j.lado = m.lado; j.vr = m.entra; muda(); } });
  document.querySelectorAll('[data-repor]').forEach((bt) => bt.onclick = () => { const i = +bt.dataset.repor, sg = M.sug[i]; if (sg) { P.janelas[i].lado = sg.lado; P.janelas[i].vr = sg.entra; muda(); } });
  $('segVer').onclick = (e) => { const x = e.target.closest('button'); if (x) { HP.ver = x.dataset.v; desenharHP(); } };
  $('segAlc').onclick = (e) => { const x = e.target.closest('button'); if (x) { HP.alcance = x.dataset.v; desenharHP(); } };
  $('btXlsHP').onclick = () => exportarRelatorio(M);
}

// linhas a mostrar: o período do reforço com uma volta de margem antes e depois (ou o dia inteiro)
function alcance(M) {
  if (HP.alcance === 'dia') return () => true;
  const c = M.b.ciclo, ini = Math.min(...M.jan.map((j) => j.a)) - c;
  const fins = [...M.jan.map((j) => j.b), ...M.P.estadias.map((e) => e.sai)];
  const fim = Math.max(...fins) + c / 2;
  return (l) => { const t = l.base ? l.base : l.t, x = t.find((v) => v != null); return x >= ini && x <= fim; };
}

const SUB = (k, n) => (k === 0 ? 'P.' : k === n - 1 ? 'C.' : 'C. P');
// rótulos lidos do PDF (a 87 tem P. | C. | P. | C.); sem eles, o padrão da 74
const ROT = (M, k, n) => (M.fonte.rotulos && M.fonte.rotulos[k]) || SUB(k, n);

// viatura de cada meia-volta: colunas antes da partida da volta = ida; da partida da volta em diante = volta
const viaDe = (l, M, k) => (k < M.kp ? l.vIda : l.vVolta);
const txtVia = (l) => (l.vVolta == null || l.vIda === l.vVolta ? (l.vIda != null ? l.vIda : l.vVolta) : l.vIda == null ? l.vVolta : l.vIda + ' / ' + l.vVolta);
const txtEst = (l, M) => (l.ladoEstica === 'volta' ? `ida alargada: +${l.estica} min até ${M.terms[1]}` : `+${l.estica} min na chegada final`);

function folha(c, M) {
  const par = M.fonte.paragens, n = par.length, ok = alcance(M);
  const linhas = (c ? c.vista : M.b.linhas).filter(ok);
  const tit = c ? 'Horário proposto' : 'Horário atual';
  const cel = (l, k) => {
    const v = l.t[k];
    if (v == null) return '<td></td>';
    const via = c && l.tipo === 'volta' ? viaDe(l, M, k) : null;
    // viagem da VR a azul (mesmo com horas alteradas, como no exemplo do colega); hora alterada a amarelo
    let cls = c && l.alt && l.alt[k] ? 'am' : '';
    if (via === 'VR') cls = 'vrc';
    let txt = Hc(v);
    const partida = k === 0 ? 'i' : M.dois && k === M.kp ? 'v' : '';
    if (partida && c && l.tipo === 'volta' && !(partida === 'i' && l.entra)) {
      const mud = partida === 'i' ? l.mIda : l.mVolta;
      if (via === 'VR') txt = `<b class="tvr">${txt}</b>`;
      else if (mud) txt = `<b class="tmu">${txt}</b>`;
    }
    return `<td class="${cls}">${txt}</td>`;
  };
  return `<div class="folha"><div class="ft">${tit}</div><div class="rolo xlsh"><table class="hx"><thead>
    <tr>${par.map((p) => `<th><span>${p}</span></th>`).join('')}<th class="vcol"><span>Viatura</span></th></tr>
    <tr class="sub">${par.map((_, k) => `<th>${ROT(M, k, n)}</th>`).join('')}<th></th></tr></thead><tbody>
    ${linhas.map((l) => {
      const fora = l.tipo === 'parcial', temVR = c && (l.vIda === 'VR' || l.vVolta === 'VR');
      const nota = l.nota ? ` <span class="nn">${l.nota}</span>` : '';
      return `<tr class="${fora ? 'fora' : ''}">${par.map((_, k) => k === n - 1 && l.nota && l.t[k] != null ? `<td>${Hc(l.t[k])}${nota}</td>` : cel(l, k)).join('')}<td class="vc${temVR ? ' vrc' : ''}">${l.tipo === 'volta' ? (c ? txtVia(l) : l.viatura || '') : ''}${c && l.estica ? `<span class="est" title="${txtEst(l, M)}">+${l.estica}</span>` : ''}</td></tr>`;
    }).join('')}
  </tbody></table></div></div>`;
}

/* Folha de horário para o Excel, no formato do horário da TUB (cores iguais às do ecrã). c = cenário, ou null para o
   horário atual. Usada pelo relatório (relatorio.js). */
function folhaHorario(M, c, nome) {
  const par = M.fonte.paragens, n = par.length;
  const brd = { borda: true, centro: true };
  const linhas = c ? c.vista : M.b.linhas;
  const rows = [
    [{ v: `${S.linha} - ${(M.hor && M.hor.nome) || ''} · ${nome.replace(/^\d+ /, '')}`, negrito: true, tam: 13 }],
    [...par.map((p) => ({ v: p, negrito: true, vertical: true, borda: true })), { v: 'Viatura', negrito: true, vertical: true, borda: true }, { v: 'Notas', negrito: true, vertical: true, borda: true }],
    [...par.map((_, k) => ({ v: ROT(M, k, n), negrito: true, ...brd })), { v: '', ...brd }, { v: '', ...brd }],
  ];
  for (const l of linhas) {
    const vr = c && (l.vIda === 'VR' || l.vVolta === 'VR');
    const r = par.map((_, k) => {
      const v = l.t[k], o = { v: v == null ? '' : v, hora: v != null, ...brd };
      const via = c && l.tipo === 'volta' ? viaDe(l, M, k) : null;
      if (c && l.alt && l.alt[k]) o.fundo = 'FFFF00';
      if (via === 'VR' && v != null) o.fundo = '00B0F0';
      const partida = k === 0 ? 'i' : M.dois && k === M.kp ? 'v' : '';
      if (partida && c && l.tipo === 'volta' && !(partida === 'i' && l.entra)) { if (via === 'VR') o.cor = 'FF0000'; else if (partida === 'i' ? l.mIda : l.mVolta) o.cor = '00A651'; }
      return o;
    });
    const notas = [l.nota, c && l.estica ? (l.ladoEstica === 'volta' ? `ida alargada +${l.estica} min até ${M.terms[1]}` : `alargada +${l.estica} min na chegada final`) : '', vr ? (l.vIda == null ? 'viatura de reforço: entra e faz só a volta' : l.vVolta == null ? 'viatura de reforço: faz só a ida e recolhe' : 'viatura de reforço') : ''].filter(Boolean).join('; ');
    r.push({ v: l.tipo === 'volta' ? (c ? txtVia(l) : l.viatura || '') : '', ...brd, ...(vr ? { fundo: '00B0F0', negrito: true } : {}) });
    r.push({ v: notas, borda: true });
    rows.push(r);
  }
  return { nome, colunas: [...par.map(() => 9), 8, 48], fixar: 3, juntar: [`A1:${Excel.letra(n + 1)}1`], alturas: { 1: 150 }, linhas: rows };
}
