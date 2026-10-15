import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { remoteEndpoint, validateRemote } from '../../src/shared/remote-model';

const bigModelErrors: Record<string, string> = {
  '1113': '智谱账户余额不足或已欠费（HTTP 429，错误码 1113）。请检查 API 余额；Coding Plan 套餐需使用 /api/coding/paas/v4。',
  '1302': '智谱请求频率超限（HTTP 429，错误码 1302），请稍后重试。',
  '1305': '智谱模型当前繁忙（HTTP 429，错误码 1305），请稍后重试。',
  '1308': '智谱套餐使用额度已达到上限（HTTP 429，错误码 1308），请等待额度恢复。',
  '1309': '智谱 Coding Plan 套餐已到期（HTTP 429，错误码 1309）。',
  '1310': '智谱每周或每月使用额度已达到上限（HTTP 429，错误码 1310）。',
  '1311': '智谱当前套餐没有此模型权限（HTTP 429，错误码 1311）。',
};

const reserved = new BlockList();
for (const [ip, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) reserved.addSubnet(ip, prefix, 'ipv4');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
reserved.addSubnet('2001:db8::', 32, 'ipv6'); reserved.addSubnet('2002::', 16, 'ipv6'); reserved.addSubnet('2001::', 32, 'ipv6');
export function isPublicAddress(ip: string) {
  if (isIP(ip) === 4) return !reserved.check(ip, 'ipv4');
  return isIP(ip) === 6 && globalV6.check(ip, 'ipv6') && !reserved.check(ip, 'ipv6');
}
type Resolve = (host: string) => Promise<{ address: string; family: number }[]>;
const proxyDNS = new BlockList(); proxyDNS.addSubnet('198.18.0.0', 15, 'ipv4');
const dnsCache = new Map<string, { until: number; addresses: { address: string; family: number }[] }>();
async function publicDNS(host: string) {
  const cached = dnsCache.get(host); if (cached && cached.until > Date.now()) return cached.addresses;
  // Only a fixed TLS-authenticated resolver is contacted; target addresses are still checked and pinned.
  const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, {
    headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(3000), redirect: 'error',
  });
  if (!response.ok) throw new Error('公网 DNS 校验失败，请检查网络代理');
  const body = await response.text(); if (body.length > 64000) throw new Error('公网 DNS 校验失败，请检查网络代理');
  const data = JSON.parse(body);
  const addresses = (Array.isArray(data.Answer) ? data.Answer : []).filter((a: { type: number }) => a.type === 1)
    .map((a: { data: string }) => ({ address: a.data, family: 4 }));
  if (data.Status !== 0 || !addresses.length || addresses.some((a: { address: string }) => !isPublicAddress(a.address))) throw new Error('远程接口必须使用公网地址');
  if (dnsCache.size >= 128) dnsCache.delete(dnsCache.keys().next().value!);
  dnsCache.set(host, { until: Date.now() + 30000, addresses }); return addresses;
}
export async function resolveRemote(url: URL, resolve: Resolve = host => lookup(host, { all: true }),
  recover: Resolve = publicDNS) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('远程接口必须使用公网地址');
  let addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolve(host);
  if (!isIP(host) && addresses.length && addresses.every(a => isIP(a.address) === 4 && proxyDNS.check(a.address, 'ipv4'))) addresses = await recover(host);
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('远程接口必须使用公网地址');
  return addresses;
}
type Send = (url: URL, payload: unknown, key: string, signal: AbortSignal) => Promise<{ status: number; body: string }>;
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('请求已取消', 'AbortError'));
    if (signal.aborted) { reject(new DOMException('请求已取消', 'AbortError')); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function remoteMessages(prompt: string) {
  const sections = [...prompt.matchAll(/<\|im_start\|>(system|user)\n([\s\S]*?)<\|im_end\|>/g)];
  return sections.length ? sections.map(match => ({ role: match[1], content: match[2] })) : [{ role: 'user', content: prompt }];
}
/** 固定已校验 DNS 结果，TLS 仍校验原域名；不跟随任何重定向。 */
export const sendRemote: Send = async (url, payload, key, signal) => {
  const addresses = await resolveRemote(url); signal.throwIfAborted();
  const pinnedLookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
  return new Promise((resolve, reject) => {
    const bytes = Buffer.from(JSON.stringify(payload));
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'POST', lookup: pinnedLookup, signal,
      headers: { 'Content-Type': 'application/json', 'Content-Length': bytes.length, ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    }, response => {
      let length = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > 256 * 1024) { request.destroy(new Error('远程模型响应过大')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode ?? 502, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject); request.end(bytes);
  });
};
export async function remoteCompletion(raw: unknown, signal: AbortSignal, send: Send = sendRemote) {
  const data = raw as { config?: unknown; apiKey?: unknown; prompt?: unknown; test?: boolean; cognition?: boolean };
  const config = validateRemote(data?.config);
  if (typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 8000) throw new Error('对话请求无效');
  if (data.apiKey !== undefined && (typeof data.apiKey !== 'string' || data.apiKey.length > 4096 || /[\r\n]/.test(data.apiKey))) throw new Error('API Key 格式无效');
  const started = Date.now(), timeout = AbortSignal.timeout(data.test ? 20000 : 30000);
  const combined = AbortSignal.any([signal, timeout]);
  try {
    combined.throwIfAborted();
    const result = await abortable(send(new URL(remoteEndpoint(config.baseUrl)), {
      model: config.model, messages: remoteMessages(data.prompt), stream: false,
      ...(/^glm-5\.3(?:-|$)/i.test(config.model) ? { reasoning_effort: 'low' } : {}),
      max_tokens: data.cognition === true ? 768 : /^glm-5(?:[.-]|$)/i.test(config.model) ? 1024 : data.test ? 8 : 64, temperature: .7,
    }, data.apiKey as string ?? '', combined), combined);
    if (Buffer.byteLength(result.body) > 256 * 1024) throw new Error('远程模型响应过大');
    if (result.status < 200 || result.status >= 300) {
      if (new URL(config.baseUrl).hostname === 'open.bigmodel.cn' && result.status === 429) {
        let code = '';
        try { code = String(JSON.parse(result.body)?.error?.code ?? ''); } catch { /* Never expose upstream error text. */ }
        if (bigModelErrors[code]) throw new Error(bigModelErrors[code]);
      }
      throw new Error(`远程模型请求失败（HTTP ${result.status}）`);
    }
    let parsed;
    try { parsed = JSON.parse(result.body); } catch { throw new Error('远程模型未返回有效 JSON'); }
    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      if (parsed?.choices?.[0]?.finish_reason === 'length') throw new Error('模型输出额度不足，尚未生成正文');
      throw new Error('远程模型未返回有效文本');
    }
    if (data.cognition && content.length > 12000) throw new Error('远程模型响应过大');
    return { content: content.slice(0, data.cognition ? 12000 : 8000), latencyMs: Date.now() - started };
  } catch (error) {
    if (signal.aborted) throw new DOMException('请求已取消', 'AbortError');
    if (timeout.aborted) throw new Error('远程模型请求超时');
    // 仅透传本模块构造的固定错误，提供商响应、URL 和密钥不可进入日志或 UI。
    const text = error instanceof Error ? error.message : '';
    if (Object.values(bigModelErrors).includes(text)) throw error;
    if (/^(远程模型请求失败（HTTP \d{3}）|远程模型响应过大|远程模型未返回有效 JSON|远程模型未返回有效文本|远程接口必须使用公网地址|公网 DNS 校验失败，请检查网络代理|模型输出额度不足，尚未生成正文)$/.test(text)) throw error;
    throw new Error('远程模型连接失败，请检查接口配置');
  }
}
