// Motor de análise de atrasos: funciona no browser e em Node.
(function (root) {
  const LIMIAR = 10; // minutos; atrasos <= LIMIAR são ignorados
  const MAX_ATRASO = 180; // minutos; ocorrências com atrasos acima disto são excluídas

  function parseCSV(texto) {
    const linhas = texto.replace(/^﻿/, '').trim().split(/\r?\n/);
    const dividir = (l) => {
      const o = []; let c = '', q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === ',' && !q) { o.push(c); c = ''; }
        else c += ch;
      }
      o.push(c);
      return o;
    };
    const cab = dividir(linhas[0]);
    return linhas.slice(1).map((l) => {
      const v = dividir(l); const o = {};
      cab.forEach((h, i) => (o[h] = v[i]));
      return o;
    });
  }

  const minutos = (s) => {
    if (!/^\d+:\d+$/.test(s || '')) return null;
    const [a, b] = s.split(':').map(Number);
    return a * 60 + b;
  };
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

  // Feriados nacionais (Portugal) + feriado municipal de Braga (24/06), 2026.
  const FERIADOS = new Set([
    '2026-01-01', '2026-04-03', '2026-04-05', '2026-04-25', '2026-05-01', '2026-06-04',
    '2026-06-10', '2026-06-24', '2026-08-15', '2026-10-05', '2026-11-01', '2026-12-01',
    '2026-12-08', '2026-12-25',
  ]);
  function tipoDia(data) {
    const d = new Date(data + 'T12:00:00').getDay();
    return d === 0 || d === 6 || FERIADOS.has(data) ? 'fds' : 'util';
  }

  // Junta o relatório de serviços (universo de viagens) com o de atrasos (Pontualidade).
  function construirViagens(atrasos, servicos) {
    const chave = (d, l, h, c) => [d, l, h, String(c).replace(/^0+/, '')].join('|');
    const atrasoPorChave = new Map();
    for (const r of atrasos) {
      const k = chave(r.Data, r.Linha, r['Hora inicial do Horário'], r.Chapa);
      const min = Number(r.Pontualidade) / 60;
      if (!atrasoPorChave.has(k) || atrasoPorChave.get(k) < min) atrasoPorChave.set(k, min);
    }
    const viagens = new Map();
    for (const r of servicos) {
      if (r['Duração Prevista'] === '00:00') continue; // registos fora do horário
      const k = chave(r.Data, r.Linha, r['Hora inicial Prevista'], r.Chapa);
      if (viagens.has(k)) continue;
      viagens.set(k, {
        data: r.Data, linha: r.Linha, chapa: String(r.Chapa).replace(/^0+/, ''),
        viatura: r.Viatura, motorista: r.Motorista,
        ini: minutos(r['Hora inicial Prevista']), dur: minutos(r['Duração Prevista']),
        tipoServico: r['Tipo de serviço'],
        origem: r.Origem.toUpperCase(), destino: r.Destino.toUpperCase(),
        passageiros: Number(r['Passageiros']) || 0,
        atraso: 0, soNosAtrasos: false,
      });
    }
    // viagens que só existem no relatório de atrasos
    for (const r of atrasos) {
      const k = chave(r.Data, r.Linha, r['Hora inicial do Horário'], r.Chapa);
      if (!viagens.has(k)) {
        viagens.set(k, {
          data: r.Data, linha: r.Linha, chapa: String(r.Chapa).replace(/^0+/, ''),
          viatura: r.Viatura, motorista: r.Motorista,
          ini: minutos(r['Hora inicial do Horário']), dur: null, tipoServico: '?',
          origem: (r.Origem || '').toUpperCase(), destino: (r.Destino || '').toUpperCase(),
          passageiros: 0, atraso: 0, soNosAtrasos: true,
        });
      }
    }
    // sentido (Ida/Volta): o rep3 traz a Direção; o rep20 não, por isso usa-se o sentido mais comum de cada par origem>destino
    const dir = new Map();
    for (const r of atrasos) {
      if (!r['Direção']) continue;
      const p = r.Linha + '|' + (r.Origem || '').toUpperCase() + '>' + (r.Destino || '').toUpperCase();
      const c = dir.get(p) || dir.set(p, {}).get(p); c[r['Direção']] = (c[r['Direção']] || 0) + 1;
    }
    const sentidoDe = (v) => {
      const c = dir.get(v.linha + '|' + v.origem + '>' + v.destino);
      if (c) return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
      // par sem registo no rep3: procura um par com a mesma origem ou o mesmo destino
      for (const [p, cc] of dir) { const [l, od] = p.split('|'), [o, d] = od.split('>'); if (l === v.linha && (o === v.origem || d === v.destino)) return Object.entries(cc).sort((a, b) => b[1] - a[1])[0][0]; }
      return '?';
    };
    for (const [k, v] of viagens) {
      v.sentido = sentidoDe(v);
      v.atraso = atrasoPorChave.get(k) || 0;
      v.tipoDia = tipoDia(v.data);
      v.atrasada = v.atraso > LIMIAR;
    }
    return [...viagens.values()].filter((v) => v.ini != null);
  }

  // Ocorrências (acidentes, trânsito parado): uma sequência de atrasos seguidos da mesma viatura que
  // inclui algum atraso acima de MAX_ATRASO não é para considerar, nem o antes nem o depois.
  function removerOcorrencias(viagens) {
    const grupos = new Map();
    for (const v of viagens) {
      const k = v.data + '|' + v.linha + '|' + v.viatura;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(v);
    }
    const fora = new Set();
    for (const g of grupos.values()) {
      g.sort((a, b) => a.ini - b.ini);
      let i = 0;
      while (i < g.length) {
        if (g[i].atraso <= LIMIAR) { i++; continue; }
        let j = i;
        while (j + 1 < g.length && g[j + 1].atraso > LIMIAR) j++;
        if (g.slice(i, j + 1).some((t) => t.atraso > MAX_ATRASO)) for (let x = i; x <= j; x++) fora.add(g[x]);
        i = j + 1;
      }
    }
    return { viagens: viagens.filter((v) => !fora.has(v)), excluidas: fora.size, diasAfetados: new Set([...fora].map((v) => v.data + '|' + v.linha)).size };
  }

  // Cascata: na mesma viatura e dia, 2+ viagens seguidas com atraso > LIMIAR e a crescer.
  function detetarCascatas(viagens) {
    const grupos = new Map();
    for (const v of viagens) {
      const k = v.data + '|' + v.linha + '|' + v.viatura;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(v);
    }
    const cascatas = [];
    for (const g of grupos.values()) {
      g.sort((a, b) => a.ini - b.ini);
      let i = 0;
      while (i < g.length) {
        if (!g[i].atrasada) { i++; continue; }
        let j = i;
        while (j + 1 < g.length && g[j + 1].atrasada) j++;
        const corrida = g.slice(i, j + 1);
        if (corrida.length >= 2 && corrida[corrida.length - 1].atraso > corrida[0].atraso) {
          const pico = corrida.reduce((m, v) => (v.atraso > m.atraso ? v : m), corrida[0]);
          const c = {
            data: g[i].data, linha: g[i].linha, chapa: g[i].chapa, viatura: g[i].viatura,
            tipoDia: g[i].tipoDia, inicio: corrida[0].ini, fim: corrida[corrida.length - 1].ini,
            atrasoInicial: corrida[0].atraso, atrasoPico: pico.atraso, viagens: corrida.length,
          };
          corrida.forEach((v) => (v.emCascata = true));
          corrida[0].inicioCascata = true;
          cascatas.push(c);
        }
        i = j + 1;
      }
    }
    return cascatas;
  }

  const mediana = (a) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor((s.length - 1) / 2)];
  };

  function resumir(viagens, cascatas) {
    const out = {};
    const linhas = [...new Set(viagens.map((v) => v.linha))].sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }));
    for (const linha of linhas) {
      for (const td of ['util', 'fds']) {
        const vs = viagens.filter((v) => v.linha === linha && v.tipoDia === td);
        if (!vs.length) continue;
        const porHora = {};
        for (const v of vs) {
          const h = Math.floor(v.ini / 60);
          const o = (porHora[h] = porHora[h] || { n: 0, atrasadas: 0, somaAtraso: 0, inicios: 0 });
          o.n++;
          if (v.atrasada) { o.atrasadas++; o.somaAtraso += v.atraso; }
          if (v.inicioCascata) o.inicios++;
        }
        const porSlot = {};
        for (const v of vs) {
          const o = (porSlot[v.ini] = porSlot[v.ini] || { n: 0, atrasadas: 0, inicios: 0, atrasos: [] });
          o.n++;
          if (v.atrasada) { o.atrasadas++; o.atrasos.push(v.atraso); }
          if (v.inicioCascata) o.inicios++;
        }
        const casc = cascatas.filter((c) => c.linha === linha && c.tipoDia === td);
        const dias = new Set(vs.map((v) => v.data)).size;
        const porChapa = {};
        for (const v of vs) {
          const o = (porChapa[v.chapa] = porChapa[v.chapa] || { n: 0, atrasadas: 0 });
          o.n++; if (v.atrasada) o.atrasadas++;
        }
        out[linha + '|' + td] = {
          linha, tipoDia: td, dias, viagens: vs.length,
          atrasadas: vs.filter((v) => v.atrasada).length,
          cascatas: casc.length,
          porHora, porSlot, porChapa,
          medianaAtrasoAtrasadas: mediana(vs.filter((v) => v.atrasada).map((v) => v.atraso)),
        };
      }
    }
    return out;
  }

  // Descobre qual é o relatório de atrasos e qual o de serviços pelos cabeçalhos.
  function tipoRelatorio(texto) {
    const cab = texto.replace(/^﻿/, '').split(/\r?\n/, 1)[0];
    if (cab.includes('Hora inicial do Horário')) return 'atrasos';
    if (cab.includes('Hora inicial Prevista')) return 'servicos';
    return null;
  }

  function analisar(texto1, texto2) {
    const t = { [tipoRelatorio(texto1)]: texto1, [tipoRelatorio(texto2)]: texto2 };
    if (!t.atrasos || !t.servicos) throw new Error('É preciso um relatório de atrasos (rep3) e um de serviços (rep20).');
    const textoAtrasos = t.atrasos, textoServicos = t.servicos;
    const bruto = construirViagens(parseCSV(textoAtrasos), parseCSV(textoServicos));
    const { viagens, excluidas, diasAfetados } = removerOcorrencias(bruto);
    const cascatas = detetarCascatas(viagens);
    return { viagens, cascatas, resumo: resumir(viagens, cascatas), limiar: LIMIAR, ocorrencias: { excluidas, diasAfetados, maxAtraso: MAX_ATRASO } };
  }

  // Nomes como aparecem no horário ao público (os dados usam por vezes o nome da paragem técnica).
  const ALIAS = { 'ANTÓNIO MENICI MALHEIRO': 'Camélias', 'CENTRAL I': 'Av. Central I', 'ROTUNDA ESTAÇÃO II': 'Estação CF' };
  function nomeParagem(s) {
    if (!s) return '';
    if (ALIAS[s]) return ALIAS[s];
    return s.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/ (De|Da|Do|Dos|Das|E) /g, (m) => m.toLowerCase())
      .replace(/\b(Ii|Iii|Iv|Vi|Vii|Xxi)\b/g, (m) => m.toUpperCase()); // numerais romanos (João XXI, D Maria II)
  }

  const api = { nomeParagem, removerOcorrencias, analisar, parseCSV, construirViagens, detetarCascatas, resumir, hhmm, tipoDia, LIMIAR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Analise = api;
})(typeof window !== 'undefined' ? window : globalThis);
