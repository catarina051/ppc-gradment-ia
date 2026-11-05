// @usa-compartilhado
// Extrai e valida o JSON retornado pela IA 2 (qualquer provedor: Gemini, OpenAI, Anthropic, OpenRouter).
const prep = $('Preparar IAs').first().json;
const cfg = prep.ia2;
const httpResp = $input.first().json;

try {
  const { dados, finishReason } = extrairJsonRespostaLLM(httpResp, cfg.provider);
  return [{
    json: {
      slot: 'ia2',
      provider: cfg.provider,
      model: cfg.model,
      finish_reason: finishReason,
      simulado: false,
      erro: null,
      resultado: dados,
    },
  }];
} catch (err) {
  try {
    const rec = await recuperarFalhaTransitoriaLLM(cfg, $env, err, this.helpers);
    return [{
      json: {
        slot: 'ia2',
        provider: rec.providerUsado,
        model: rec.modelUsado,
        finish_reason: rec.finishReason,
        simulado: false,
        erro: null,
        resultado: rec.dados,
      },
    }];
  } catch (errFinal) {
    return [{
      json: {
        slot: 'ia2',
        provider: cfg.provider,
        model: cfg.model,
        simulado: false,
        erro: `Falha na IA 2 (${cfg.provider}/${cfg.model}): ${errFinal.message}`,
        resultado: null,
      },
    }];
  }
}

