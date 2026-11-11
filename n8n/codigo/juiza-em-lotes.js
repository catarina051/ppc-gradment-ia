// @usa-compartilhado
// IA 3 (Juíza) arbitra as divergências em lotes, cada um com o PPC inteiro como evidência (ver julgarEmLotes).
const fs = require('fs');
const comp = $('Comparar IAs e Detectar Divergências').first().json;
const prep = $('Preparar IAs').first().json;
const r = await julgarEmLotes(comp, prep, $env, this.helpers, fs);
return [{ json: r.erro ? { erro: r.erro } : { julgamento_lotes: r.julgamento, provider: r.provider, model: r.model, lotes: r.lotes } }];
