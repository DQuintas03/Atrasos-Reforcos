const $ = (id) => document.getElementById(id);
const H = (m) => Analise.hhmm(Math.round(m));
const Hc = (m) => { const h = Math.floor(Math.round(m) / 60), mm = Math.round(m) % 60; return h + ':' + String(mm).padStart(2, '0'); }; // 7:30, como no horário
const pc = (x) => Math.round(x * 100) + '%';
const d1 = (x) => (Math.round(x * 10) / 10).toLocaleString('pt-PT');
const nP = (s) => Analise.nomeParagem(s);
const lerFicheiro = (f) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsText(f); });
const NOME_DIA = { util: 'dias úteis' };
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);

// Só se trabalham dias úteis.
const S = { dados: null, dias: [], linha: null, tipo: 'util', passo: 1, horarios: {} };
let perfil = null, anat = null, cic = null;

/* ---------- carregar ---------- */
async function carregar() {
  const a = $('f1').files[0], b = $('f2').files[0];
  if (!a || !b) return;
  $('erro').textContent = 'A analisar…';
  try {
    const [t1, t2] = await Promise.all([lerFicheiro(a), lerFicheiro(b)]);
    iniciar(Analise.analisar(t1, t2));
    $('erro').textContent = '';
  } catch (e) { $('erro').textContent = e.message; $('erro').classList.add('erro'); }
}
// Capa: cada cartão mostra o ficheiro escolhido; "Analisar" só acende com o rep3 e o rep20.
// Pode arrastar-se para um cartão, ou tudo de uma vez para a capa (o rep3 reconhece-se pelos cabeçalhos).
const tamanho = (b) => (b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
function estadoCapa() {
  [['f1', 'c1', 'n1'], ['f2', 'c2', 'n2'], ['f3', 'c3', 'n3']].forEach(([f, c, n]) => {
    const fs = [...$(f).files];
    $(c).classList.toggle('ok', fs.length > 0);
    $(n).innerHTML = fs.map((x) => `${x.name} <small>· ${tamanho(x.size)}</small>`).join('<br>');
    $(c).querySelector('.acao').textContent = fs.length ? 'Trocar ficheiro' : f === 'f3' ? 'Escolher ou arrastar PDF' : 'Escolher ou arrastar ficheiro';
  });
  const falta = [!$('f1').files.length && 'o rep3', !$('f2').files.length && 'o rep20'].filter(Boolean);
  $('btAnalisar').disabled = falta.length > 0;
  $('erro').classList.remove('erro');
  $('erro').textContent = falta.length ? `Falta${falta.length > 1 ? 'm' : ''} ${falta.join(' e ')}.` : 'Pronto a analisar.';
}
const porNoInput = (id, files) => { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); $(id).files = dt.files; $(id).dispatchEvent(new Event('change')); };
$('f1').addEventListener('change', estadoCapa);
$('f2').addEventListener('change', estadoCapa);
$('f3').addEventListener('change', estadoCapa);
$('btAnalisar').onclick = carregar;
[['c1', 'f1'], ['c2', 'f2'], ['c3', 'f3']].forEach(([c, f]) => {
  $(c).addEventListener('dragover', (e) => { e.preventDefault(); $(c).classList.add('sobre'); });
  $(c).addEventListener('dragleave', () => $(c).classList.remove('sobre'));
  $(c).addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); $(c).classList.remove('sobre'); const fs = [...e.dataTransfer.files]; if (fs.length) porNoInput(f, f === 'f3' ? fs : [fs[0]]); });
});
$('deck').addEventListener('dragover', (e) => e.preventDefault());
$('deck').addEventListener('drop', async (e) => {
  e.preventDefault();
  const fs = [...e.dataTransfer.files], pdfs = fs.filter((f) => /\.pdf$/i.test(f.name)), csvs = fs.filter((f) => /\.csv$/i.test(f.name));
  for (const f of csvs) { const cab = (await f.slice(0, 4000).text()); porNoInput(cab.includes('Hora inicial do Horário') ? 'f1' : 'f2', [f]); }
  if (pdfs.length) porNoInput('f3', pdfs);
});

async function lerPdfs(buffers) {
  if (!window.pdfjsLib) await new Promise((ok, mal) => {
    const s = document.createElement('script'); s.src = 'vendor/pdf.min.js';
    s.onload = ok; s.onerror = () => mal(new Error('Não consegui carregar o leitor de PDF.')); document.head.appendChild(s);
  });
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  const lidos = [];
  for (const buf of buffers) {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise, pgs = [];
    for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); pgs.push(tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))); }
    const r = Horario.lerHorario(pgs);
    if (r.linha) { S.horarios[r.linha] = r; lidos.push(r.linha + (r.versao ? ' (versão ' + r.versao + ')' : '')); }
  }
  if (!lidos.length) $('notaPdf').innerHTML = '<span class="falta">Não encontrei horários nestes PDF</span>';
  if (S.dados) recalcular();
}
$('f3').onchange = $('f3b').onchange = async (ev) => {
  $('notaPdf').textContent = 'A ler os PDF…';
  try { await lerPdfs(await Promise.all([...ev.target.files].map((f) => f.arrayBuffer()))); } catch (e) { $('notaPdf').textContent = e.message; }
};

