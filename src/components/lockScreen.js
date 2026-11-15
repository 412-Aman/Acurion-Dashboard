// Full-screen passphrase prompt shown before the encrypted case workspace opens.
import { escapeHTML as esc } from './icons.js';

const mark = '<svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden="true"><path d="m5 25 11-20 11 20M10 20h12M16 5v10" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="25" r="2.3" fill="#ff6b35"/></svg>';
const lock = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

export function requestPassphrase({ mode, scopeLabel, error = '', canReset = false }) {
  return new Promise(resolve => {
    document.getElementById('vault-screen')?.remove();
    const setup = mode === 'setup';
    const screen = document.createElement('div');
    screen.id = 'vault-screen';
    screen.className = 'vault-screen';
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');
    screen.setAttribute('aria-labelledby', 'vault-title');
    screen.innerHTML = `<div class="vault-card"><div class="vault-brand">${mark}<strong>ACURION</strong></div><span class="vault-icon">${lock}</span><span class="section-kicker">${esc(scopeLabel)}</span><h1 id="vault-title">${setup ? 'Protect this case workspace' : 'Unlock the case workspace'}</h1><p class="vault-copy">${setup ? 'Cases, customer profiles, notes and documents are encrypted with AES-256 before they are stored. Choose a passphrase of at least 10 characters. It is never stored or sent anywhere.' : 'Cases, customer profiles, notes and documents are encrypted. Enter the workspace passphrase to open them.'}</p>${error ? `<p class="vault-error" role="alert">${esc(error)}</p>` : ''}<form class="vault-form" novalidate><label class="field">Passphrase<input class="input" type="password" name="passphrase" autocomplete="${setup ? 'new-password' : 'current-password'}" minlength="10" required autofocus></label>${setup ? '<label class="field">Confirm passphrase<input class="input" type="password" name="confirm" autocomplete="new-password" minlength="10" required></label>' : ''}<button class="btn-primary vault-submit" type="submit">${setup ? 'Encrypt and open' : 'Unlock'}</button></form><p class="vault-note">${setup ? 'Anyone who opens this workspace needs the same passphrase. Keep it somewhere safe; it cannot be recovered.' : 'The workspace locks again after 15 minutes without activity or when you sign out.'}</p>${canReset ? '<button type="button" class="text-button vault-reset">Forgot it? Start a new demo workspace</button>' : ''}</div>`;
    document.body.append(screen);
    const form = screen.querySelector('form'), input = form.elements.passphrase;
    input.focus();
    form.addEventListener('submit', event => {
      event.preventDefault();
      const value = input.value, confirm = form.elements.confirm?.value;
      const fail = message => { screen.querySelector('.vault-error')?.remove(); form.insertAdjacentHTML('beforebegin', `<p class="vault-error" role="alert">${esc(message)}</p>`); };
      if (value.length < 10) return fail('Use at least 10 characters.');
      if (setup && value !== confirm) return fail('The two passphrases do not match.');
      const button = form.querySelector('.vault-submit');
      button.disabled = true;
      button.textContent = setup ? 'Encrypting…' : 'Unlocking…';
      resolve({ passphrase: value, done: () => screen.remove() });
    });
    screen.querySelector('.vault-reset')?.addEventListener('click', () => resolve({ reset: true, done: () => screen.remove() }));
  });
}
