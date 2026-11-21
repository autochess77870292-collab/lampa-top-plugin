const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'main.js');

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
let code = '// main.js — Автосборка плагина "Мой топ"\n(function () {\n    \'use strict\';\n\n';
for (const f of files) {
    code += '    // ===== src/' + f + ' =====\n';
    code += fs.readFileSync(path.join(SRC, f), 'utf8');
    code += '\n';
}
code += '})();\n';

fs.writeFileSync(OUT, code);
console.log('Собрано: main.js (' + files.length + ' файлов)');