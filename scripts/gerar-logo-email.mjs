// Gera o logo dos e-mails: a marca inteira ("Spokke") em BRANCO sobre fundo transparente, em
// PNG 2x, a partir do MESMO traço do site ($lib/marca). Grava em
// src/lib/server/email/logo.ts como base64, porque o e-mail o leva EMBUTIDO (anexo inline,
// `cid:`): sem imagem remota, nada é buscado no servidor quando a mensagem abre
// (server.md "E-mail"). E base64 num .ts, não um .png ao lado, porque quem monta o e-mail é o
// worker (tsx, sem Vite) — um import de arquivo binário não existe lá.
//
// Uso: node scripts/gerar-logo-email.mjs   (mudou a marca, rode de novo)
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { MARCA } from '../src/lib/marca.ts';

const ALTURA = 26; // a altura em que o logo aparece no cabeçalho do e-mail, em px
const ESCALA = 2; // telas de alta densidade
const largura = Math.round((ALTURA * MARCA.largura) / MARCA.altura);

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<svg id="logo" xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${ALTURA}" viewBox="${MARCA.viewBox}" style="display:block">
<path fill="#FFFFFF" fill-rule="evenodd" d="${MARCA.d}"/></svg></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: ESCALA });
await page.setContent(html);
const png = await page.locator('#logo').screenshot({ omitBackground: true, type: 'png' });
await browser.close();

const destino = 'src/lib/server/email/logo.ts';
writeFileSync(
	destino,
	`// GERADO por scripts/gerar-logo-email.mjs — não edite à mão.
//
// A marca em branco, PNG ${largura * ESCALA}×${ALTURA * ESCALA} (2x), exibida a ${largura}×${ALTURA}. Vai EMBUTIDA em todo
// e-mail (anexo inline, \`cid:\`): sem imagem remota (server.md "E-mail").

export const LOGO = {
	cid: 'logo@spokke',
	largura: ${largura},
	altura: ${ALTURA},
	png: '${png.toString('base64')}'
} as const;
`
);
console.log(
	`${destino}: ${largura}×${ALTURA} (PNG ${largura * ESCALA}×${ALTURA * ESCALA}, ${png.length} bytes)`
);