function iniciar(r) {
  S.dados = r; S.dias = Sim.prepararDias(r.viagens);
  const linhas = [...new Set(Object.values(r.resumo).map((s) => s.linha))].filter((l) => r.resumo[l + '|util']);
  if (!linhas.length) { $('erro').textContent = 'Os ficheiros não têm viagens em dias úteis.'; return; }
  // cada linha aparece pelo percurso principal (o número fica no selo ao lado)
  const percurso = (l) => { const p = Diagnostico.parPrincipal(r.viagens.filter((v) => v.linha === l && v.sentido !== 'Volta')); if (!p) return 'Linha ' + l; const [o, d] = p.split('>').map((x) => nP(x).replace(/\s*\(.*\)\s*$/, '')); return o + ' ⇄ ' + d; };
  $('selLinha').innerHTML = linhas.map((l) => `<option value="${l}" data-curto="${percurso(l)}" data-longo="${l} · ${percurso(l)}">${percurso(l)}</option>`).join('');
  S.linha = linhas.map((l) => [l, r.resumo[l + '|util'].atrasadas]).sort((a, b) => b[1] - a[1])[0][0];
  $('selLinha').value = S.linha;
  const o = r.ocorrencias;
  $('chipDados').textContent = `${plural(o.excluidas, 'viagem', 'viagens')} de ocorrências excluídas`;
  $('deck').hidden = true; ['passos', 'linhaSel', 'faixa'].forEach((id) => { $(id).hidden = false; });
  recalcular();
}
$('btTrocar').onclick = () => { $('deck').hidden = false; ['passos', 'linhaSel', 'faixa'].forEach((id) => { $(id).hidden = true; }); $('vista').innerHTML = ''; };
$('selLinha').onchange = () => { S.linha = $('selLinha').value; rotulosLinha(false); recalcular(); };
// fechado mostra só o percurso (o número está no selo); aberto mostra número e percurso
const rotulosLinha = (longo) => [...$('selLinha').options].forEach((o) => { o.textContent = longo ? o.dataset.longo : o.dataset.curto; });
$('selLinha').addEventListener('mousedown', () => rotulosLinha(true));
$('selLinha').addEventListener('keydown', () => rotulosLinha(true));
$('selLinha').addEventListener('blur', () => rotulosLinha(false));
$('passos').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  S.passo = +b.dataset.p; marcarPassos(); desenhar(); window.scrollTo({ top: 0 });
};
function marcarPassos() {
  [...$('passos').children].forEach((b) => { b.classList.toggle('on', +b.dataset.p === S.passo); b.classList.toggle('off', +b.dataset.p > 1 && +b.dataset.p !== S.passo); });
}

// Partidas oficiais de cada sentido, tiradas do PDF: ida = 1.ª coluna; volta = coluna do ponto de viragem.
function saidasPdf(hor, viagens, linha) {
  if (!hor || !hor.util || !hor.util.linhas.length) return null;
  const b = Escala.base(hor.util);
  const vs = viagens.filter((v) => v.linha === linha && v.sentido === 'Ida');
  const parIda = Diagnostico.parPrincipal(vs);
  const kv = Escala.colunaViragem(b, parIda ? parIda.split('>')[1] : ''), kp = Escala.colunaPartidaVolta(b, kv);
  const ida = hor.util.saidas.slice();
  const volta = b.linhas.filter((l) => l.t[kp] != null && l.t[l.t.length - 1] != null && l.t.findIndex((x) => x != null) <= kp).map((l) => l.t[kp]);
  return { Ida: ida, Volta: [...new Set(volta)].sort((x, y) => x - y) };
}

function recalcular() {
  const { linha, tipo } = S, hor = S.horarios[linha];
  S.prop = null; TAB.filtro = null; GRAF.sel = null;
  perfil = Diagnostico.perfilPartidas(S.dados.viagens, linha, tipo, saidasPdf(hor, S.dados.viagens, linha), S.dados.cascatas);
  anat = Diagnostico.anatomia(S.dados.viagens, S.dados.cascatas, linha, tipo);
  try { cic = Sim.ciclo(S.dias, linha, tipo); } catch (e) { cic = null; }
  if (perfil) perfil.dePdf = !!hor;
  atualizarFaixa();
  desenhar();
}

