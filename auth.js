/* Autenticação: utilizador + password, ou passkey (WebAuthn real, verificado
 * no servidor). Só o admin (arebelo) pode criar novos utilizadores — não há
 * autorregisto. A criação de passkeys só acontece depois de autenticado,
 * em Definições → Passkeys.
 */

const WORKER_URL = 'https://mapa-kms-notify.arebelo16.workers.dev';
const TOKEN_KEY = 'kmsAuthToken';
const USER_KEY = 'kmsAuthUser';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
}
function setSession(token, username, role) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify({ username, role }));
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function authFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const resp = await fetch(WORKER_URL + path, { ...options, headers });
  let data = null;
  try { data = await resp.json(); } catch (e) { /* sem corpo */ }
  if (!resp.ok) {
    throw new Error((data && data.error) || `Erro (${resp.status})`);
  }
  return data;
}

// ---------- base64url <-> ArrayBuffer ----------

function bufToBase64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuf(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function serializeRegistrationCredential(cred) {
  return {
    id: cred.id,
    rawId: bufToBase64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToBase64url(cred.response.clientDataJSON),
      attestationObject: bufToBase64url(cred.response.attestationObject),
    },
  };
}

function serializeAssertionCredential(cred) {
  return {
    id: cred.id,
    rawId: bufToBase64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToBase64url(cred.response.clientDataJSON),
      authenticatorData: bufToBase64url(cred.response.authenticatorData),
      signature: bufToBase64url(cred.response.signature),
      userHandle: cred.response.userHandle ? bufToBase64url(cred.response.userHandle) : null,
    },
  };
}

function webAuthnSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

// ---------- Fluxos de autenticação ----------

async function loginComPassword(username, password) {
  const data = await authFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  setSession(data.token, data.username, data.role);
  return data;
}

async function loginComPasskey(username) {
  const opts = await authFetch('/auth/passkey/login-options', { method: 'POST', body: JSON.stringify({ username }) });
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: base64urlToBuf(opts.challenge),
      rpId: opts.rpId,
      allowCredentials: opts.allowCredentials.map((c) => ({ id: base64urlToBuf(c.id), type: c.type })),
      userVerification: 'required',
      timeout: 60000,
    },
  });
  const credential = serializeAssertionCredential(assertion);
  const data = await authFetch('/auth/passkey/login-verify', {
    method: 'POST',
    body: JSON.stringify({ challenge: opts.challenge, credential }),
  });
  setSession(data.token, data.username, data.role);
  return data;
}

async function adicionarPasskey(label) {
  const opts = await authFetch('/auth/passkey/register-options', { method: 'POST' });
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: base64urlToBuf(opts.challenge),
      rp: opts.rp,
      user: {
        id: base64urlToBuf(opts.user.id),
        name: opts.user.name,
        displayName: opts.user.displayName,
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      excludeCredentials: (opts.excludeCredentials || []).map((c) => ({ id: base64urlToBuf(c.id), type: c.type })),
      timeout: 60000,
      attestation: 'none',
    },
  });
  const credential = serializeRegistrationCredential(cred);
  await authFetch('/auth/passkey/register-verify', {
    method: 'POST',
    body: JSON.stringify({ challenge: opts.challenge, credential, label }),
  });
}

async function removerPasskey(id) {
  await authFetch('/auth/passkeys/delete', { method: 'POST', body: JSON.stringify({ id }) });
}

async function listarPasskeys() {
  const data = await authFetch('/auth/passkeys');
  return data.passkeys;
}

async function mudarPassword(oldPassword, newPassword) {
  await authFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
}

async function logout() {
  try { await authFetch('/auth/logout', { method: 'POST' }); } catch (e) { /* ignora */ }
  clearSession();
  location.reload();
}

// ---------- UI: ecrã de login ----------

function mostrarApp(user) {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app-root').hidden = false;
  document.getElementById('btn-admin').hidden = user.role !== 'admin';
}

