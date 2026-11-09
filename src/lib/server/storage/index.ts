import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';

/**
 * Object storage S3-compatível, chave por hash — ver .claude/rules/server.md
 * "Mídia". Nunca nome de arquivo derivado de input do usuário.
 *
 * `process.env` (e não `$env/dynamic/private`) porque o worker sintetiza o
 * áudio fora do runtime do SvelteKit e importa este mesmo módulo — mesma
 * razão de `db/client.ts`.
 */

let client: S3Client | null = null;

function s3(): S3Client {
	client ??= new S3Client({
		region: process.env.STORAGE_REGION || 'auto',
		endpoint: process.env.STORAGE_ENDPOINT,
		// MinIO e outros S3 locais só respondem no estilo path.
		forcePathStyle: true,
		credentials: {
			accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
			secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? ''
		}
	});
	return client;
}

export async function putObject(
	key: string,
	body: Uint8Array,
	contentType: string
): Promise<string> {
	await s3().send(
		new PutObjectCommand({
			Bucket: process.env.STORAGE_BUCKET,
			Key: key,
			Body: body,
			ContentType: contentType
		})
	);
	return publicUrl(key);
}

export function publicUrl(key: string): string {
	return `${process.env.STORAGE_PUBLIC_URL}/${key}`;
}

/**
 * Apaga UM objeto. Objeto que já não existe não é erro — o S3 responde
 * sucesso, e quem chama quer o mesmo resultado: o arquivo fora do bucket.
 *
 * Um por vez, e não `DeleteObjects` em lote: o lote exige `Content-MD5`, e os
 * SDKs novos mandam outro checksum por padrão — combinação que já quebrou o
 * apagar em lote em storages S3-compatíveis. Aqui são dezenas de arquivos, não
 * milhares.
 */
export async function apagarObjeto(key: string): Promise<void> {
	await s3().send(new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }));
}

/**
 * Lê um objeto PRIVADO do bucket.
 *
 * Existe por causa da gravação do aluno: o áudio de TTS é público (é o mesmo
 * conteúdo que ele recebe na questão), mas a voz de uma pessoa não pode ficar
 * acessível a quem descobrir o endereço. O prefixo `fala/` não tem leitura
 * anônima, e quem serve é uma rota do Studio que confere se o professor é dono
 * da tentativa — este helper é o que ela usa para buscar os bytes.
 *
 * Devolve `null` quando o objeto não existe: a gravação vive 7 dias e some
 * pela regra de ciclo de vida, então "não está lá" é um desfecho normal, não
 * uma falha.
 */
export async function getObject(
	key: string
): Promise<{ body: ReadableStream; contentType: string; length?: number } | null> {
	try {
		const saida = await s3().send(
			new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key })
		);
		if (!saida.Body) return null;
		return {
			body: saida.Body.transformToWebStream(),
			contentType: saida.ContentType ?? 'application/octet-stream',
			length: saida.ContentLength
		};
	} catch {
		// Objeto expirado, apagado, ou bucket fora do ar. Quem chama transforma
		// em 404 — do ponto de vista do professor é a mesma coisa.
		return null;
	}
}
