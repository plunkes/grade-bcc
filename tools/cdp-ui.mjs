/* Dirige a UI no Chrome headless: injeta document.pdf no input, aguarda o
   planejador e devolve diagnostico + screenshot. Uso:
   node --experimental-websocket tools/cdp-ui.mjs <url> <saida.png> [passos.js] */
import fs from 'node:fs/promises';

const [url, png, extraFile] = process.argv.slice(2);
const alvo = await (await fetch(`http://localhost:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
let id = 0; const pend = new Map(); const logs = [];
const cmd = (method, params = {}) => new Promise((res) => { pend.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) pend.get(m.id)(m);
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
};
await new Promise((r) => { ws.onopen = r; });
await cmd('Runtime.enable');
await cmd('Network.enable');
await cmd('Network.setCacheDisabled', { cacheDisabled: true });
await cmd('Page.enable');
await cmd('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 1200));
await cmd('Emulation.setDeviceMetricsOverride', { width: 1480, height: 940, deviceScaleFactor: 1, mobile: false });
await new Promise((r) => setTimeout(r, 2200));

const carregar = `(async () => {
  const r = await fetch('/document.pdf');
  const f = new File([await r.blob()], 'historico.pdf', { type: 'application/pdf' });
  const dt = new DataTransfer(); dt.items.add(f);
  const campo = document.getElementById('arquivo');
  campo.files = dt.files;
  campo.dispatchEvent(new Event('change'));
  for (let i = 0; i < 100 && document.getElementById('tela-app').hidden; i++) await new Promise(r => setTimeout(r, 150));
  return document.getElementById('tela-app').hidden ? 'FALHOU: ' + document.getElementById('zona-erro').textContent : 'ok';
})()`;
const r1 = await cmd('Runtime.evaluate', { expression: carregar, awaitPromise: true, returnByValue: true, timeout: 60000 });
console.log('carga:', JSON.stringify(r1.result?.result?.value ?? r1.result));

if (extraFile) {
  const extra = await fs.readFile(extraFile, 'utf8');
  const r2 = await cmd('Runtime.evaluate', { expression: extra, awaitPromise: true, returnByValue: true, timeout: 60000 });
  console.log('passos:', JSON.stringify(r2.result?.result?.value ?? r2.result, null, 1));
}

if (png) {
  const shot = await cmd('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) await fs.writeFile(png, Buffer.from(shot.result.data, 'base64'));
}
if (logs.length) console.log('console:\n' + logs.join('\n'));
await fetch(`http://localhost:9222/json/close/${alvo.id}`);
ws.close();
