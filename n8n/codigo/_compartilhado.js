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

