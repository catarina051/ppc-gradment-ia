// Biblioteca compartilhada injetada automaticamente pelo montar-workflow.mjs nos Code nodes que declaram:
// // @usa-compartilhado

const MAPA_ORDINAIS_EXTENSO = {
  PRIMEIRO: 'I', PRIMEIRA: 'I',
  SEGUNDO: 'II', SEGUNDA: 'II',
  TERCEIRO: 'III', TERCEIRA: 'III',
  QUARTO: 'IV', QUARTA: 'IV',
  QUINTO: 'V', QUINTA: 'V',
  SEXTO: 'VI', SEXTA: 'VI',
  SETIMO: 'VII', SETIMA: 'VII',
  OITAVO: 'VIII', OITAVA: 'VIII',
  NONO: 'IX', NONA: 'IX',
  DECIMO: 'X', DECIMA: 'X',
};

const MAPA_ARABICO_ROMANO = {
  '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V',
  '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X',
  '11': 'XI', '12': 'XII',
};

const ROMANOS_VALIDOS = new Set([
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
]);

const STOPWORDS_DISCIPLINA = new Set([
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'PARA', 'A', 'AO', 'AOS', 'AS', 'OS', 'NA', 'NO', 'NAS', 'NOS',
]);

function semAcentos(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function limparTextoUnicaLinha(str, maxLen = 255) {
  return String(str ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// Extrai os ordinais presentes no nome da disciplina (ex.: "Cálculo 2" -> ["II"], "Física I" -> ["I"])
function extrairOrdinaisDisciplina(nome) {
  const tokens = semAcentos(nome)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const ordinais = [];
  for (const tk of tokens) {
    if (ROMANOS_VALIDOS.has(tk)) ordinais.push(tk);
    else if (MAPA_ARABICO_ROMANO[tk]) ordinais.push(MAPA_ARABICO_ROMANO[tk]);
    else if (MAPA_ORDINAIS_EXTENSO[tk]) ordinais.push(MAPA_ORDINAIS_EXTENSO[tk]);
  }
  return ordinais;
}

function ordinaisCompativeis(nomeA, nomeB) {
  const ordA = extrairOrdinaisDisciplina(nomeA);
  const ordB = extrairOrdinaisDisciplina(nomeB);
  if (ordA.length === 0 && ordB.length === 0) return true;
  if (ordA.length !== ordB.length) return false;
  return ordA.every((v, i) => v === ordB[i]);
}

function tokensCanonicosDisciplina(nome) {
  const bruto = semAcentos(nome)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return bruto
    .map((tk) => MAPA_ARABICO_ROMANO[tk] || MAPA_ORDINAIS_EXTENSO[tk] || tk)
    .filter((tk) => !STOPWORDS_DISCIPLINA.has(tk));
}

function chaveNomeDisciplina(nome) {
  return tokensCanonicosDisciplina(nome).join(' ');
}

function similaridadeJaccardTokens(strA, strB) {
  const setA = new Set(
    semAcentos(strA).toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1),
  );
  const setB = new Set(
    semAcentos(strB).toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1),
  );
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) {
    if (setB.has(w)) inter += 1;
  }
  return inter / (setA.size + setB.size - inter);
}