// Faixa de contexto por baixo do header: período dos dados, viagens, horário em PDF.
function atualizarFaixa() {
  const hor = S.horarios[S.linha], dp = (s) => s.split('-').reverse().join('/');
  $('numLinha').textContent = S.linha;
  const nv = S.dados.viagens.filter((v) => v.linha === S.linha && v.tipoDia === S.tipo).length;
  $('faixaDados').innerHTML = perfil ? `Dados <b>${dp(perfil.de)} – ${dp(perfil.ate)}</b> · ${plural(perfil.dias, 'dia útil', 'dias úteis')} · ${nv.toLocaleString('pt-PT')} viagens` : 'Sem viagens em dias úteis';
  const v = hor && hor.versao ? hor.versao.split('.').pop() : '';
  $('notaPdf').innerHTML = hor ? `Horário <span class="ok" title="${hor.versao || ''}">✓ PDF${v ? ' ' + v : ''} lido</span>` : 'Horário <span class="falta">sem PDF: partidas tiradas dos dados</span>';
}

function desenhar() {
  if (S.passo === 1) return passo1();
  if (S.passo === 2) return passo2();
}

/* ---------- textos ---------- */
const NOMES_S = { Ida: 'Ida', Volta: 'Volta', '?': 'Percurso' };
const curto = (s) => nP(s).replace(/\s*\(.*\)\s*$/, '').slice(0, 20);
function trajeto(par) { const [o, d] = par.split('>'); return nP(o) + ' → ' + nP(d); }
function faixa(a, b) { return a === b ? H(a) : H(a) + '–' + H(b); }
function listaHoras(l) { return l.length === 1 ? H(l[0]) : l.slice(0, -1).map(H).join(', ') + ' ou ' + H(l[l.length - 1]); }

// Zona crítica em três partes: um título que diz que tipo de problema é, os números em etiquetas e uma frase
// com a consequência. O título muda conforme o caso, para os cartões não repetirem todos a mesma frase.
function partesZona(z, i = 0) {
  const o = nP(z.origem), d = nP(z.destino), SS = perfil.sentidos;
  const lista = (SS[z.sentido] && SS[z.sentido].lista) || [];
  const primeira = lista.length ? lista[0].m : z.hIni;
  const pico = perfil.picos.find((p) => z.hIni >= p.ini && z.hIni < p.fim);
  const periodo = z.hIni < 12 * 60 ? 'manhã' : z.hIni < 20 * 60 ? 'tarde' : 'noite';
  const idaJunta = z.sentido === 'Volta' && perfil.zonas.some((x) => x.sentido === 'Ida' && x.ini <= z.fim && x.fim >= z.ini);
  let titulo;
  if (idaJunta) titulo = 'A volta herda o atraso da ida';
  else if (z.sentido === 'Volta') titulo = 'O atraso nasce no regresso, à saída de ' + o;
  else if (z.hIni - primeira <= 60) titulo = 'O atraso nasce logo no arranque do serviço';
  else if (pico) titulo = 'O atraso nasce na ponta da ' + periodo;
  else titulo = 'Partida que se atrasa sem vir atrasada de trás';
  const chips = [
    'em ' + z.dias + ' de ' + perfil.dias + ' dias',
    plural(z.inicios, 'cascata', 'cascatas') + ' (' + pc(z.parte) + ' de todas)',
    z.atrasoPico ? 'atraso até +' + Math.round(z.atrasoPico) + ' min' : '',
    pico ? 'dentro do pico ' + H(pico.ini) + '–' + H(pico.fim) : '',
  ].filter(Boolean);
  const n = z.viagensTipica;
  let consequencia;
  if (n >= 3) consequencia = [
    'Sem folga, a mesma viatura arrasta o atraso pelas ' + (n - 1) + ' viagens seguintes e só o recupera depois das ' + H(z.ateTipico) + '.',
    'O atraso não se perde: acompanha a viatura nas ' + (n - 1) + ' viagens seguintes, até depois das ' + H(z.ateTipico) + '.',
    'São precisas mais ' + (n - 1) + ' viagens, até depois das ' + H(z.ateTipico) + ', para a viatura voltar ao horário.',
  ][perfil.zonas.filter((y) => y.viagensTipica >= 3).indexOf(z) % 3];
  else if (n === 2) consequencia = [
    'O atraso salta para a viagem seguinte da mesma viatura antes de se dissipar.',
    'A viatura ainda faz a viagem seguinte atrasada; só depois recupera.',
    'Contamina a viagem seguinte da mesma viatura e só aí se desfaz.',
  ][perfil.zonas.filter((y) => y.viagensTipica === 2).indexOf(z) % 3];
  else consequencia = 'Costuma ficar por aqui (cerca de ' + Math.round(z.atrasoInicial) + ' min), mas repete-se muitos dias.';
  if (z.sentido === 'Volta') consequencia += ' É a segunda metade da volta que sai de ' + d + ' às ' + faixa(z.ini, z.fim) + '.';
  return { titulo, chips, consequencia, partidas: 'Saídas de ' + o + ' às ' + listaHoras(z.lista) + ' → ' + d };
}

