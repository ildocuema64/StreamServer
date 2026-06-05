// =============================================================================
// Loading utilities — global preloader, button states, page placeholders
// =============================================================================

export function showAppLoader(text = 'A iniciar...') {
  const el = document.getElementById('app-loader');
  if (!el) return;
  const textEl = el.querySelector('.app-loader-text');
  if (textEl) textEl.textContent = text;
  el.classList.add('active');
  el.setAttribute('aria-busy', 'true');
}

export function hideAppLoader() {
  const el = document.getElementById('app-loader');
  if (!el) return;
  el.classList.remove('active');
  el.setAttribute('aria-busy', 'false');
}

export function pageLoaderHTML(message = 'A carregar...') {
  return `<div class="page-loader" role="status" aria-live="polite">
    <div class="spinner"></div>
    <p>${message}</p>
  </div>`;
}

export function setButtonLoading(button, loading, loadingText = 'A processar...') {
  if (!button) return;
  const isControlBtn = button.classList.contains('control-btn');

  if (loading) {
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');

    if (isControlBtn) {
      if (!button.dataset.loadingLabel) {
        const label = button.querySelector('span');
        button.dataset.loadingLabel = label?.textContent || loadingText;
      }
      const label = button.querySelector('span');
      if (label) label.textContent = loadingText;
    } else {
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
      }
      button.innerHTML =
        `<span class="btn-spinner" aria-hidden="true"></span><span>${loadingText}</span>`;
    }
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');

    if (isControlBtn) {
      const label = button.querySelector('span');
      if (label && button.dataset.loadingLabel) {
        label.textContent = button.dataset.loadingLabel;
        delete button.dataset.loadingLabel;
      }
    } else if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

export async function withButtonLoading(button, fn, loadingText) {
  setButtonLoading(button, true, loadingText);
  try {
    return await fn();
  } finally {
    setButtonLoading(button, false);
  }
}

export function setFormLoading(form, loading) {
  if (!form) return;
  form.querySelectorAll('input, select, textarea, button').forEach((el) => {
    if (loading) {
      if (el.dataset.wasDisabled === undefined) {
        el.dataset.wasDisabled = el.disabled ? '1' : '0';
      }
      el.disabled = true;
    } else if (el.dataset.wasDisabled !== undefined) {
      el.disabled = el.dataset.wasDisabled === '1';
      delete el.dataset.wasDisabled;
    }
  });
}
