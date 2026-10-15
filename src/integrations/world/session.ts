let session: Promise<void> | undefined;
/** Establish the cookie before concurrent world and model requests. */
export function ensurePlayerSession(): Promise<void> {
  if (!session) session = fetch('/game-api/session', {
    credentials: 'same-origin', cache: 'no-store', headers: { 'X-Camp-Tab': 'player-session' },
    signal: AbortSignal.timeout(10000),
  }).then(response => {
    if (!response.ok) throw new Error('无法建立当前玩家会话');
  }).catch(error => { session = undefined; throw error; });
  return session;
}
