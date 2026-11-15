const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#1a1a2e');
  tg.setBackgroundColor('#1a1a2e');
}

async function api(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function register() {
  const r = await api('/api/register', { username: username.value, password: password.value });
  if (r.error) authMsg.textContent = r.error;
  else initGame();
}

async function login() {
  const r = await api('/api/login', { username: username.value, password: password.value });
  if (r.error) authMsg.textContent = r.error;
  else initGame();
}

async function logout() {
  await api('/api/logout', {});
  location.reload();
}

async function initGame() {
  if (tg?.initData) {
    await api('/api/telegram-auth', { initData: tg.initData });
  }
  const me = await api('/api/me');
  if (me.error) {
    auth.classList.remove('hidden');
    game.classList.add('hidden');
    return;
  }
  auth.classList.add('hidden');
  game.classList.remove('hidden');
  uname.textContent = me.username;
  balance.textContent = me.balance;
}

async function coin(choice) {
  const r = await api('/api/game/coin', { bet: coinBet.value, choice });
  if (r.error) return coinMsg.textContent = r.error;
  coinMsg.textContent = `${r.outcome === 'heads' ? '🦅 Орёл' : '🪙 Решка'} | ${r.win > 0 ? '🎉 +' + r.win : '💸 ' + r.win} ₽`;
  balance.textContent = r.balance;
}

async function dice() {
  const r = await api('/api/game/dice', { bet: diceBet.value, guess: diceGuess.value });
  if (r.error) return diceMsg.textContent = r.error;
  diceMsg.textContent = `🎲 Выпало ${r.roll} | ${r.win > 0 ? '🎉 +' + r.win : '💸 ' + r.win} ₽`;
  balance.textContent = r.balance;
}

async function slots() {
  const r = await api('/api/game/slots', { bet: slotsBet.value });
  if (r.error) return slotsMsg.textContent = r.error;
  slotsMsg.textContent = `${r.reels.join(' | ')} | ${r.multiplier > 0 ? '🎉 x' + r.multiplier + ' (+' + r.win + ')' : '💸 ' + r.win} ₽`;
  balance.textContent = r.balance;
}

initGame();
