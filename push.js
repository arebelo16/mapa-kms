/* Notificações push (lembrete mensal de preencher a timesheet). */

const VAPID_PUBLIC_KEY = 'BPrTLzEB3F8aAz1JOliICOfwctU0V9zCuKDesKkvbOcOj-dLja0wWVmGW_CykeS58w9TOmRWbwcxJrKy7t0SbpM';
const NOTIF_KEY = 'kmsNotifEnabled';

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function ativarNotificacoes() {
  if (!pushSupported()) {
    throw new Error('Este browser não suporta notificações push. No iPhone, instala a app primeiro (Adicionar ao Ecrã Principal).');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permissão de notificações negada.');
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array(base64urlToBuf(VAPID_PUBLIC_KEY)),
    });
  }
  await authFetch('/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  localStorage.setItem(NOTIF_KEY, '1');
  return sub;
}

async function desativarNotificacoes() {
  localStorage.removeItem(NOTIF_KEY);
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await authFetch('/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
  }
}

async function marcarTimesheetPreenchida() {
  await authFetch('/mark-done', { method: 'POST' });
}

function notificacoesAtivas() {
  return localStorage.getItem(NOTIF_KEY) === '1';
}

function initNotifSettings() {
  const toggle = document.getElementById('notifToggle');
  const statusEl = document.getElementById('notif-status');
  const btnMarkDone = document.getElementById('btn-mark-done');

  toggle.checked = notificacoesAtivas();

  toggle.addEventListener('change', async () => {
    statusEl.textContent = '';
    if (toggle.checked) {
      try {
        await ativarNotificacoes();
        statusEl.textContent = 'Lembretes ativados.';
      } catch (e) {
        toggle.checked = false;
        statusEl.textContent = e.message;
      }
    } else {
      await desativarNotificacoes();
      statusEl.textContent = 'Lembretes desativados.';
    }
  });

  btnMarkDone.addEventListener('click', async () => {
    btnMarkDone.disabled = true;
    try {
      await marcarTimesheetPreenchida();
      statusEl.textContent = 'Marcado — sem mais lembretes este mês.';
    } catch (e) {
      statusEl.textContent = 'Erro ao marcar: ' + e.message;
    } finally {
      btnMarkDone.disabled = false;
    }
  });
}

window.addEventListener('DOMContentLoaded', initNotifSettings);