/* ---------- passo 1 ---------- */
function passo1() {
  const { linha } = S;
  if (!perfil || !perfil.lista.length) {
    $('vista').innerHTML = `<section class="card"><h2>Sem dados</h2><p class="sub">A linha ${linha} não tem viagens em dias úteis nos ficheiros carregados.</p></section>`;
    return;
  }
  const z = perfil.zonas, SS = perfil.sentidos;
  const todas = Object.values(SS).flatMap((s) => s.lista);
  const atrasadas = todas.reduce((t, o) => t + o.atrasadas, 0), total = todas.reduce((t, o) => t + o.n, 0);
  const cicloTxt = cic ? (cic.unica ? 'uma viatura de cada vez' : `${cic.ciclo} min com ${cic.viaturas} viaturas, partida de ${cic.intervalo} em ${cic.intervalo} min`) : 'não detetado';
  const picoTxt = perfil.picos.length ? perfil.picos.map((p) => `${H(p.ini)}–${H(p.fim)}`).join(' e ') : null;
  const frase = (picoTxt ? `Na linha <b>${linha}</b>, os atrasos concentram-se em <b>${picoTxt}</b> (${pc(perfil.picos.reduce((t, p) => t + p.parte, 0))} das viagens atrasadas). ` : `Na linha <b>${linha}</b>: `)
    + (z.length ? `As cascatas começam sobretudo em ${plural(z.length, 'zona crítica', 'zonas críticas')}: ${z.map((x) => `<b>${faixa(x.hIni, x.hFim)}</b> (${NOMES_S[x.sentido].toLowerCase()})`).join(', ')}.` : 'As cascatas não se concentram em partidas concretas.');
  const nomeS = Object.entries(SS).map(([k, s]) => `<b>${NOMES_S[k]}</b> = ${trajeto(s.par)}`).join(' · ');
  const dp = (s) => s.split('-').reverse().join('/');
  const nT = todas.length;
  $('vista').innerHTML = `
  <section class="card resumo">
    <div class="kick">Linha ${linha} · ${plural(perfil.dias, 'dia útil', 'dias úteis')} de ${dp(perfil.de)} a ${dp(perfil.ate)}</div>
    <p class="frase grande">${frase}</p>
    <div class="faixaKpi">
      <div><b>${pc(atrasadas / Math.max(1, total))}</b><span>das viagens chegam com mais de 10 min de atraso</span></div>
      <div><b class="${anat.porDia >= 1 ? 'mau' : ''}">${d1(anat.porDia)}</b><span>cascatas por dia</span></div>
      <div><b>${pc(anat.propaga)}</b><span>dos atrasos vêm da viagem anterior da mesma viatura</span></div>
      <div><b>${Math.round(anat.atrasoPico || 0)} min</b><span>atraso no pico de uma cascata típica</span></div>
    </div>
    <p class="nota" style="margin:10px 0 0">Ciclo da linha: ${cicloTxt}. Cascata = a mesma viatura chega atrasada (&gt;10 min) em 2 ou mais viagens seguidas e o atraso cresce. ${nomeS}. ${perfil.dePdf ? 'Partidas do horário em PDF.' : 'Partidas inferidas dos dados (junte o PDF para usar o horário oficial).'}</p>
  </section>

  <section class="card">
    <h2>As partidas, por ordem do dia</h2>
    <p class="sub">Cada barra é uma partida: a altura é a percentagem dos dias em que chega atrasada; a parte vermelha mostra quando é nessa partida que a cascata começa. <b>Clique numa barra</b> para ver tudo sobre essa partida.</p>
    <div class="grafDet">
      <div><div id="grafBox">${grafico()}</div>
        <div class="leg"><span><i style="background:#16a5c6"></i>ida, chega atrasada</span><span><i style="background:#7c6fd6"></i>volta, chega atrasada</span><span><i style="background:var(--red)"></i>a cascata começa aqui</span><span><i style="background:rgba(242,164,19,.22)"></i>período com mais atrasos</span><span><i style="background:rgba(239,63,54,.16)"></i>zona crítica</span></div></div>
      <div id="detPartida">${detalhePartida()}</div>
    </div>
  </section>

  <section class="card">
    <div class="cabCard"><div><h2>Atrasos por hora e sentido</h2><p class="sub" style="margin:0">Viagens que chegaram com mais de 10 min de atraso, somando os ${perfil.dias} dias, pela hora de partida.</p></div>
      <div class="seg" id="segMapa"><button data-v="n" class="${MAPA.modo === 'n' ? 'on' : ''}">Nº de viagens</button><button data-v="p" class="${MAPA.modo === 'p' ? 'on' : ''}">% das viagens</button></div></div>
    <div id="mapa">${mapaCalor()}</div>
  </section>

  <section class="card">
    <h2>Zonas críticas</h2>
    <p class="sub">Partidas seguidas onde as cascatas nascem muito mais vezes do que no resto do dia. São estas que o reforço deve proteger.</p>
    ${z.length ? '<div class="zonas2">' + z.map((x, i) => `<div class="zc">
      <div class="zt"><b>${faixa(x.hIni, x.hFim)}</b><span class="sent s${x.sentido}">${NOMES_S[x.sentido]}</span><span class="traj">${nP(x.origem)} → ${nP(x.destino)}</span></div>
      ${(() => { const p = partesZona(x, i); return `<h3 class="ztit">${p.titulo}</h3><div class="chips">${p.chips.map((c) => `<span>${c}</span>`).join('')}</div><p>${p.consequencia}</p><p class="nota">${p.partidas}.</p>`; })()}
    </div>`).join('') + '</div>' : '<div class="pos">Nenhuma partida se destaca da média.</div>'}
  </section>

  <section class="card tabsCard" id="cardDados">
    <nav class="tabsSub" id="tabsDados">
      <button data-a="tabela" class="${TODAS.aba !== 'todas' ? 'on' : ''}">Tabela de atrasos <small>${S.dados.viagens.filter((v) => v.linha === linha && v.tipoDia === S.tipo).length} viagens</small></button>
      <button data-a="todas" class="${TODAS.aba === 'todas' ? 'on' : ''}">Todas as partidas <small>${nT}</small></button>
    </nav>
    <div id="cardTabela" ${TODAS.aba === 'todas' ? 'hidden' : ''}>${Tabela.html()}</div>
    <div id="painelTodas" ${TODAS.aba === 'todas' ? '' : 'hidden'}>
      <p class="sub">Por hora de partida, nos dois sentidos. As marcadas como críticas são as que o reforço deve proteger.</p>
      <div class="deck" style="margin-bottom:10px"><div class="seg" id="segTodas">${['Todas', ...Object.keys(SS)].map((k) => `<button data-v="${k}" class="${TODAS.s === k ? 'on' : ''}">${k === 'Todas' ? 'Os dois sentidos' : NOMES_S[k]}</button>`).join('')}</div></div>
      <div class="rolo" id="todas">${tabelaTodas()}</div>
    </div>
  </section>`;
  $('segMapa').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; MAPA.modo = b.dataset.v; [...$('segMapa').children].forEach((x) => x.classList.toggle('on', x === b)); $('mapa').innerHTML = mapaCalor(); };
  $('segTodas').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; TODAS.s = b.dataset.v; [...$('segTodas').children].forEach((x) => x.classList.toggle('on', x === b)); $('todas').innerHTML = tabelaTodas(); };
  $('tabsDados').onclick = (e) => { const b = e.target.closest('button'); if (b) abaDados(b.dataset.a); };
  Tabela.ligar();
  ligarGrafico();
}

