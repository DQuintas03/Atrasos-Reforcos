// Escreve ficheiros Excel (.xlsx) sem bibliotecas externas: cores de fundo, negrito, cor e tamanho do texto, horas
// em h:mm, percentagens, larguras, painel fixo, impressão em A4 e gráficos nativos do Excel. Browser e Node.
//
// livro = [{ nome, colunas: [largura...], fixar: linhas, linhas: [[celula...]...], juntar: ['A1:F1'], alturas: {linha0: pt},
//            filtro: 'A2:J9', imprimir: { paisagem, titulos: [r1, r2] (linhas 1-based repetidas), quebras: [linha 1-based...] },
//            rodape: 'texto', graficos: [grafico...] }]
// celula = valor simples (texto/número) ou { v, hora, pct, d1, fundo: 'FFF200', cor: 'C00000', negrito, tam, centro,
//            borda, vertical, quebra }
// grafico = { tipo: 'coluna'|'barra'|'linha', titulo, eixoY, empilhado, cat: { c, r0, r1 }, series: [{ c, nome, cor }],
//            pos: { c0, r0, c1, r1 } }  (colunas e linhas 0-based, nas linhas da própria folha)
(function (root) {
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const utf8 = (s) => new TextEncoder().encode(s);

  // ZIP sem compressão (método "store"), suficiente para o Excel.
  function zip(ficheiros) {
    const partes = [], central = []; let pos = 0;
    for (const f of ficheiros) {
      const nome = utf8(f.nome), dados = utf8(f.texto), crc = crc32(dados);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
      loc.setUint16(10, 0, true); loc.setUint16(12, 0x21, true); loc.setUint32(14, crc, true);
      loc.setUint32(18, dados.length, true); loc.setUint32(22, dados.length, true); loc.setUint16(26, nome.length, true); loc.setUint16(28, 0, true);
      partes.push(new Uint8Array(loc.buffer), nome, dados);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, 0, true); cen.setUint16(14, 0x21, true); cen.setUint32(16, crc, true); cen.setUint32(20, dados.length, true); cen.setUint32(24, dados.length, true);
      cen.setUint16(28, nome.length, true); cen.setUint32(42, pos, true);
      central.push(new Uint8Array(cen.buffer), nome);
      pos += 30 + nome.length + dados.length;
    }
    const tamCentral = central.reduce((t, x) => t + x.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, ficheiros.length, true); fim.setUint16(10, ficheiros.length, true);
    fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
    const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
    const out = new Uint8Array(tudo.reduce((t, x) => t + x.length, 0)); let o = 0;
    for (const x of tudo) { out.set(x, o); o += x.length; }
    return out;
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const letra = (c) => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
  const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart', NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  // Gráfico nativo (DrawingML). Os valores vão também em cache, para o Excel os mostrar logo ao abrir.
  function xmlGrafico(g, folha, nomeFolha) {
    const ref = (c, r0, r1) => `'${nomeFolha.replace(/'/g, "''")}'!$${letra(c)}$${r0 + 1}:$${letra(c)}$${r1 + 1}`;
    const val = (r, c) => { const x = (folha.linhas[r] || [])[c]; return x != null && typeof x === 'object' ? x.v : x; };
    const n = g.cat.r1 - g.cat.r0 + 1;
    const cats = Array.from({ length: n }, (_, i) => val(g.cat.r0 + i, g.cat.c));
    const txt = (t, sz, b) => `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b ? 1 : 0}"/></a:pPr><a:r><a:rPr lang="pt-PT" sz="${sz}" b="${b ? 1 : 0}"/><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx>`;
    const linha = g.tipo === 'linha';
    const series = g.series.map((s, i) => {
      const vs = Array.from({ length: n }, (_, k) => val(g.cat.r0 + k, s.c));
      const cor = s.cor || ['16A5C6', '7C6FD6', 'EF3F36', 'F2A413'][i % 4];
      const sp = linha ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>`
        : `<c:spPr><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`;
      const nome = s.nome != null ? s.nome : val(g.cat.r0 - 1, s.c);
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(nome == null ? 'Série ' + (i + 1) : nome)}</c:v></c:tx>${sp}`
        + `<c:cat><c:strRef><c:f>${esc(ref(g.cat.c, g.cat.r0, g.cat.r1))}</c:f><c:strCache><c:ptCount val="${n}"/>${cats.map((v, k) => (v == null || v === '' ? '' : `<c:pt idx="${k}"><c:v>${esc(v)}</c:v></c:pt>`)).join('')}</c:strCache></c:strRef></c:cat>`
        + `<c:val><c:numRef><c:f>${esc(ref(s.c, g.cat.r0, g.cat.r1))}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vs.map((v, k) => (typeof v === 'number' && isFinite(v) ? `<c:pt idx="${k}"><c:v>${v}</c:v></c:pt>` : '')).join('')}</c:numCache></c:numRef></c:val>`
        + (linha ? '<c:smooth val="0"/>' : '') + '</c:ser>';
    }).join('');
    const corpo = linha
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="101"/><c:axId val="102"/></c:lineChart>`
      : `<c:barChart><c:barDir val="${g.tipo === 'barra' ? 'bar' : 'col'}"/><c:grouping val="${g.empilhado ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${series}<c:gapWidth val="${g.empilhado ? 50 : 80}"/>${g.empilhado ? '<c:overlap val="100"/>' : ''}<c:axId val="101"/><c:axId val="102"/></c:barChart>`;
    const eixoCor = '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="BFC9CF"/></a:solidFill></a:ln></c:spPr>';
    const rotulos = '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="44546A"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="pt-PT"/></a:p></c:txPr>';
    const barra = g.tipo === 'barra';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>`
      + (g.titulo ? `<c:title>${txt(g.titulo, 1200, true)}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>')
      + `<c:plotArea><c:layout/>${corpo}`
      + `<c:catAx><c:axId val="101"/><c:scaling><c:orientation val="${barra ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${barra ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${eixoCor}${rotulos}<c:crossAx val="102"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
      + `<c:valAx><c:axId val="102"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${barra ? 't' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E3E9EC"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>`
      + (g.eixoY ? `<c:title>${txt(g.eixoY, 900, false)}<c:overlay val="0"/></c:title>` : '')
      + `<c:numFmt formatCode="${g.pct ? '0%' : 'General'}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${rotulos}<c:crossAx val="101"/><c:crosses val="${barra ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
      + `</c:plotArea>${g.series.length > 1 ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
      + '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:chartSpace>';
  }

  function xmlDesenho(gs, primeiroId) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}">`
      + gs.map((g, i) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${g.pos.c0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.pos.r0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${g.pos.c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.pos.r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
        + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${primeiroId + i + 1}" name="Gráfico ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>`
        + `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join('')
      + '</xdr:wsDr>';
  }

  function criar(livro) {
    // estilos: cada combinação passa a um índice de cellXfs
    const fundos = ['none', 'gray125'], fontes = [{ cor: null, negrito: false, tam: 11 }], xfs = ['0|0|0|0|0|0|0'], idx = new Map([['0|0|0|0|0|0|0', 0]]);
    const estilo = (c) => {
      if (c == null || typeof c !== 'object') return 0;
      let f = 0; if (c.fundo) { const k = fundos.indexOf(c.fundo); f = k >= 0 ? k : fundos.push(c.fundo) - 1; }
      const tam = c.tam || 11;
      let fo = fontes.findIndex((x) => x.cor === (c.cor || null) && x.negrito === !!c.negrito && x.tam === tam);
      if (fo < 0) fo = fontes.push({ cor: c.cor || null, negrito: !!c.negrito, tam }) - 1;
      const fmt = c.hora ? 164 : c.pct ? 9 : c.d1 ? 165 : 0;
      const chave = [f, fo, c.centro ? 1 : 0, fmt, c.borda ? 1 : 0, c.vertical ? 1 : 0, c.quebra ? 1 : 0].join('|');
      if (!idx.has(chave)) { idx.set(chave, xfs.length); xfs.push(chave); }
      return idx.get(chave);
    };
    const nomesBrutos = livro.map((f, i) => String(f.nome || 'Folha ' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    const nomes = nomesBrutos.map(esc);
    const extra = []; // desenhos e gráficos
    const tipos = [];
    let nGraf = 0, nDes = 0;
    const definidos = [];
    const folhas = livro.map((f, fi) => {
      const linhas = f.linhas.map((l, r) => {
        const cs = l.map((c, k) => {
          if (c == null || c === '') return '';
          const v = typeof c === 'object' ? c.v : c, s = estilo(c), ref = letra(k) + (r + 1);
          if (v == null || v === '') return s ? `<c r="${ref}" s="${s}"/>` : '';
          if (typeof c === 'object' && c.hora && typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v / 1440}</v></c>`;
          if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
          return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        }).join('');
        const alt = f.alturas && f.alturas[r] ? ` ht="${f.alturas[r]}" customHeight="1"` : '';
        return `<row r="${r + 1}"${alt}>${cs}</row>`;
      }).join('');
      const im = f.imprimir || {};
      const cols = f.colunas ? `<cols>${f.colunas.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
      const vista = f.fixar ? `<sheetView workbookViewId="0"${f.semGrelha ? ' showGridLines="0"' : ''}><pane ySplit="${f.fixar}" topLeftCell="A${f.fixar + 1}" activePane="bottomLeft" state="frozen"/></sheetView>` : `<sheetView workbookViewId="0"${f.semGrelha ? ' showGridLines="0"' : ''}/>`;
      const junt = f.juntar && f.juntar.length ? `<mergeCells count="${f.juntar.length}">${f.juntar.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      const filtro = f.filtro ? `<autoFilter ref="${f.filtro}"/>` : '';
      if (f.filtro) definidos.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${fi}" hidden="1">'${nomes[fi].replace(/'/g, "''")}'!${f.filtro.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>`);
      if (im.titulos) definidos.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${fi}">'${nomes[fi].replace(/'/g, "''")}'!$${im.titulos[0]}:$${im.titulos[1]}</definedName>`);
      // impressão: A4 (paperSize 9), ajustado à largura da página, rodapé com o nome e o número de página
      const pagina = '<printOptions horizontalCentered="1"/><pageMargins left="0.45" right="0.45" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
        + `<pageSetup paperSize="9" orientation="${im.paisagem ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>`
        + `<headerFooter><oddFooter>${esc('&L&8' + (f.rodape || '') + '&R&8Página &P de &N')}</oddFooter></headerFooter>`;
      const quebras = im.quebras && im.quebras.length ? `<rowBreaks count="${im.quebras.length}" manualBreakCount="${im.quebras.length}">${im.quebras.map((r) => `<brk id="${r - 1}" max="16383" man="1"/>`).join('')}</rowBreaks>` : '';
      let desenho = '', rels = null;
      if (f.graficos && f.graficos.length) {
        nDes++;
        const ids = f.graficos.map(() => ++nGraf);
        f.graficos.forEach((g, i) => {
          extra.push({ nome: `xl/charts/chart${ids[i]}.xml`, texto: xmlGrafico(g, f, nomesBrutos[fi]) });
          tipos.push(`<Override PartName="/xl/charts/chart${ids[i]}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        });
        extra.push({ nome: `xl/drawings/drawing${nDes}.xml`, texto: xmlDesenho(f.graficos, 1) });
        extra.push({ nome: `xl/drawings/_rels/drawing${nDes}.xml.rels`, texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ids.map((id, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/chart" Target="../charts/chart${id}.xml"/>`).join('')}</Relationships>` });
        tipos.push(`<Override PartName="/xl/drawings/drawing${nDes}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
        rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/drawing" Target="../drawings/drawing${nDes}.xml"/></Relationships>`;
        desenho = '<drawing r:id="rId1"/>';
      }
      if (rels) extra.push({ nome: `xl/worksheets/_rels/sheet${fi + 1}.xml.rels`, texto: rels });
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews>${vista}</sheetViews>${cols}<sheetData>${linhas}</sheetData>${filtro}${junt}${pagina}${quebras}${desenho}</worksheet>`;
    });
    const fills = fundos.map((f) => (f === 'none' || f === 'gray125') ? `<fill><patternFill patternType="${f}"/></fill>` : `<fill><patternFill patternType="solid"><fgColor rgb="FF${f}"/><bgColor indexed="64"/></patternFill></fill>`).join('');
    const fonts = fontes.map((f) => `<font>${f.negrito ? '<b/>' : ''}<sz val="${f.tam}"/>${f.cor ? `<color rgb="FF${f.cor}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`).join('');
    const cellXfs = xfs.map((k) => {
      const [fi, fo, ce, fmt, bo, ve, qu] = k.split('|').map(Number);
      const al = ce || ve || qu ? `<alignment${ce ? ' horizontal="center"' : ''}${ve ? ' vertical="center" textRotation="90" wrapText="1"' : qu ? ' vertical="top" wrapText="1"' : ' vertical="center"'}/>` : '';
      return `<xf numFmtId="${fmt}" fontId="${fo || 0}" fillId="${fi || 0}" borderId="${bo ? 1 : 0}" xfId="0"${fmt ? ' applyNumberFormat="1"' : ''}${fi ? ' applyFill="1"' : ''}${fo ? ' applyFont="1"' : ''}${bo ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`;
    }).join('');
    const borda = '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>';
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="h:mm"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts><fonts count="${fontes.length}">${fonts}</fonts><fills count="${fundos.length}">${fills}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${borda}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${cellXfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const ficheiros = [
      { nome: '[Content_Types].xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${tipos.join('')}</Types>` },
      { nome: '_rels/.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { nome: 'xl/workbook.xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheets>${nomes.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${definidos.length ? `<definedNames>${definidos.join('')}</definedNames>` : ''}</workbook>` },
      { nome: 'xl/_rels/workbook.xml.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${folhas.length + 1}" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>` },
      { nome: 'xl/styles.xml', texto: styles },
      ...folhas.map((t, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, texto: t })),
      ...extra,
    ];
    return zip(ficheiros);
  }

  function descarregar(livro, nomeFicheiro) {
    const blob = new Blob([criar(livro)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nomeFicheiro;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  const api = { criar, descarregar, letra };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Excel = api;
})(typeof window !== 'undefined' ? window : globalThis);
