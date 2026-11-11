import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { requireTeacher } from '$lib/server/auth/guard';
import { atividades } from '$lib/server/db/repos/activities';
import { gerarPropostas } from '$lib/server/ia/gerar';
import type { AnexoDaIa } from '$lib/server/ia/provider';
import { MAXIMO_DE_FALA_S } from '$lib/billing/ia';
import {
	lerWav,
	LIMITE_DA_IMAGEM_BYTES,
	LIMITE_DO_AUDIO_BYTES,
	TAXA_DA_FALA,
	tipoDaImagem
} from '$lib/ia/arquivo';
import { contentUnitKinds } from '$lib/kernel/content/types';
import { labelForTag, languageLabels } from '$lib/kernel/language/profiles';

/**
 * "Gerar com IA" a partir de um ARQUIVO: a foto de uma página ou a fala de um vídeo
 * (docs/adr-003-ia-gemini.md "Imagem e vídeo"). O pedido escrito continua em
 * `materiais/ia.remote.ts`; este é o mesmo `gerarPropostas`, com o arquivo junto.
 *
 * **Por que um endpoint e não uma remote function.** Remote function fala JSON, e arquivo em
 * base64 dentro de JSON infla 33% — é o mesmo motivo de `a/[slug]/fala/+server.ts`.
 *
 * **Toda regra de remote function vale aqui** (regra nº 3): abre pelo guard do professor, e a
 * atividade, quando há, é resolvida pelo repositório escopado. O tipo do arquivo é decidido pelos
 * BYTES, nunca pelo nome nem pelo `type` que o navegador declara, e a duração da fala, que é o que
 * a leitura cobra, sai do cabeçalho do WAV que chegou — não do que a tela disse.
 *
 * **Nada é guardado.** O arquivo vive na memória desta requisição: vai ao provedor de IA e some.
 * Não passa pelo bucket nem pelo banco, e o vídeo em si nem sobe: o navegador manda só a fala do
 * trecho escolhido (`$lib/client/arquivo-ia.ts`).
 */

const tagValida = z.string().refine((tag) => Object.values(languageLabels).includes(tag), {
	message: 'Idioma desconhecido.'
});

const campos = z.object({
	requestId: z.string().uuid(),
	kind: z.enum(contentUnitKinds),
	fonte: z.enum(['imagem', 'video']),
	quantos: z.coerce.number().pipe(z.union([z.literal(5), z.literal(10), z.literal(20)])),
	pedido: z.string().trim().max(1_000).default(''),
	activityId: z.string().min(1).optional(),
	sourceLang: tagValida.optional(),
	targetLang: tagValida.optional()
});

/** O corpo inteiro: o arquivo maior que aceitamos, mais os campos do formulário. */
const LIMITE_DO_CORPO = LIMITE_DO_AUDIO_BYTES + 64 * 1024;

export const POST: RequestHandler = async ({ request, locals }) => {
	const teacher = requireTeacher(locals);

	const declarado = Number(request.headers.get('content-length') ?? 0);
	if (declarado > LIMITE_DO_CORPO) error(413, 'Arquivo grande demais.');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Envio incompleto.');
	}
	const texto = (nome: string) => {
		const v = form.get(nome);
		return typeof v === 'string' && v !== '' ? v : undefined;
	};
	const lido = campos.safeParse({
		requestId: texto('requestId'),
		kind: texto('kind'),
		fonte: texto('fonte'),
		quantos: texto('quantos'),
		pedido: texto('pedido'),
		activityId: texto('activityId'),
		sourceLang: texto('sourceLang'),
		targetLang: texto('targetLang')
	});
	if (!lido.success) error(400, 'Pedido inválido.');
	const { requestId, kind, fonte, quantos, pedido, activityId, sourceLang, targetLang } = lido.data;

	const arquivo = form.get('arquivo');
	if (!(arquivo instanceof File) || arquivo.size === 0) {
		return json({ ok: false, error: 'Escolha um arquivo antes de gerar.' });
	}
	const limite = fonte === 'imagem' ? LIMITE_DA_IMAGEM_BYTES : LIMITE_DO_AUDIO_BYTES;
	if (arquivo.size > limite) {
		return json({
			ok: false,
			error:
				fonte === 'imagem'
					? 'A foto ficou grande demais. Tente outra, ou a mesma com menos resolução.'
					: `O trecho passa de ${MAXIMO_DE_FALA_S / 60} minutos de fala. Escolha um trecho menor.`
		});
	}
	const bytes = new Uint8Array(await arquivo.arrayBuffer());

	const anexo = anexoDoArquivo(fonte, bytes);
	if ('erro' in anexo) return json({ ok: false, error: anexo.erro });

	let idiomas: { alvo: string; origem: string };
	if (activityId) {
		const atividade = await atividades(teacher).byId(activityId);
		if (!atividade) error(404, 'Atividade não encontrada');
		idiomas = { alvo: atividade.targetLang, origem: atividade.sourceLang };
	} else {
		if (!sourceLang || !targetLang) {
			return json({ ok: false, error: 'Escolha o idioma alvo e o do aluno.' });
		}
		idiomas = { alvo: targetLang, origem: sourceLang };
	}

	return json(
		await gerarPropostas(teacher, {
			requestId,
			kind,
			pedido,
			quantos,
			idiomaAlvo: labelForTag(idiomas.alvo),
			idiomaOrigem: labelForTag(idiomas.origem),
			anexo
		})
	);
};

/**
 * O anexo a partir dos bytes que chegaram, ou o motivo de recusar. A foto tem de ser JPEG, PNG ou
 * WebP de verdade; a fala, o WAV mono que o navegador monta, dentro do teto de minutos.
 */
function anexoDoArquivo(
	fonte: 'imagem' | 'video',
	bytes: Uint8Array
): AnexoDaIa | { erro: string } {
	if (fonte === 'imagem') {
		const mime = tipoDaImagem(bytes);
		if (!mime) return { erro: 'Não deu para ler esta imagem. Use uma foto em JPEG, PNG ou WebP.' };
		return { tipo: 'imagem', mime, dados: bytes };
	}
	const wav = lerWav(bytes);
	if (!wav || wav.canais !== 1 || wav.taxa !== TAXA_DA_FALA) {
		return { erro: 'Não deu para ler o áudio do vídeo. Escolha o arquivo de novo.' };
	}
	if (wav.segundos < 1) return { erro: 'O trecho tem menos de um segundo de fala.' };
	if (wav.segundos > MAXIMO_DE_FALA_S + 1) {
		return {
			erro: `O trecho passa de ${MAXIMO_DE_FALA_S / 60} minutos de fala. Escolha um trecho menor.`
		};
	}
	return { tipo: 'audio', mime: 'audio/wav', dados: bytes, segundos: wav.segundos };
}
