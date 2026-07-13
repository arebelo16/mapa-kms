/* Bloqueio local por Passkey (WebAuthn).
 *
 * Esta app não tem servidor de autenticação: não há "conta" nenhures.
 * A passkey funciona como um bloqueio ao dispositivo (equivalente a um
 * ecrã de bloqueio) — impede que outra pessoa que pegue no telemóvel/PC
 * desbloqueado abra a app e gere um mapa de kms em teu nome. Não protege
 * dados "no servidor" porque não existe servidor: tudo fica no localStorage
 * do próprio dispositivo. Por isso o "unlock" aqui confia no resultado da
 * cerimónia WebAuthn (sucesso = Face ID/Touch ID/Windows Hello validou o
 * dono do dispositivo) em vez de verificar a assinatura contra uma chave
 * pública guardada — não há nenhuma parte remota a proteger contra.
 */

const RP_NAME = 'Mapa de Kms';
const USER_NAME = 'arebelo16';
const CRED_KEY = 'kmsPasskeyCredentialId';
const UNLOCKED_KEY = 'kmsUnlockedSession';

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

function webAuthnSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

function temPasskey() {
  return !!localStorage.getItem(CRED_KEY);
}

async function criarPasskey() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: RP_NAME },
      user: { id: userId, name: USER_NAME, displayName: USER_NAME },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });
  localStorage.setItem(CRED_KEY, bufToBase64url(cred.rawId));
  return cred;
}

async function pedirPasskey(useStoredId) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const opts = { challenge, timeout: 60000, userVerification: 'required' };
  if (useStoredId) {
    const credId = localStorage.getItem(CRED_KEY);
    if (credId) opts.allowCredentials = [{ id: base64urlToBuf(credId), type: 'public-key' }];
  }
  const assertion = await navigator.credentials.get({ publicKey: opts });
  if (!temPasskey() && assertion && assertion.rawId) {
    localStorage.setItem(CRED_KEY, bufToBase64url(assertion.rawId));
  }
  return assertion;
}

function marcarSessaoDesbloqueada() {
  sessionStorage.setItem(UNLOCKED_KEY, '1');
}

function sessaoDesbloqueada() {
  return sessionStorage.getItem(UNLOCKED_KEY) === '1';
}

function bloquearSessao() {
  sessionStorage.removeItem(UNLOCKED_KEY);
  location.reload();
}

function mostrarApp() {
  document.getElementById('lock-screen').hidden = true;
  document.getElementById('app-root').hidden = false;
}

function mostrarBloqueio() {
  document.getElementById('lock-screen').hidden = false;
  document.getElementById('app-root').hidden = true;
}

function initLockScreen() {
  const statusEl = document.getElementById('lock-status');
  const errorEl = document.getElementById('lock-error');
  const btnUnlock = document.getElementById('btn-unlock');
  const btnCreate = document.getElementById('btn-create-passkey');
  const btnExisting = document.getElementById('btn-use-existing');

  if (!webAuthnSupported()) {
    statusEl.textContent = 'Este browser não suporta passkeys. Usa Safari, Chrome ou Edge atualizados.';
    return;
  }

  if (sessaoDesbloqueada()) {
    mostrarApp();
    return;
  }

  if (temPasskey()) {
    statusEl.textContent = 'Sessão bloqueada.';
    btnUnlock.hidden = false;
    btnUnlock.addEventListener('click', async () => {
      errorEl.textContent = '';
      btnUnlock.disabled = true;
      try {
        const assertion = await pedirPasskey(true);
        if (assertion) {
          marcarSessaoDesbloqueada();
          mostrarApp();
        }
      } catch (e) {
        errorEl.textContent = 'Não foi possível desbloquear: ' + e.message;
      } finally {
        btnUnlock.disabled = false;
      }
    });
  } else {
    statusEl.textContent = 'Ainda não há passkey criada neste dispositivo.';
    btnCreate.hidden = false;
    btnExisting.hidden = false;
    btnCreate.addEventListener('click', async () => {
      errorEl.textContent = '';
      btnCreate.disabled = true;
      try {
        await criarPasskey();
        marcarSessaoDesbloqueada();
        mostrarApp();
      } catch (e) {
        errorEl.textContent = 'Não foi possível criar a passkey: ' + e.message;
      } finally {
        btnCreate.disabled = false;
      }
    });
    btnExisting.addEventListener('click', async () => {
      errorEl.textContent = '';
      try {
        const assertion = await pedirPasskey(false);
        if (assertion) {
          marcarSessaoDesbloqueada();
          mostrarApp();
        }
      } catch (e) {
        errorEl.textContent = 'Não encontrada: ' + e.message;
      }
    });
  }
}

function initSettingsSecurity() {
  const statusEl = document.getElementById('passkey-status');
  const btnAdd = document.getElementById('btn-add-passkey');
  statusEl.textContent = temPasskey()
    ? 'Passkey ativa neste dispositivo.'
    : 'Sem passkey neste dispositivo.';
  btnAdd.addEventListener('click', async () => {
    try {
      await criarPasskey();
      statusEl.textContent = 'Passkey ativa neste dispositivo.';
    } catch (e) {
      statusEl.textContent = 'Erro ao criar passkey: ' + e.message;
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initLockScreen();
  initSettingsSecurity();
  document.getElementById('btn-lock').addEventListener('click', bloquearSessao);
});
