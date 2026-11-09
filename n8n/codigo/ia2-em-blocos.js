// @usa-compartilhado
// IA 2 lê o PPC inteiro em loop de blocos de páginas e funde os resultados (ver lerPpcEmBlocos).
const fs = require('fs');
const prep = $input.first().json;
return [{ json: await lerPpcEmBlocos('ia2', prep, $env, this.helpers, fs) }];