function mostrarLogin() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app-root').hidden = true;
}

function setBtnLoading(btn, loading) {
  btn.disabled = loading;
  const label = btn.querySelector('.btn-label');
  if (label) label.style.visibility = loading ? 'hidden' : 'visible';
  const spinner = btn.querySelector('.spinner');
  if (spinner) spinner.hidden = !loading;
  if (!label && !spinner) btn.style.opacity = loading ? '0.6' : '1';
}

async function initLogin() {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const btnLogin = document.getElementById('btn-login');
  const btnPasskey = document.getElementById('btn-login-passkey');

  if (!webAuthnSupported()) btnPasskey.hidden = true;

  const token = getToken();
  if (token) {
    try {
      const me = await authFetch('/auth/me');
      mostrarApp(me);
      return;
    } catch (e) {
      clearSession();
    }
  }
  mostrarLogin();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    setBtnLoading(btnLogin, true);
    try {
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const data = await loginComPassword(username, password);
      mostrarApp(data);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      setBtnLoading(btnLogin, false);
    }
  });

  btnPasskey.addEventListener('click', async () => {
    errorEl.textContent = '';
    const username = document.getElementById('loginUsername').value.trim();
    if (!username) {
      errorEl.textContent = 'Escreve o utilizador para entrar com passkey.';
      return;
    }
    setBtnLoading(btnPasskey, true);
    try {
      const data = await loginComPasskey(username);
      mostrarApp(data);
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      setBtnLoading(btnPasskey, false);
    }
  });

  document.getElementById('btn-logout').addEventListener('click', logout);
}

// ---------- UI: passkeys em Definições ----------

async function renderPasskeyList() {
  const listEl = document.getElementById('passkey-list');
  const statusEl = document.getElementById('passkey-status');
  listEl.innerHTML = '<li class="muted">A carregar…</li>';
  try {
    const passkeys = await listarPasskeys();
    if (!passkeys.length) {
      listEl.innerHTML = '<li class="muted">Sem passkeys nesta conta.</li>';
      return;
    }
    listEl.innerHTML = '';
    passkeys.forEach((p) => {
      const li = document.createElement('li');
      const date = new Date(p.createdAt).toLocaleDateString('pt-PT');
      li.innerHTML = `<span>${p.label || 'Passkey'} <small class="muted">— ${date}</small></span>`;
      const btn = document.createElement('button');
      btn.className = 'icon-btn-small';
      btn.textContent = '✕';
      btn.addEventListener('click', async () => {
        try {
          await removerPasskey(p.id);
          renderPasskeyList();
        } catch (e) {
          statusEl.textContent = e.message;
        }
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  } catch (e) {
    listEl.innerHTML = '';
    statusEl.textContent = e.message;
  }
}

function initSettingsSecurity() {
  const btnAdd = document.getElementById('btn-add-passkey');
  const statusEl = document.getElementById('passkey-status');
  btnAdd.addEventListener('click', async () => {
    statusEl.textContent = '';
    setBtnLoading(btnAdd, true);
    try {
      await adicionarPasskey('Passkey — ' + new Date().toLocaleDateString('pt-PT'));
      statusEl.textContent = 'Passkey adicionada.';
      renderPasskeyList();
    } catch (e) {
      statusEl.textContent = 'Erro: ' + e.message;
    } finally {
      setBtnLoading(btnAdd, false);
    }
  });

  const btnChangePw = document.getElementById('btn-change-password');
  const pwStatus = document.getElementById('password-status');
  btnChangePw.addEventListener('click', async () => {
    pwStatus.textContent = '';
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    try {
      await mudarPassword(oldPassword, newPassword);
      pwStatus.textContent = 'Password alterada.';
      document.getElementById('oldPassword').value = '';
      document.getElementById('newPassword').value = '';
    } catch (e) {
      pwStatus.textContent = 'Erro: ' + e.message;
    }
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    renderPasskeyList();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initSettingsSecurity();
});
