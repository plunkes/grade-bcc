// Dirigir o Chrome headless por CDP: avalia uma expressao na pagina e imprime o retorno.
const [url, expr] = [process.argv[2], process.argv[3]];
const alvo = await (await fetch(`http://localhost:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
const cmd = (method, params = {}) => new Promise((res) => { pend.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); };
await new Promise((r) => { ws.onopen = r; });
await cmd('Runtime.enable');
await cmd('Page.enable');
await new Promise((r) => setTimeout(r, 2500));
const out = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 60000 });
console.log(JSON.stringify(out.result?.result?.value ?? out.result, null, 1));
await fetch(`http://localhost:9222/json/close/${alvo.id}`);
ws.close();
