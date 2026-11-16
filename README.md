# Atrasos e reforços

Ferramenta da TUB (Braga) para perceber onde nascem as cascatas de atrasos numa linha e testar onde pôr uma viatura de reforço (VR), sem retirar partidas nem mudar a frequência. Só dias úteis.

**Abrir:** https://dquintas03.github.io/Atrasos-Reforcos/

## Como usar

1. Carregue os dois relatórios em CSV: **rep3** (viagens atrasadas) e **rep20** (serviços). O horário da linha em **PDF** é recomendado.
2. **Onde nascem as cascatas:** partidas do dia (clique numa barra para ver o detalhe), mapa de calor por hora, zonas críticas e tabela de atrasos com filtros.
3. **Reforço:** escolha as zonas a proteger. Em cada período escolhe-se a primeira e a última volta, o terminal onde a VR começa e as horas de entrada e saída. A ferramenta sugere a entrada com menos atrasos.
4. **Relatório em Excel:** resumo, atrasos, partidas, zonas críticas, proposta, simulação e horários, com gráficos e pronto a imprimir em A4.

Os ficheiros são lidos só no browser: nada é enviado para nenhum servidor.

## Regras

- Atrasos até 10 min são ignorados; ocorrências acima de 3 h são excluídas.
- Nenhuma partida muda de hora nem desaparece. O tempo a mais vai para a chegada final (VR a começar no terminal das idas) ou para a ida até ao ponto de viragem (VR a começar no terminal da volta).
- A avaliação é uma estimativa direta sobre os atrasos observados, sem simular a propagação.

## Técnico

HTML e JavaScript simples, sem instalação nem build. Leitura de PDF com [pdf.js](https://mozilla.github.io/pdf.js/) (licença em `vendor/pdfjs-LICENSE.txt`); os ficheiros Excel são escritos pela própria ferramenta (`excel.js`).