// Regra 4 do GradMent: máx 20 chars, apenas A-Z0-9, começa com >= 2 letras e possui >= 1 dígito.
const REGEX_CODIGO_GRADMENT = /^[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*$/;

function codigoGradmentValido(codigo) {
  const c = String(codigo ?? '').trim();
  return c.length >= 3 && c.length <= 20 && REGEX_CODIGO_GRADMENT.test(c);
}

function gerarCodigoGradment(codigoCandidato, codigoExterno, nomeDisciplina, usadosSet) {
  // 1. Tenta extrair padrão SIGAA G03<CODIGO>.01 se presente em codigoExterno
  const extRaw = String(codigoExterno ?? '').trim().toUpperCase();
  const matchSigaa = extRaw.match(/^[A-Z]+\d{2}([A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*)\.\d+$/);
  const candidatos = [];
  if (matchSigaa) candidatos.push(matchSigaa[1]);
  if (codigoCandidato) candidatos.push(codigoCandidato);
  if (codigoExterno) candidatos.push(codigoExterno);

  const ordinais = extrairOrdinaisDisciplina(nomeDisciplina);
  const sufixoOrdinal = ordinais.length > 0
    ? String(Object.entries(MAPA_ARABICO_ROMANO).find(([, rom]) => rom === ordinais[ordinais.length - 1])?.[0] || '1')
    : '01';

  for (const cand of candidatos) {
    let limpo = semAcentos(cand).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!limpo) continue;
    // Garante pelo menos 2 letras no início
    if (!/^[A-Z]{2}/.test(limpo)) {
      const letrasNome = tokensCanonicosDisciplina(nomeDisciplina).join('').replace(/[^A-Z]/g, '').slice(0, 3) || 'DSC';
      limpo = (letrasNome.length >= 2 ? letrasNome : `${letrasNome}X`) + limpo;
    }
    // Garante pelo menos 1 dígito
    if (!/\d/.test(limpo)) {
      limpo = limpo.slice(0, 20 - sufixoOrdinal.length) + sufixoOrdinal;
    }
    limpo = limpo.slice(0, 20);
    if (codigoGradmentValido(limpo) && !usadosSet.has(limpo)) {
      usadosSet.add(limpo);
      return limpo;
    }
  }

  // Fallback determinístico a partir do nome da disciplina
  const palavras = tokensCanonicosDisciplina(nomeDisciplina)
    .map((t) => t.replace(/[^A-Z]/g, ''))
    .filter(Boolean);
  let prefixo = '';
  if (palavras.length >= 2) {
    prefixo = palavras.map((p) => p[0]).join('').slice(0, 4);
    if (prefixo.length < 3) prefixo = (palavras[0] + (palavras[1] || 'X')).slice(0, 4);
  } else if (palavras.length === 1) {
    prefixo = palavras[0].slice(0, 4);
  }
  if (prefixo.length < 2) prefixo = 'DISC';

  let tentativa = `${prefixo}${sufixoOrdinal}`.slice(0, 20);
  let contador = 1;
  while (!codigoGradmentValido(tentativa) || usadosSet.has(tentativa)) {
    const suf = String(contador++);
    tentativa = `${prefixo.slice(0, 20 - suf.length)}${suf}`;
  }
  usadosSet.add(tentativa);
  return tentativa;
}

// Extrai JSON de respostas HTTP da API Gemini, OpenAI/OpenRouter ou Anthropic
function extrairJsonRespostaLLM(httpItem, provider) {
  const status = httpItem?.statusCode ?? 200;
  const body = httpItem?.body ?? httpItem ?? {};

  if (status >= 400 || body?.error) {
    const msg = body?.error?.message || body?.error || JSON.stringify(body).slice(0, 300);
    throw new Error(`Erro HTTP ${status} do provedor ${provider}: ${msg}`);
  }

  let textoBruto = '';
  let finishReason = '';

  if (provider === 'gemini') {
    const cand = body?.candidates?.[0];
    finishReason = cand?.finishReason || '';
    const parts = cand?.content?.parts || [];
    // Ignora partes de thought nativo se houver (part.thought === true)
    textoBruto = parts
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('\n');
  } else if (provider === 'anthropic') {
    finishReason = body?.stop_reason || '';
    const blocks = Array.isArray(body?.content) ? body.content : [];
    textoBruto = blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  } else {
    // openai / openrouter / compatíveis
    const choice = body?.choices?.[0];
    finishReason = choice?.finish_reason || '';
    textoBruto = choice?.message?.content || '';
  }

  if (!textoBruto || !String(textoBruto).trim()) {
    throw new Error(`O provedor ${provider} retornou resposta vazia (finishReason: ${finishReason || 'desconhecido'}).`);
  }

  // Remove cercas markdown ```json ... ``` caso o provedor tenha incluído
  let limpo = String(textoBruto).trim();
  limpo = limpo.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return { dados: JSON.parse(limpo), finishReason };
  } catch (_e) {
    const ini = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (ini !== -1 && fim > ini) {
      return { dados: JSON.parse(limpo.slice(ini, fim + 1)), finishReason };
    }
    throw new Error(`Resposta do provedor ${provider} não pôde ser interpretada como JSON válido.`);
  }
}