// separadores do cartão dos dados: "Tabela de atrasos" ou "Todas as partidas"
function abaDados(a) {
  TODAS.aba = a;
  if (!$('tabsDados')) return;
  [...$('tabsDados').children].forEach((x) => x.classList.toggle('on', x.dataset.a === a));
  $('cardTabela').hidden = a === 'todas'; $('painelTodas').hidden = a !== 'todas';
}

const TODAS = { s: 'Todas', aba: 'tabela' };
function tabelaTodas() {
  const SS = perfil.sentidos;
  const L = Object.entries(SS).filter(([k]) => TODAS.s === 'Todas' || TODAS.s === k).flatMap(([k, s]) => s.lista.map((o) => ({ ...o, s: k, par: s.par }))).sort((a, b) => a.m - b.m || a.s.localeCompare(b.s));
  return `<table class="tabela"><thead><tr><th>Partida</th><th>Sentido</th><th>Trajeto</th><th>Dias com atraso</th><th></th><th>Atraso típico</th><th>Cascatas nascidas</th><th></th></tr></thead><tbody>
    ${L.map((o) => `<tr class="${o.critica ? 'crit' : ''}"><td class="h">${H(o.m)}</td><td><span class="sent s${o.s}">${NOMES_S[o.s]}</span></td><td class="nota">${trajeto(o.par)}</td><td>${pc(o.pAtraso)}</td><td style="width:18%"><div class="barra"><i style="width:${Math.min(100, Math.round(o.pAtraso * 200))}%"></i></div></td><td>${o.atrasoTipico ? Math.round(o.atrasoTipico) + ' min' : '–'}</td><td>${o.inicios} <span class="nota">(${pc(o.pInicio)})</span></td><td>${o.critica ? '<span class="selo">CRÍTICA</span>' : ''}</td></tr>`).join('')}
    </tbody></table>`;
}

