// Executor local isolado para testar qualquer Code node (n8n/codigo/*.js) com node --test,
// simulando $input, $(), $env, require('fs') e this.helpers.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const compartilhado = fs.readFileSync(join(RAIZ, 'n8n', 'codigo', '_compartilhado.js'), 'utf8');

const local = (p) => (p.startsWith('/data/') ? join(RAIZ, p.slice('/data/'.length)) : p);
const fsData = {
  readFileSync: (p, ...resto) => fs.readFileSync(local(p), ...resto),
  existsSync: (p) => fs.existsSync(local(p)),
};

export function codigo(nome) {
  const bruto = fs.readFileSync(join(RAIZ, 'n8n', 'codigo', `${nome}.js`), 'utf8');
  return bruto.startsWith('// @usa-compartilhado') ? `${compartilhado}\n\n${bruto}` : bruto;
}

export async function executarTodos(nome, { entradas = [{ json: {} }], nos = {}, env = {}, httpRequest } = {}) {
  const lista = Array.isArray(entradas) ? entradas : [entradas];
  const $input = {
    first: () => lista[0],
    all: () => lista,
  };
  const $ = (nomeNo) => ({
    first: () => nos[nomeNo],
    isExecuted: nomeNo in nos,
  });
  const helpers = {
    getBinaryDataBuffer: async (idx, prop) => lista[idx].binary[prop].buffer,
    prepareBinaryData: async (buffer, fileName, mimeType) => ({ buffer, fileName, mimeType }),
    ...(httpRequest ? { httpRequest } : {}),
  };
  const fn = new AsyncFunction('$input', '$', '$env', 'require', codigo(nome));
  return fn.call({ helpers }, $input, $, env, (m) => (m === 'fs' ? fsData : null));
}

export async function executar(nome, opcoes = {}) {
  const entradas = opcoes.entradas || [opcoes.entrada || { json: {} }];
  const saida = await executarTodos(nome, { ...opcoes, entradas });
  return saida[0];
}