// Recuperação automática gratuita (retry + failover entre modelos gratuitos) diante de picos 503/429
async function recuperarFalhaTransitoriaLLM(cfgOriginal, envObj, erroInicial, helpersN8n) {
  const fnHttp = typeof fetch === 'function'
    ? async (url, headers, bodyObj) => {
        const r = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyObj),
          signal: AbortSignal.timeout(180000),
        });
        const texto = await r.text();
        let parsed = {};
        try { parsed = JSON.parse(texto); } catch { parsed = { error: texto }; }
        return { statusCode: r.status, body: parsed };
      }
    : helpersN8n?.httpRequest
      ? async (url, headers, bodyObj) => {
          const r = await helpersN8n.httpRequest({
            method: 'POST',
            url,
            headers,
            body: JSON.stringify(bodyObj),
            returnFullResponse: true,
            ignoreHttpStatusErrors: true,
            timeout: 180000,
          });
          const rawBody = r.body ?? r;
          let parsed = rawBody;
          if (typeof rawBody === 'string') {
            try { parsed = JSON.parse(rawBody); } catch { parsed = { error: rawBody }; }
          }
          return { statusCode: r.statusCode ?? 200, body: parsed };
        }
      : null;

  if (!cfgOriginal?.body || !envObj || !fnHttp) {
    throw erroInicial;
  }

  let sysText = '';
  let usrText = '';
  let schemaObj = null;

  if (cfgOriginal.provider === 'gemini') {
    sysText = cfgOriginal.body?.systemInstruction?.parts?.[0]?.text || '';
    usrText = cfgOriginal.body?.contents?.[0]?.parts?.[0]?.text || '';
    schemaObj = cfgOriginal.body?.generationConfig?.responseSchema || null;
  } else if (cfgOriginal.provider === 'anthropic') {
    sysText = cfgOriginal.body?.system || '';
    usrText = cfgOriginal.body?.messages?.[0]?.content || '';
  } else {
    sysText = cfgOriginal.body?.messages?.[0]?.content || '';
    usrText = cfgOriginal.body?.messages?.[1]?.content || '';
  }

  if (!usrText) throw erroInicial;

  const kGemini = String(envObj.GEMINI_API_KEY || '').trim();
  const kOr = String(envObj.OPENROUTER_API_KEY || '').trim();
  const kGroq = String(envObj.GROQ_API_KEY || '').trim();
  if (!kGemini && !kOr && !kGroq) throw erroInicial;

  const candidatos = [];
  if (cfgOriginal.provider === 'gemini') {
    if (kGemini) {
      candidatos.push({ provider: 'gemini', model: 'gemini-3.6-flash', key: kGemini, esperaMs: 1200 });
      candidatos.push({ provider: 'gemini', model: cfgOriginal.model, key: kGemini, esperaMs: 1800 });
    }
    if (kOr) {
      candidatos.push({ provider: 'openrouter', model: 'nvidia/nemotron-3.5-super-vl:free', key: kOr, esperaMs: 600 });
    }
  } else if (cfgOriginal.provider === 'openrouter') {
    if (kOr) {
      candidatos.push({ provider: 'openrouter', model: cfgOriginal.model, key: kOr, esperaMs: 1500 });
      candidatos.push({ provider: 'openrouter', model: 'nvidia/nemotron-3.5-lightning:free', key: kOr, esperaMs: 800 });
    }
    if (kGemini) {
      candidatos.push({ provider: 'gemini', model: 'gemini-3.6-flash', key: kGemini, esperaMs: 600 });
    }
  } else if (cfgOriginal.provider === 'groq') {
    if (kGroq && usrText.length <= 24000) {
      candidatos.push({ provider: 'groq', model: 'qwen/qwen3.8-27b', key: kGroq, esperaMs: 1200 });
    }
    if (kGemini) {
      candidatos.push({ provider: 'gemini', model: 'gemini-3.6-flash', key: kGemini, esperaMs: 500 });
    }
    if (kOr) {
      candidatos.push({ provider: 'openrouter', model: 'nvidia/nemotron-3.5-super-vl:free', key: kOr, esperaMs: 500 });
    }
  }

  let ultimoErro = erroInicial;
  for (const cand of candidatos) {
    await new Promise((r) => setTimeout(r, cand.esperaMs));
    try {
      let url;
      let headers = { 'Content-Type': 'application/json' };
      let body;

      if (cand.provider === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${cand.model}:generateContent`;
        headers['x-goog-api-key'] = cand.key;
        const genCfg = {
          temperature: 0,
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
        };
        if (schemaObj) genCfg.responseSchema = schemaObj;
        if (/^gemini-3\./i.test(cand.model) && !/lite/i.test(cand.model)) {
          genCfg.thinkingConfig = { thinkingBudget: 0 };
        }
        body = {
          systemInstruction: { parts: [{ text: sysText }] },
          contents: [{ role: 'user', parts: [{ text: usrText }] }],
          generationConfig: genCfg,
        };
      } else {
        const base = cand.provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1';
        url = `${base}/chat/completions`;
        headers.Authorization = `Bearer ${cand.key}`;
        if (cand.provider === 'openrouter') {
          headers['HTTP-Referer'] = 'http://localhost:5680';
          headers['X-Title'] = 'PPC GradMent IA';
        }
        const sysComSchema = schemaObj && !sysText.includes('Schema JSON Obrigatório')
          ? `${sysText}\n\n## Schema JSON Obrigatório de Resposta\n${JSON.stringify(schemaObj)}`
          : sysText;
        body = {
          model: cand.model,
          temperature: 0,
          max_tokens: cand.provider === 'groq' ? 8192 : 65536,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sysComSchema },
            { role: 'user', content: usrText },
          ],
        };
        if (cand.provider === 'openrouter') body.reasoning = { enabled: false };
      }

      const respItem = await fnHttp(url, headers, body);
      const extraido = extrairJsonRespostaLLM(respItem, cand.provider);
      return {
        ...extraido,
        providerUsado: cand.provider,
        modelUsado: cand.model,
      };
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro;
}