/* Gráfico em espelho: ida para cima, volta para baixo, no mesmo eixo de horas. Cada partida é clicável. */
const GRAF = { sel: null }; // { k: sentido, m: minuto }
function grafico() {
  const SS = perfil.sentidos, ks = Object.keys(SS), duas = ks.length > 1;
  const todas = ks.flatMap((k) => SS[k].lista);
  const t0 = Math.floor((Math.min(...todas.map((o) => o.m)) - 15) / 60) * 60, t1 = Math.ceil((Math.max(...todas.map((o) => o.m)) + 15) / 60) * 60;
  // m.t: faixa de cima só para os rótulos "mais atrasos"; gap: faixa do meio só para as horas
  const W = 760, m = { l: 112, r: 10, t: 30, b: duas ? 8 : 30 }, hh = duas ? 130 : 220, gap = duas ? 34 : 0, Ht = m.t + hh * (duas ? 2 : 1) + gap + m.b;
  const iw = W - m.l - m.r, x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
  const maxV = Math.max(0.2, ...todas.map((o) => o.pAtraso)) * 1.12;
  const eixo = m.t + hh; // linha da ida
  const yI = (v) => eixo - (v / maxV) * hh, yV = (v) => eixo + gap + (v / maxV) * hh;
  const iv = Math.min(...ks.map((k) => SS[k].intervalo)) || 15, slot = (iv / (t1 - t0)) * iw, bw = Math.max(3, slot * 0.62);
  const fundo = m.t + hh * (duas ? 2 : 1) + gap;
  let s = `<svg class="graf grafp" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Percentagem de dias com atraso por partida, ida e volta">`;
  // 1. grelha (por baixo de tudo); os valores ficam à esquerda, fora da área das barras
  const passo = maxV > 0.6 ? 0.2 : 0.1;
  for (let v = passo; v < maxV; v += passo) {
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${yI(v)}" y2="${yI(v)}" stroke="#e8eff2"/><text x="${m.l - 8}" y="${yI(v) + 4}" text-anchor="end" font-size="10.5" fill="#7d93a1">${Math.round(v * 100)}%</text>`;
    if (duas) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${yV(v)}" y2="${yV(v)}" stroke="#e8eff2"/><text x="${m.l - 8}" y="${yV(v) + 4}" text-anchor="end" font-size="10.5" fill="#7d93a1">${Math.round(v * 100)}%</text>`;
  }
  // 2. períodos com mais atrasos: faixa clara e rótulo na faixa de cima, acima da área das barras
  for (const p of perfil.picos) {
    const xa = x(p.ini), xb = x(p.fim);
    s += `<rect x="${xa}" y="${m.t}" width="${xb - xa}" height="${fundo - m.t}" fill="rgba(242,164,19,.12)" pointer-events="none"/>`
      + `<rect x="${xa}" y="${m.t - 20}" width="${xb - xa}" height="16" rx="8" fill="#fdebc6" pointer-events="none"/><text x="${(xa + xb) / 2}" y="${m.t - 8}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#8a5700" pointer-events="none">mais atrasos ${H(p.ini)}–${H(p.fim)}</text>`;
  }
  // 3. zonas críticas, na metade do sentido respetivo
  for (const z of perfil.zonas) {
    const cima = z.sentido !== 'Volta' || !duas, y0 = cima ? m.t : eixo + gap;
    s += `<rect x="${x(z.hIni) - slot / 2}" y="${y0}" width="${x(z.hFim) - x(z.hIni) + slot}" height="${hh}" fill="rgba(239,63,54,.10)" stroke="rgba(239,63,54,.35)" stroke-dasharray="3 3" rx="4" pointer-events="none"/>`;
  }
  // 4. barras + área de clique (a coluna toda da partida, para ser fácil acertar)
  const barras = (k, y, cor, baixo) => SS[k].lista.forEach((o) => {
    const bx = x(o.m) - bw / 2, h = Math.abs(y(o.pAtraso) - y(0)), hi = Math.abs(y(Math.min(o.pInicio, o.pAtraso)) - y(0));
    const top = baixo ? y(0) : y(o.pAtraso), sel = GRAF.sel && GRAF.sel.k === k && GRAF.sel.m === o.m;
    if (h >= 0.5) s += `<rect x="${bx}" y="${top}" width="${bw}" height="${h}" fill="${cor}" rx="1.5" pointer-events="none"/>`;
    if (o.pInicio > 0) s += `<rect x="${bx}" y="${baixo ? y(0) : y(0) - hi}" width="${bw}" height="${hi}" fill="#ef3f36" rx="1.5" pointer-events="none"/>`;
    if (sel) s += `<rect x="${x(o.m) - slot / 2}" y="${baixo ? eixo + gap : m.t}" width="${slot}" height="${hh}" fill="none" stroke="#07506a" stroke-width="1.5" rx="3" pointer-events="none"/>`;
    s += `<rect class="hit" data-k="${k}" data-m="${o.m}" x="${x(o.m) - slot / 2}" y="${baixo ? eixo + gap : m.t}" width="${slot}" height="${hh}" fill="transparent"><title>${NOMES_S[k]} ${H(o.m)}: atrasada em ${pc(o.pAtraso)} dos dias. Clique para ver o detalhe.</title></rect>`;
  });
  barras(ks[0], yI, '#16a5c6', false);
  if (duas) barras(ks[1], yV, '#7c6fd6', true);
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${eixo}" y2="${eixo}" stroke="#9fb3bf"/>`;
  if (duas) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${eixo + gap}" y2="${eixo + gap}" stroke="#9fb3bf"/>`;
  // 5. rótulos dos sentidos
  const rot = (k, y) => { const [o, d] = SS[k].par.split('>'); return `<text x="6" y="${y}" font-size="12.5" font-weight="800" fill="#07506a">${NOMES_S[k]}</text><text x="6" y="${y + 15}" font-size="10.5" fill="#6b8292">${curto(o)} →</text><text x="6" y="${y + 28}" font-size="10.5" fill="#6b8292">${curto(d)}</text>`; };
  s += rot(ks[0], m.t + 22);
  if (duas) s += rot(ks[1], eixo + gap + 22);
  // 6. horas: na faixa do meio, com marcas curtas só nas bordas (não atravessam o texto)
  const yh = duas ? eixo + gap / 2 + 4 : Ht - 10;
  for (let t = t0; t <= t1; t += 60) {
    s += `<line x1="${x(t)}" x2="${x(t)}" y1="${eixo}" y2="${eixo + 5}" stroke="#9fb3bf"/>`;
    if (duas) s += `<line x1="${x(t)}" x2="${x(t)}" y1="${eixo + gap - 5}" y2="${eixo + gap}" stroke="#9fb3bf"/>`;
    s += `<text x="${x(t)}" y="${yh}" text-anchor="middle" font-size="11" font-weight="600" fill="#3d5868">${String(t / 60).padStart(2, '0')}h</text>`;
  }
  return s + '</svg>';
}

