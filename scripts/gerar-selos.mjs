// Gera os dois selos do rodapé em PNG (2x), a partir de HTML com as cores da
// marca — como as imagens de `static/og/`. Mudou o texto ou a cor, rode de novo
// e confira as medidas que ele imprime contra `selosDeVerificacao`. Não usa logo de terceiro: nem do Google, nem de autoridade
// certificadora — nenhum dos dois tem selo oficial (docs/selos-e-seguranca.md).
import { chromium } from '@playwright/test';

// Uso: node scripts/gerar-selos.mjs  (grava em static/selos/)
const OUT = process.argv[2] ?? 'static/selos';

// Roseta de selo: um círculo de 14 ondas, desenhado por pontos.
function roseta(cx, cy, r, amp, ondas) {
	const pts = [];
	const passos = ondas * 12;
	for (let i = 0; i <= passos; i++) {
		const a = (i / passos) * Math.PI * 2;
		const rr = r + amp * Math.cos(a * ondas);
		pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
	}
	return 'M' + pts.join('L') + 'Z';
}
const ROSETA = roseta(22, 22, 19, 1.6, 14);

const ICONES = {
	// certificado com fita (o mesmo traço dos ícones do site)
	ssl: 'M5 4.5h14a1 1 0 011 1v9a1 1 0 01-1 1h-4M9 15.5H5a1 1 0 01-1-1v-9a1 1 0 011-1M8 8.5h8M8 11.5h4M12 14.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM10.5 19l-.5 2.5 2-1 2 1-.5-2.5',
	// escudo com visto
	safe: 'M12 3.5l7 2.6v5.4c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6.1zM9 12l2.2 2.2L15.5 10'
};

const selo = (id, linha1, linha2) => `
	<div class="selo" id="${id}">
		<svg class="emblema" viewBox="0 0 44 44" aria-hidden="true">
			<path d="${ROSETA}" fill="#3659CB"/>
			<circle cx="22" cy="22" r="15.2" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="1"/>
			<g transform="translate(12 12) scale(.8333)">
				<path d="${ICONES[id]}" fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
			</g>
		</svg>
		<div class="textos">
			<span class="l1">${linha1}</span>
			<span class="l2">${linha2}</span>
		</div>
	</div>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
	body { margin: 0; padding: 20px; background: transparent; display: grid; gap: 20px; justify-items: start; }
	.selo {
		display: flex; align-items: center; gap: 9px;
		height: 52px; box-sizing: border-box; padding: 0 14px 0 6px;
		background: #ffffff; border: 1px solid #D9E1F4; border-radius: 12px;
		font-family: 'Plus Jakarta Sans', sans-serif;
	}
	.emblema { width: 40px; height: 40px; flex: none; }
	.textos { display: grid; line-height: 1.15; }
	.l1 { font-size: 12.5px; font-weight: 800; color: #111A31; letter-spacing: -0.01em; white-space: nowrap; }
	.l2 { font-size: 11px; font-weight: 600; color: #3659CB; margin-top: 2px; white-space: nowrap; }
</style></head><body>
	${selo('ssl', 'Certificado SSL', 'Verificar no SSL Labs')}
	${selo('safe', 'Google Safe Browsing', 'Verificar o status do site')}
</body></html>`;

const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 2 });
await p.setContent(html, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
for (const [id, arquivo] of [
	['ssl', 'ssl.png'],
	['safe', 'safe-browsing.png']
]) {
	const el = p.locator('#' + id);
	const caixa = await el.boundingBox();
	await el.screenshot({ path: `${OUT}/${arquivo}`, omitBackground: true });
	console.log(arquivo, Math.round(caixa.width), 'x', Math.round(caixa.height), 'css px');
}
await b.close();
