/* Painel de administração — só visível para role === 'admin'. */

async function carregarUtilizadores() {
  const listEl = document.getElementById('users-list');
  listEl.innerHTML = '<p class="muted">A carregar…</p>';
  try {
    const data = await authFetch('/admin/users/list', { method: 'POST' });
    listEl.innerHTML = '';
    const me = getCurrentUser();
    data.users
      .sort((a, b) => a.username.localeCompare(b.username))
      .forEach((u) => {
        const row = document.createElement('div');
        row.className = 'user-row';
        const date = new Date(u.createdAt).toLocaleDateString('pt-PT');

        const info = document.createElement('div');
        info.className = 'user-row-info';
        const strong = document.createElement('strong');
        strong.textContent = u.username;
        const badge = document.createElement('span');
        badge.className = 'role-badge role-' + (u.role === 'admin' ? 'admin' : 'user');
        badge.textContent = u.role === 'admin' ? 'Admin' : 'Utilizador';
        const small = document.createElement('small');
        small.className = 'muted';
        small.textContent = `${u.passkeyCount} passkey(s) · desde ${date}`;
        info.append(strong, badge, small);
        row.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'user-row-actions';

        const btnReset = document.createElement('button');
        btnReset.className = 'btn-secondary btn-small';
        btnReset.textContent = 'Repor password';
        btnReset.addEventListener('click', () => resetarPassword(u.username));
        actions.appendChild(btnReset);

        if (u.username !== me.username) {
          const btnDel = document.createElement('button');
          btnDel.className = 'btn-danger btn-small';
          btnDel.textContent = 'Eliminar';
          btnDel.addEventListener('click', () => eliminarUtilizador(u.username));
          actions.appendChild(btnDel);
        }

        row.appendChild(actions);
        listEl.appendChild(row);
      });
  } catch (e) {
    listEl.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'lock-error';
    p.textContent = e.message;
    listEl.appendChild(p);
  }
}

async function resetarPassword(username) {
  const newPassword = prompt(`Nova password temporária para "${username}" (mín. 8 caracteres):`);
  if (!newPassword) return;
  try {
    await authFetch('/admin/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, newPassword }),
    });
    showToast(`Password de ${username} reposta.`);
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

async function eliminarUtilizador(username) {
  if (!confirm(`Eliminar o utilizador "${username}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await authFetch('/admin/users/delete', { method: 'POST', body: JSON.stringify({ username }) });
    showToast(`Utilizador ${username} eliminado.`);
    carregarUtilizadores();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

function initAdminPanel() {
  const panel = document.getElementById('admin-panel');
  document.getElementById('btn-admin').addEventListener('click', () => {
    panel.hidden = false;
    carregarUtilizadores();
  });
  document.getElementById('btn-close-admin').addEventListener('click', () => {
    panel.hidden = true;
  });

  const btnCreate = document.getElementById('btn-create-user');
  const statusEl = document.getElementById('admin-create-status');
  btnCreate.addEventListener('click', async () => {
    statusEl.textContent = '';
    const username = document.getElementById('newUserUsername').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    if (!username || !password) {
      statusEl.textContent = 'Preenche utilizador e password.';
      return;
    }
    setBtnLoading(btnCreate, true);
    try {
      await authFetch('/admin/users/create', {
        method: 'POST',
        body: JSON.stringify({ username, password, role }),
      });
      statusEl.textContent = `Utilizador ${username} criado.`;
      document.getElementById('newUserUsername').value = '';
      document.getElementById('newUserPassword').value = '';
      carregarUtilizadores();
    } catch (e) {
      statusEl.textContent = 'Erro: ' + e.message;
    } finally {
      setBtnLoading(btnCreate, false);
    }
  });
}

window.addEventListener('DOMContentLoaded', initAdminPanel);