// Painel com tudo sobre uma partida (aparece por baixo do gráfico ao clicar numa barra).
function detalhePartida() {
  if (!GRAF.sel) return '<p class="nota">Clique numa barra para ver o detalhe dessa partida; a tabela de atrasos, mais abaixo, passa a mostrar só as viagens dessa partida.</p>';
  const { k, m } = GRAF.sel, Sx = perfil.sentidos[k], o = Sx && Sx.lista.find((x) => x.m === m);
  if (!o) return '';
  const [or, de] = Sx.par.split('>');
  const zona = perfil.zonas.find((z) => z.sentido === k && m >= z.hIni && m <= z.hFim);
  const med = (a) => { if (!a.length) return 0; const s = [...a].sort((p, q) => p - q); return s[Math.floor((s.length - 1) / 2)]; };
  const max = o.atrasos.length ? Math.max(...o.atrasos) : 0;
  const cs = o.casc || [];
  const lista = Sx.lista, i = lista.indexOf(o), ant = lista[i - 1], seg = lista[i + 1];
  const viz = (p, t) => p ? `${t} ${H(p.m)}: ${pc(p.pAtraso)}` : '';
  return `<div class="det">
    <div class="dt"><span class="sent s${k}">${NOMES_S[k]}</span><b>${H(m)}</b><span>${nP(or)} → ${nP(de)}</span>${o.critica ? '<span class="selo">CRÍTICA</span>' : ''}${zona ? `<span class="nota">na zona crítica ${faixa(zona.hIni, zona.hFim)}</span>` : ''}<button class="mini" id="detFechar" title="Fechar">✕</button></div>
    <div class="dk">
      <div><b>${o.atrasadas} de ${o.n}</b><span>dias chegou com mais de 10 min de atraso (${pc(o.pAtraso)})</span></div>
      <div><b>${o.atrasadas ? Math.round(o.atrasoTipico) + ' min' : '–'}</b><span>atraso típico nesses dias${o.atrasadas ? ` · máximo ${Math.round(max)} min` : ''}</span></div>
      <div><b>${o.inicios}</b><span>${o.inicios === 1 ? 'cascata nasceu' : 'cascatas nasceram'} nesta partida (${pc(o.pInicio)} dos dias)</span></div>
      ${cs.length ? `<div><b>${med(cs.map((c) => c.viagens))} viagens</b><span>numa cascata típica daqui: chega a ${Math.round(med(cs.map((c) => c.atrasoPico)))} min e só acaba na partida das ${H(med(cs.map((c) => c.fim)))}</span></div>` : ''}
    </div>
    <p class="nota">${[viz(ant, 'Partida anterior'), viz(seg, 'seguinte')].filter(Boolean).join(' · ')}${ant || seg ? ' (dias com atraso).' : ''} <a href="#cardDados" id="detTab">Ver estas viagens na tabela ↓</a></p>
  </div>`;
}