// Verificação de ciclo via DFS idêntica a CurriculoService::teriaCicloAoAdicionar no GradMent
function grafoTemCicloAoAdicionar(adjacencia, origem, destino) {
  if (origem === destino) return true;
  // Verifica se já existe caminho de destino -> ... -> origem
  const visitados = new Set();
  const pilha = [destino];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    if (atual === origem) return true;
    if (visitados.has(atual)) continue;
    visitados.add(atual);
    const vizinhos = adjacencia.get(atual) || [];
    for (const prox of vizinhos) {
      if (!visitados.has(prox)) pilha.push(prox);
    }
  }
  return false;
}


// ============================================================================================
// LEITURA EM BLOCOS: cada IA lê o PPC inteiro, de bloco em bloco de páginas, e os resultados são fundidos.
// ============================================================================================

// Divide o texto (com marcadores "--- [PÁGINA N] ---") em blocos de ~alvoChars, repetindo a última página de
// um bloco no início do próximo para não perder disciplina partida na quebra. Página gigante vira sub-blocos.
function dividirEmBlocos(texto, alvoChars = 60000) {
  const partes = String(texto).split(/(?=--- \[PÁGINA \d+\] ---)/).filter((p) => p.trim());
  const paginas = partes.map((p) => {
    const m = p.match(/^--- \[PÁGINA (\d+)\] ---/);
    return { num: m ? Number(m[1]) : 1, texto: p };
  });
  // Página única enorme (ex.: TXT/DOCX sem quebra): fatia por linhas, mantendo o número da página
  const unidades = [];
  for (const pg of paginas) {
    if (pg.texto.length <= alvoChars * 1.5) { unidades.push(pg); continue; }
    const linhas = pg.texto.split('\n');
    let atual = [];
    let tam = 0;
    for (const ln of linhas) {
      if (tam + ln.length > alvoChars && atual.length) {
        unidades.push({ num: pg.num, texto: atual.join('\n') });
        atual = atual.slice(-15); // sobreposição de ~15 linhas
        tam = atual.join('\n').length;
      }
      atual.push(ln);
      tam += ln.length + 1;
    }
    if (atual.length) unidades.push({ num: pg.num, texto: atual.join('\n') });
  }
  const blocos = [];
  let i = 0;
  while (i < unidades.length) {
    const ini = i;
    let tam = 0;
    while (i < unidades.length && (i === ini || tam + unidades[i].texto.length <= alvoChars)) {
      tam += unidades[i].texto.length;
      i += 1;
    }
    const fatia = unidades.slice(ini, i);
    blocos.push({ inicio: fatia[0].num, fim: fatia[fatia.length - 1].num, texto: fatia.map((u) => u.texto).join('\n') });
    if (i < unidades.length && i - ini > 1) i -= 1; // repete a última unidade no próximo bloco
  }
  return blocos;
}

