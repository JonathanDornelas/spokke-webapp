import type { LanguageProfile } from '../profile';
import { ptBR } from './pt-BR';
import { esES } from './es-ES';
import { enUS } from './en-US';
import { enGB } from './en-GB';
import { frFR } from './fr-FR';
import { itIT } from './it-IT';
import { hiIN } from './hi-IN';
import { zhCN } from './zh-CN';
import { jaJP } from './ja-JP';
import { arSA } from './ar-SA';

/**
 * Todo perfil concreto do produto — skill `novo-idioma` adiciona aqui. Se
 * você está escrevendo `if (lang === 'ja')` fora deste diretório e de
 * `kernel/language/profile.ts`, está errado (CLAUDE.md "Produto").
 *
 * **Os nove primeiros são exatamente os idiomas que o Kokoro fala**
 * (`audiotext-service/app/voices.py`), e é por isso que são estes: fora dessa
 * lista não existe voz, logo não existe questão de escuta. O árabe é o décimo e
 * entra assim mesmo — ele funciona para leitura, escrita e fala, e a lista de
 * vozes vazia é a resposta honesta para o que falta.
 */
export const languageProfiles: Record<string, LanguageProfile> = {
	'pt-BR': ptBR,
	'es-ES': esES,
	'en-US': enUS,
	'en-GB': enGB,
	'fr-FR': frFR,
	'it-IT': itIT,
	'hi-IN': hiIN,
	'zh-CN': zhCN,
	'ja-JP': jaJP,
	'ar-SA': arSA
};

export function getProfile(tag: string): LanguageProfile {
	const profile = languageProfiles[tag];
	if (!profile) throw new Error(`Nenhum LanguageProfile para "${tag}"`);
	return profile;
}

/**
 * Rótulo em português (o que o professor vê nos `<select>` de
 * `atividades/nova` e, via `$lib/idiomas`, nos de turma e material) → tag do profile. Único lugar
 * que traduz um nome de idioma legível para o identificador técnico — a tela em
 * si nunca conhece a tag.
 *
 * **As telas ITERAM este objeto**, nunca repetem os nomes à mão: `atividades/nova`
 * tinha os `<option>` escritos no markup e eles ficaram para trás — o select de
 * idioma alvo oferecia três idiomas dos cinco cadastrados, e não havia como
 * criar uma atividade de espanhol. Acrescentar idioma aqui tem de ser tudo o que
 * um idioma novo precisa.
 *
 * Os rótulos das duas variantes de inglês dizem a REGIÃO porque é o que muda
 * para o professor: a voz do áudio. "Inglês" sozinho nos dois seria uma escolha
 * sem critério visível.
 */
export const languageLabels: Record<string, string> = {
	Português: 'pt-BR',
	Espanhol: 'es-ES',
	'Inglês (EUA)': 'en-US',
	'Inglês (Reino Unido)': 'en-GB',
	Francês: 'fr-FR',
	Italiano: 'it-IT',
	Híndi: 'hi-IN',
	'Chinês (mandarim)': 'zh-CN',
	Japonês: 'ja-JP',
	Árabe: 'ar-SA'
};

export function tagForLabel(label: string): string {
	const tag = languageLabels[label];
	if (!tag) throw new Error(`Nenhum idioma cadastrado para o rótulo "${label}"`);
	return tag;
}

export function labelForTag(tag: string): string {
	const found = Object.entries(languageLabels).find(([, value]) => value === tag);
	return found?.[0] ?? tag;
}
