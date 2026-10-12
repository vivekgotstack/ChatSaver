const fs = require('fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/import/chat-markdown.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const normalize = loaded.exports.normalizeChatMarkdown;
const example = fs.readFileSync(process.argv[2], 'utf8');
const output = normalize(example);
assert(!/<\/?(?:box|grid|text|icon|caption|row)\b/.test(output));
assert(!output.includes('{#each'));
for (const label of ['VM 1', 'VM 2', 'Container 1', 'Container 2', 'systemd-detect-virt', 'uname -r', 'Spring Boot', 'Career track:']) assert(output.includes(label), label);
assert.equal(normalize(output), output);
for (const fence of ['```', '~~~~']) {
  const code = `${fence}typescript\nconst x = '<box>hello</box>';\n${fence}`;
  assert.equal(normalize(code), code);
}
const markdown = '# Heading\n\n- **Bold**\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
assert.equal(normalize(markdown), markdown);
assert.equal(normalize('Use `<box>hello</box>` in code.'), 'Use `<box>hello</box>` in code.');
console.log('Passed: supplied example, loop expansion, content retention, fenced code, ordinary Markdown, idempotence.');
