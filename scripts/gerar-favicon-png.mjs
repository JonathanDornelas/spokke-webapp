// Gera static/favicon-192.png a partir de static/favicon.svg — o ícone que a BUSCA do Google
// mostra ao lado do resultado. Ele pede um ícone quadrado com lado múltiplo de 48 px (ou um SVG
// num endereço próprio); o .ico de 32 px e o ícone do iPhone (180 px) não servem. 192 = 4 × 48.
// Renderizado no tema claro, que é o azul da marca (#3659CB).
//
// Uso: node scripts/gerar-favicon-png.mjs   (mudou o favicon.svg, rode de novo)
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const LADO = 192;
const svg = readFileSync('static/favicon.svg', 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ colorScheme: 'light' });
await page.setContent(
	`<!doctype html><html><body style="margin:0;background:transparent">
	<div id="icone" style="width:${LADO}px;height:${LADO}px">${svg.replace('<svg', `<svg width="${LADO}" height="${LADO}"`)}</div>
	</body></html>`
);
const png = await page.locator('#icone').screenshot({ omitBackground: true, type: 'png' });
await browser.close();

writeFileSync('static/favicon-192.png', png);
console.log(`static/favicon-192.png: ${LADO}×${LADO}, ${png.length} bytes`);
