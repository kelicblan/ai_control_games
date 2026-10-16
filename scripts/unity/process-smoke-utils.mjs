/** A single deadline covers response headers and the first streamed chunk. */
export async function cancelAfterFirstChunk(url, { headers, body, timeoutMs = 10000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Stream deadline exceeded')), timeoutMs);
  let reader;
  try {
    const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`Cancellation stream HTTP ${response.status}`);
    reader = response.body.getReader();
    const first = await reader.read();
    if (first.done) throw new Error('Stream finished before cancellation could be exercised');
    clearTimeout(timer);
    controller.abort();
    await reader.cancel().catch(() => {});
  } catch (error) {
    if (controller.signal.reason?.message === 'Stream deadline exceeded') throw new Error('Stream deadline exceeded', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
  }
}
