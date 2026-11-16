/* Passo 2 (parte de cima): onde reforçar. Lista as zonas críticas do passo 1; cada zona protegida passa a ser um
   período de voltas alargadas, que se afina em baixo (hp.js). Tem também a sugestão automática de períodos. */
const PROP = { cache: new Map() };

// Sugestão automática: os períodos que mais atraso evitam com um orçamento de horas (Sim.planear).
function calcularProposta() {
  const chave = S.linha + '|' + S.tipo;
  const h = S.horas || 4, nj = S.nj || 2;
  const zonas = perfil.zonas;
  let c = PROP.cache.get(chave);
  if (!c) {
    const sel = S.dias.filter((d) => d.linha === S.linha && d.tipoDia === S.tipo);
    c = { cand: sel.length ? Sim.candidatos(sel) : [] };
    PROP.cache.set(chave, c);
  }
  // só entram períodos que cobrem pelo menos uma partida crítica
  const cand = zonas.length ? c.cand.filter((k) => zonas.some((z) => k.a <= z.fim && k.b > z.ini)) : c.cand;
  const p = cand.length ? Sim.planear(S.dias, S.linha, S.tipo, { maxHoras: h, maxJanelas: nj, candidatos: cand }) : null;
  S.prop = { janelas: p ? p.janelas.map((j) => ({ a: j.a, b: j.b })) : [] };
}

// a avaliação é toda feita em hp.js (Escala.cenario); mantido para quem ainda chama
function refazerResultado() {}

const zonaTem = (z) => S.prop.janelas.some((j) => j.a <= z.fim && j.b > z.ini);

function htmlOndeReforcar() {
  const h = S.horas || 4, nj = S.nj || 2;
  const seg = (id, vals, atual, suf) => `<div class="seg" id="${id}">${vals.map((v) => `<button data-v="${v}" class="${v === atual ? 'on' : ''}">${v}${suf}</button>`).join('')}</div>`;
  const zonasHtml = perfil.zonas.length ? `<div class="zl">${perfil.zonas.map((z, i) => { const on = zonaTem(z); return `<button class="zi ${on ? 'on' : ''}" data-z="${i}" role="switch" aria-checked="${on}" title="${on ? 'Retirar reforço' : 'Proteger esta zona'}${z.sentido === 'Volta' ? ' · vem da viagem que sai de ' + nP(z.destino) + ' às ' + faixa(z.ini, z.fim) : ''}"><b>${faixa(z.hIni, z.hFim)}</b><span class="sent s${z.sentido}">${NOMES_S[z.sentido]}</span><span class="zr">${nP(z.origem)} → ${nP(z.destino)}<small>${z.partidas} ${z.partidas === 1 ? 'partida' : 'partidas'} · ${z.inicios} cascatas (${pc(z.parte)})</small></span><span class="tg" aria-hidden="true"></span></button>`; }).join('')}</div>` : '<p class="nota">Nenhuma partida se destaca da média: use um período livre.</p>';
  const L = perfil.lista, criticas = L.filter((o) => o.critica);
  const fora = criticas.filter((o) => !S.prop.janelas.some((j) => o.m >= j.a && o.m < j.b));
  return `<section class="card">
    <h2>Onde reforçar</h2>
    <p class="sub">Ligue as zonas críticas a proteger. Cada uma passa a ser um período, que afina em baixo.</p>
    ${zonasHtml}
    ${S.prop.janelas.length && criticas.length ? `<p class="nota" style="margin-top:10px">${fora.length ? `Partidas críticas sem reforço: ${fora.map((o) => H(o.m)).join(', ')}.` : 'Todas as partidas críticas ficam dentro de um período de reforço.'}</p>` : ''}
    <div class="deck" style="margin-top:12px"><button class="btn sec" id="btLivre">+ Período livre</button></div>
    <details class="aut"><summary>Sugestão automática</summary>
      <p class="nota" style="margin:8px 0">Escolhe os períodos que mais atraso evitam com um orçamento de horas, e substitui os períodos atuais.</p>
      <div class="deck">
        <div class="field"><label>Horas de reforço por dia</label>${seg('segH', [2, 3, 4, 5, 6], h, ' h')}</div>
        <div class="field"><label>Períodos no máximo</label>${seg('segN', [1, 2, 3], nj, '')}</div>
        <button class="btn" id="btAuto">Sugerir</button>
      </div></details>
  </section>`;
}

function ligarOndeReforcar(redesenhar) {
  const P = S.prop;
  const novaJ = (a, b) => { P.janelas.push({ a, b }); P.janelas.sort((x, y) => x.a - y.a); const m = []; for (const j of P.janelas) { const u = m[m.length - 1]; if (u && j.a <= u.b) u.b = Math.max(u.b, j.b); else m.push({ ...j }); } P.janelas = m; redesenhar(); };
  document.querySelectorAll('[data-z]').forEach((b) => b.onclick = () => {
    const z = perfil.zonas[+b.dataset.z];
    if (zonaTem(z)) { P.janelas = P.janelas.filter((j) => !(j.a <= z.fim && j.b > z.ini)); redesenhar(); }
    // alargam-se as voltas que saem na zona (no mínimo 3 voltas seguidas)
    else novaJ(z.ini, Math.max(z.fim, z.ini + 2 * (perfil.intervalo || 15)) + 1);
  });
  $('btLivre').onclick = () => { const L0 = perfil.lista; const livre = L0.find((o) => !P.janelas.some((j) => o.m >= j.a && o.m < j.b)); const a = livre ? livre.m : L0[0].m; novaJ(a, a + 31); };
  $('btAuto').onclick = () => { $('btAuto').textContent = 'A calcular…'; setTimeout(() => { calcularProposta(); S.prop.chave = S.linha + '|' + S.tipo; redesenhar(); }, 20); };
  $('segH').onclick = (e) => { const b = e.target.closest('button'); if (b) { S.horas = +b.dataset.v; e.currentTarget.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); } };
  $('segN').onclick = (e) => { const b = e.target.closest('button'); if (b) { S.nj = +b.dataset.v; e.currentTarget.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); } };
}