// Monta a requisição HTTP para o provedor (Gemini, Anthropic ou compatível com OpenAI)
function requisicaoLLM(cand, systemPrompt, schema, mensagem, envObj) {
  const chave = String(envObj[cand.env_key] || '').trim();
  if (cand.provider === 'gemini') {
    const base = (cand.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const genCfg = { temperature: 0, maxOutputTokens: 65536, responseMimeType: 'application/json', responseSchema: schema };
    if (/^gemini-3\./i.test(cand.model) && !/lite/i.test(cand.model)) genCfg.thinkingConfig = { thinkingBudget: 0 };
    return {
      url: `${base}/models/${cand.model}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: { systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: mensagem }] }], generationConfig: genCfg },
    };
  }
  const sys = `${systemPrompt}\n\n## Schema JSON Obrigatório de Resposta\n${JSON.stringify(schema)}`;
  if (cand.provider === 'anthropic') {
    const base = (cand.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    return {
      url: `${base}/messages`,
      headers: { 'Content-Type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01' },
      body: { model: cand.model, max_tokens: 32768, system: sys, messages: [{ role: 'user', content: mensagem }] },
    };
  }
  const BASES = { openrouter: 'https://openrouter.ai/api/v1', groq: 'https://api.groq.com/openai/v1', mistral: 'https://api.mistral.ai/v1', openai: 'https://api.openai.com/v1' };
  const base = (cand.base_url || BASES[cand.provider] || BASES.openai).replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` };
  if (cand.provider === 'openrouter') { headers['HTTP-Referer'] = 'http://localhost:5680'; headers['X-Title'] = 'PPC GradMent IA'; }
  const body = {
    model: cand.model,
    temperature: 0,
    max_tokens: cand.provider === 'groq' || cand.provider === 'mistral' ? 16384 : 65536,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: sys }, { role: 'user', content: mensagem }],
  };
  if (cand.provider === 'openrouter') body.reasoning = { enabled: false };
  if (cand.provider === 'groq' && /gpt-oss/i.test(cand.model)) body.reasoning_effort = 'low';
  return { url: `${base}/chat/completions`, headers, body };
}

async function enviarHttpLLM(req, helpersN8n, timeoutMs = 600000) {
  if (helpersN8n?.httpRequest) {
    const r = await helpersN8n.httpRequest({
      method: 'POST', url: req.url, headers: req.headers, body: JSON.stringify(req.body),
      returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: timeoutMs,
    });
    let corpo = r.body ?? r;
    if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = { error: corpo }; } }
    return { statusCode: r.statusCode ?? 200, body: corpo };
  }
  const r = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(timeoutMs) });
  const texto = await r.text();
  let corpo;
  try { corpo = JSON.parse(texto); } catch { corpo = { error: texto }; }
  return { statusCode: r.status, body: corpo };
}

// Candidatos para um slot: o configurado primeiro, depois reservas gratuitas. Reservas no MESMO modelo da
// outra IA ficam por último, para preservar a diversidade (sem ela a verificação dupla perde força).
function candidatosLLM(cfg, envObj, evitarModelo) {
  const tem = (k) => Boolean(String(envObj[k] || '').trim());
  const lista = [{ ...cfg }];
  const add = (provider, model, envKey) => {
    if (tem(envKey) && !lista.some((c) => c.provider === provider && c.model === model)) lista.push({ provider, model, env_key: envKey, base_url: '' });
  };
  add('gemini', 'gemini-3.6-flash', 'GEMINI_API_KEY');
  add('gemini', 'gemini-3.5-flash-lite', 'GEMINI_API_KEY');
  add('openrouter', 'nvidia/nemotron-3.5-super-vl:free', 'OPENROUTER_API_KEY');
  add('openrouter', 'nvidia/nemotron-3.5-lightning:free', 'OPENROUTER_API_KEY');
  const id = (c) => `${c.provider}/${c.model}`;
  const resto = lista.slice(1);
  return [lista[0], ...resto.filter((c) => id(c) !== evitarModelo), ...resto.filter((c) => id(c) === evitarModelo)];
}

// Chama o LLM com o configurado e, se falhar, com as reservas. Lança erro só se TODAS falharem.
async function chamarLLMComReservas(cfg, systemPrompt, schema, mensagem, envObj, helpersN8n, evitarModelo) {
  const erros = [];
  for (const cand of candidatosLLM(cfg, envObj, evitarModelo)) {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        const resp = await enviarHttpLLM(requisicaoLLM(cand, systemPrompt, schema, mensagem, envObj), helpersN8n);
        const { dados } = extrairJsonRespostaLLM(resp, cand.provider);
        return { dados, provider: cand.provider, model: cand.model, tentativas: erros.length + 1 };
      } catch (e) {
        const msg = String(e?.message || e);
        erros.push(`${cand.provider}/${cand.model}: ${msg.slice(0, 160)}`);
        const transitorio = /\b(429|500|502|503|504)\b|high demand|overloaded|rate|timeout|vazia/i.test(msg);
        if (!transitorio) break; // erro definitivo neste modelo: passa para o próximo candidato
        const espera = Number(envObj.PPC_ESPERA_RETENTATIVA_MS ?? 1500);
        await new Promise((r) => setTimeout(r, espera * tentativa));
      }
    }
  }
  throw new Error(`todos os modelos falharam (${erros.slice(-4).join(' | ')})`);
}

// Funde as extrações de vários blocos de UMA IA num resultado único, como se o PPC tivesse sido lido de uma vez.
function mesclarExtracoesBlocos(resultados) {
  const normCod = (s) => semAcentos(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const grupos = [];
  const porExt = new Map();
  const porNome = new Map();
  const porCodBloco = []; // por bloco: código local -> grupo
  resultados.forEach((r, b) => {
    const mapaLocal = new Map();
    porCodBloco.push(mapaLocal);
    for (const d of Array.isArray(r?.disciplinas) ? r.disciplinas : []) {
      if (!d || !String(d.nome || '').trim()) continue;
      const ext = normCod(d.codigo_externo);
      const nome = chaveNomeDisciplina(d.nome);
      let g = ext.length >= 3 ? porExt.get(ext) : undefined;
      if (!g && nome.length >= 3 && porNome.has(nome)) {
        const cand = porNome.get(nome);
        if (!ext || !cand.ext || cand.ext === ext) g = cand;
      }
      if (!g) { g = { ext: '', itens: [] }; grupos.push(g); }
      if (ext && !g.ext) g.ext = ext;
      if (ext.length >= 3) porExt.set(ext, g);
      if (nome.length >= 3 && !porNome.has(nome)) porNome.set(nome, g);
      g.itens.push({ ...d, _bloco: b });
      if (d.codigo) mapaLocal.set(normCod(d.codigo), g);
      if (ext) mapaLocal.set(ext, g);
    }
  });

  const moda = (vals) => {
    const cont = new Map();
    vals.forEach((v) => { const k = JSON.stringify(v); cont.set(k, (cont.get(k) || 0) + 1); });
    let melhor = null;
    let n = -1;
    for (const [k, c] of cont) if (c > n) { melhor = JSON.parse(k); n = c; }
    return melhor;
  };
  const modaMaior = (vals) => {
    const cont = new Map();
    vals.forEach((v) => cont.set(v, (cont.get(v) || 0) + 1));
    return [...cont.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  };
  const disciplinas = grupos.map((g) => {
    const it = g.itens;
    // Período: só votam os blocos em que o período/natureza aparece (periodo_explicito !== false)
    const explicitos = it.filter((x) => x.periodo_explicito !== false);
    const votos = (explicitos.length ? explicitos : it)
      .map((x) => (Number.isInteger(Number(x.periodo)) && Number(x.periodo) > 0 ? Number(x.periodo) : null));
    // Empate entre "optativa" (null) e um período: vence optativa. Fichas de optativas costumam trazer um
    // "período sugerido", enquanto obrigatórias recebem o mesmo período em todos os blocos.
    const contPer = new Map();
    votos.forEach((v) => contPer.set(v, (contPer.get(v) || 0) + 1));
    const maxPer = Math.max(...contPer.values());
    let periodo = contPer.get(null) === maxPer ? null : moda(votos);
    if (periodo === null && !explicitos.length && votos.some((v) => v !== null)) periodo = moda(votos.filter((v) => v !== null));
    // Carga horária: valores < 10 parecem créditos e só valem se não houver outro; votam os blocos com período
    // explícito (matriz/ficha); no empate vence o MAIOR (horas-aula > horas-relógio, padrão do GradMent).
    const baseCh = (explicitos.length ? explicitos : it).map((x) => Math.round(Number(x.carga_horaria) || 0)).filter((v) => v > 0);
    const plausiveis = baseCh.filter((v) => v >= 10);
    const chs = plausiveis.length ? plausiveis : baseCh;
    const maisLongo = (campo) => it.map((x) => String(x[campo] ?? '').trim()).sort((a, b) => b.length - a.length)[0] || null;
    return {
      codigo: moda(it.map((x) => String(x.codigo || '').toUpperCase()).filter(Boolean)) || '',
      codigo_externo: moda(it.map((x) => x.codigo_externo).filter(Boolean)) || null,
      nome: maisLongo('nome'),
      periodo,
      eixo: moda(it.map((x) => x.eixo).filter(Boolean)) || null,
      carga_horaria: chs.length ? modaMaior(chs) : 0,
      ementa: maisLongo('ementa'),
      _grupo: g,
    };
  });
  // Código de saída único por disciplina fundida (o comparador e o validador ainda normalizam depois)
  const usados = new Set();
  for (const d of disciplinas) {
    const base = normCod(d.codigo) || normCod(d.codigo_externo) || 'DISC1';
    let k = base;
    let n = 2;
    while (usados.has(k)) k = `${base}${n++}`;
    usados.add(k);
    d.codigo = k;
    d._grupo.codigoFinal = k;
  }

  // Requisitos: resolve o código local do bloco; se a disciplina estiver em outro bloco, procura pelo
  // código oficial ou pelo nome em todo o PPC.
  const globalPorCod = new Map();
  for (const g of grupos) {
    for (const x of g.itens) {
      if (x.codigo) globalPorCod.set(normCod(x.codigo), g);
      if (x.codigo_externo) globalPorCod.set(normCod(x.codigo_externo), g);
    }
  }
  const resolver = (cod, b) => {
    const k = normCod(cod);
    return porCodBloco[b].get(k) || porExt.get(k) || globalPorCod.get(k) || porNome.get(chaveNomeDisciplina(cod)) || null;
  };
  const votosDep = new Map();
  let naoResolvidos = 0;
  resultados.forEach((r, b) => {
    for (const dep of Array.isArray(r?.dependencias) ? r.dependencias : []) {
      const a = resolver(dep.disciplina_codigo, b);
      const req = resolver(dep.dependencia_codigo, b);
      const tipo = String(dep.tipo || '').toUpperCase() === 'CO' ? 'CO' : 'PRE';
      if (!a || !req || a === req) { naoResolvidos += 1; continue; }
      const k = `${a.codigoFinal}>${req.codigoFinal}`;
      if (!votosDep.has(k)) votosDep.set(k, { disciplina_codigo: a.codigoFinal, dependencia_codigo: req.codigoFinal, tipos: [] });
      votosDep.get(k).tipos.push(tipo);
    }
  });
  const dependencias = [...votosDep.values()].map((v) => {
    const co = v.tipos.filter((t) => t === 'CO').length;
    return { disciplina_codigo: v.disciplina_codigo, dependencia_codigo: v.dependencia_codigo, tipo: co > v.tipos.length - co ? 'CO' : 'PRE' };
  });

  const validos = resultados.filter(Boolean);
  const nomeCurso = moda(validos.map((r) => r.curso?.nome_curso).filter(Boolean)) || '';
  const obrig = disciplinas.filter((d) => d.periodo !== null);
  return {
    e_ppc_valido: validos.some((r) => r.e_ppc_valido),
    alerta_instrucao_suspeita: validos.some((r) => r.alerta_instrucao_suspeita),
    verificacao_inicial: {
      nome_curso_identificado: nomeCurso,
      regra_conversao_creditos: validos.map((r) => r.verificacao_inicial?.regra_conversao_creditos).find(Boolean) || '',
      total_periodos_obrigatorios: obrig.length ? Math.max(...obrig.map((d) => d.periodo)) : 0,
      total_obrigatorias_contadas: obrig.length,
      total_optativas_contadas: disciplinas.length - obrig.length,
      observacoes: `Lido em ${resultados.length} bloco(s) e fundido. ${naoResolvidos} requisito(s) sem disciplina correspondente foram descartados.`,
    },
    curso: { nome_curso: nomeCurso, ano_periodo: moda(validos.map((r) => r.curso?.ano_periodo).filter(Boolean)) || '' },
    disciplinas: disciplinas.map(({ _grupo, ...d }) => d),
    dependencias,
    _requisitos_nao_resolvidos: naoResolvidos,
  };
}

// Lê o PPC INTEIRO com uma IA, em loop de blocos de páginas, e devolve o resultado fundido + o registro da
// leitura. Se qualquer bloco falhar mesmo com as reservas, devolve erro: nunca há resultado parcial.
async function lerPpcEmBlocos(slot, prep, envObj, helpersN8n, fsMod) {
  const cfg = prep[slot];
  const outro = prep[slot === 'ia1' ? 'ia2' : 'ia1'] || {};
  const evitarModelo = outro.provider ? `${outro.provider}/${outro.model}` : '';
  const arquivoPrompt = slot === 'ia1' ? 'ia1-extratora-matriz.md' : 'ia2-auditora-ementario.md';
  const systemPrompt = fsMod.readFileSync(`/data/prompts/${arquivoPrompt}`, 'utf8');
  const schema = JSON.parse(fsMod.readFileSync('/data/prompts/schema-extracao.json', 'utf8'));
  const rotulo = slot === 'ia1' ? 'IA 1' : 'IA 2';

  const texto = String(prep.texto_sanitizado || '');
  const paginasNoTexto = [...new Set([...texto.matchAll(/--- \[PÁGINA (\d+)\] ---/g)].map((m) => Number(m[1])))];
  const totalPaginas = Number(prep.extracao?.paginas) || (paginasNoTexto.length ? Math.max(...paginasNoTexto) : 1);
  const blocos = dividirEmBlocos(texto, Number(prep.chars_por_bloco) || 60000);

  const instrucoes = [
    '<instrucoes_do_trecho>',
    'Este é um TRECHO de um PPC maior, lido em blocos. Extraia TODAS as disciplinas e TODOS os pré/correquisitos que aparecem NESTE trecho,',
    'inclusive disciplinas que aparecem só como linha da matriz, só como ficha do ementário ou só numa tabela de requisitos.',
    'Preencha apenas o que o trecho mostra. Em cada disciplina, informe periodo_explicito=true se o período ou a natureza',
    '(obrigatória/optativa) aparece neste trecho, e false se o trecho só traz a ementa ou uma citação da disciplina.',
    'Requisitos podem apontar para disciplinas de outros trechos: use o código oficial do PPC (ou o nome exato) da disciplina requisito.',
    'Só registre uma disciplina se o trecho trouxer DADO CURRICULAR dela: linha de matriz, ficha/ementa, carga horária, período ou requisito.',
    'NÃO extraia disciplinas citadas apenas pelo nome em sumários, listas de bibliografia/referências, matrizes antigas',
    '("projeto original"), tabelas de equivalência ou de outros cursos.',
    'Se o trecho mostrar a carga horária em horas-aula e em horas (relógio), use a de horas-aula; créditos devem ser convertidos em horas.',
    'Não invente nada que não esteja no trecho. Se o trecho não tiver conteúdo curricular, devolva listas vazias.',
    '</instrucoes_do_trecho>',
  ].join('\n');

  const registros = new Array(blocos.length);
  const extracoes = new Array(blocos.length);
  const falhas = [];
  let proximo = 0;
  async function trabalhador() {
    while (proximo < blocos.length) {
      const i = proximo++;
      const b = blocos[i];
      const mensagem = [
        '<contexto_execucao>',
        `curso_id_gradment: ${prep.curso_id}`,
        `ano_periodo_padrao: ${prep.ano_periodo}`,
        `nome_curso_esperado: ${prep.nome_curso_esperado || '(extrair do PPC)'}`,
        `trecho: páginas ${b.inicio} a ${b.fim} (bloco ${i + 1} de ${blocos.length}); o PPC tem ${totalPaginas} páginas`,
        '</contexto_execucao>',
        instrucoes,
        '<ppc_documento>',
        b.texto,
        '</ppc_documento>',
      ].join('\n');
      try {
        const r = await chamarLLMComReservas(cfg, systemPrompt, schema, mensagem, envObj, helpersN8n, evitarModelo);
        extracoes[i] = r.dados;
        registros[i] = {
          bloco: i + 1,
          paginas: `${b.inicio}–${b.fim}`,
          inicio: b.inicio,
          fim: b.fim,
          provider: r.provider,
          model: r.model,
          reserva: r.provider !== cfg.provider || r.model !== cfg.model,
          mesmo_modelo_da_outra_ia: `${r.provider}/${r.model}` === evitarModelo,
          disciplinas: Array.isArray(r.dados?.disciplinas) ? r.dados.disciplinas.length : 0,
          dependencias: Array.isArray(r.dados?.dependencias) ? r.dados.dependencias.length : 0,
        };
      } catch (e) {
        falhas.push(`páginas ${b.inicio}–${b.fim}: ${String(e?.message || e).slice(0, 220)}`);
      }
    }
  }
  // Dois blocos em paralelo por IA: rápido sem estourar os limites por minuto das cotas gratuitas
  await Promise.all([trabalhador(), trabalhador()]);

  if (falhas.length) {
    return {
      slot, provider: cfg.provider, model: cfg.model, simulado: false, resultado: null,
      erro: `${rotulo} não conseguiu ler ${falhas.length} de ${blocos.length} bloco(s) do PPC (${falhas.join(' ; ')}). `
        + 'Nenhum resultado parcial foi gerado: tente de novo em alguns minutos.',
    };
  }

  // Garantia de cobertura: toda página com texto precisa estar em algum bloco lido com sucesso
  const cobertas = new Set();
  registros.forEach((r) => { for (let p = r.inicio; p <= r.fim; p++) cobertas.add(p); });
  const naoCobertas = paginasNoTexto.filter((p) => !cobertas.has(p));
  if (naoCobertas.length) {
    return {
      slot, provider: cfg.provider, model: cfg.model, simulado: false, resultado: null,
      erro: `${rotulo}: as páginas ${naoCobertas.slice(0, 20).join(', ')} não foram lidas. Nenhum resultado parcial foi gerado.`,
    };
  }

  const resultado = mesclarExtracoesBlocos(extracoes);
  const contagem = new Map();
  registros.forEach((r) => { const k = `${r.provider}/${r.model}`; contagem.set(k, (contagem.get(k) || 0) + 1); });
  const [principal] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  const [provPrincipal, ...resto] = principal.split('/');
  return {
    slot,
    provider: provPrincipal,
    model: resto.join('/'),
    simulado: false,
    erro: null,
    resultado,
    leitura: {
      paginas_total: totalPaginas,
      paginas_com_texto: paginasNoTexto.length,
      paginas_lidas: cobertas.size,
      cobertura_completa: true,
      blocos: registros,
      modelos_usados: Object.fromEntries(contagem),
      requisitos_nao_resolvidos: resultado._requisitos_nao_resolvidos,
    },
  };
}