// Clique numa barra: mostra o detalhe e filtra a tabela de atrasos por essa partida.
function ligarGrafico() {
  const svg = document.querySelector('svg.grafp');
  if (!svg) return;
  const atualizar = () => {
    $('grafBox').innerHTML = grafico(); $('detPartida').innerHTML = detalhePartida(); ligarGrafico();
  };
  svg.onclick = (e) => {
    const h = e.target.closest('.hit');
    if (!h) return;
    const k = h.dataset.k, m = +h.dataset.m;
    GRAF.sel = GRAF.sel && GRAF.sel.k === k && GRAF.sel.m === m ? null : { k, m };
    if (GRAF.sel) {
      const [or, de] = perfil.sentidos[k].par.split('>');
      Tabela.porPartida(k === '?' ? '' : k, or, de, m);
      abaDados('tabela');
    } else Tabela.porPartida(null);
    atualizar();
  };
  if ($('detFechar')) $('detFechar').onclick = () => { GRAF.sel = null; Tabela.porPartida(null); atualizar(); };
}

/* Mapa de calor hora × sentido (como o do colega). */
const MAPA = { modo: 'n' };
function mapaCalor() {
  const g = perfil.grelha, ks = ['Ida', 'Volta'].filter((k) => g[k]);
  if (!ks.length) return '<div class="pos">Os dados não indicam o sentido das viagens.</div>';
  const hs = [...new Set(ks.flatMap((k) => Object.keys(g[k]).map(Number)))].sort((a, b) => a - b);
  const val = (k, h) => { const o = g[k][h]; if (!o) return null; return MAPA.modo === 'n' ? o.atrasadas : (o.n ? o.atrasadas / o.n : 0); };
  const mx = Math.max(1e-9, ...ks.flatMap((k) => hs.map((h) => val(k, h) || 0)));
  // escala sequencial (branco → vermelho escuro), com texto branco nas células escuras
  const cor = (v) => {
    const t = Math.pow(v / mx, 0.85), A = [255, 245, 240], B = [252, 146, 114], C = [103, 0, 13];
    const mix = (p, q, f) => p.map((c, i) => Math.round(c + (q[i] - c) * f));
    const c = t < 0.5 ? mix(A, B, t / 0.5) : mix(B, C, (t - 0.5) / 0.5);
    return { bg: `rgb(${c.join(',')})`, fg: t > 0.55 ? '#fff' : '#3a1d1a' };
  };
  const txt = (v) => v == null ? '' : MAPA.modo === 'n' ? v : Math.round(v * 100) + '%';
  return `<div class="mapa" style="grid-template-columns:110px repeat(${hs.length},minmax(30px,1fr))">
    <div></div>${hs.map((h) => `<div class="mh">${h}h</div>`).join('')}
    ${ks.map((k) => `<div class="ms"><b>${NOMES_S[k]}</b><span>${trajeto(perfil.sentidos[k] ? perfil.sentidos[k].par : '>')}</span></div>${hs.map((h) => { const v = val(k, h), c = v == null ? { bg: '#f6f9fb', fg: '#999' } : cor(v), o = g[k][h]; return `<div class="mc" style="background:${c.bg};color:${c.fg}" title="${NOMES_S[k]} ${h}h: ${o ? o.atrasadas + ' de ' + o.n + ' viagens atrasadas' : 'sem viagens'}">${txt(v)}</div>`; }).join('')}`).join('')}
  </div>`;
}

/* atalho de desenvolvimento: ?demo (linha 74) ou ?demo=87 carrega os dados da pasta dados/ quando servido por http */
if (location.search.includes('demo') && location.protocol.startsWith('http')) {
  const DEMO = {
    74: ['../dados/linha74-set-nov2026/', 'rep3_20260914_20261113.csv', 'rep20_20260914_20261113.csv', '74h.pdf'],
    87: ['../dados/linha87-out2026-v2/', 'rep3.csv', 'rep20.csv', '87h.pdf'],
    2: ['../dados/linha02-teste/', 'rep3.csv', 'rep20.csv', '02h.pdf'],
  };
  const [p, f3, f20, pdf] = DEMO[new URLSearchParams(location.search).get('demo')] || DEMO[74];
  Promise.all([f3, f20].map((u) => fetch(encodeURI(p + u)).then((r) => r.text())))
    .then(([a, b]) => iniciar(Analise.analisar(a, b)))
    .then(() => fetch(p + pdf).then((r) => r.arrayBuffer()))
    .then((buf) => lerPdfs([buf])).catch((e) => { $('erro').textContent = e.message; });
}
