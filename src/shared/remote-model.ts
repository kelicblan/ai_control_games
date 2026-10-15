export interface RemoteConfig { id: string; name: string; baseUrl: string; model: string; requiresKey?: boolean; hasKey?: boolean }
export function remoteEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('请输入有效的接口地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('接口地址仅支持 HTTP(S)，不可包含账号、查询参数或片段');
  url.pathname = url.pathname.replace(/\/+$/, '');
  // The generic /api/v1 placeholder is not BigModel's OpenAI-compatible endpoint.
  if (url.hostname === 'open.bigmodel.cn' && /^\/api\/v1(?:\/chat\/completions)?$/.test(url.pathname)) url.pathname = '/api/paas/v4';
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url.href;
}
export function validateRemote(value: unknown): RemoteConfig {
  const data = value as Partial<RemoteConfig> | null;
  if (!data || typeof data.id !== 'string' || !/^remote-[a-z0-9][a-z0-9._-]{0,55}$/.test(data.id)) throw new Error('远程模型 ID 无效');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 60) throw new Error('模型名称需为 1–60 字');
  if (typeof data.model !== 'string' || !data.model.trim() || data.model.length > 120 || /[\r\n]/.test(data.model)) throw new Error('模型 ID 需为 1–120 字');
  if (typeof data.baseUrl !== 'string' || data.baseUrl.length > 2000) throw new Error('接口地址无效');
  remoteEndpoint(data.baseUrl);
  return { id: data.id, name: data.name.trim(), baseUrl: data.baseUrl.trim(), model: data.model.trim(), requiresKey: data.requiresKey === true };
}
