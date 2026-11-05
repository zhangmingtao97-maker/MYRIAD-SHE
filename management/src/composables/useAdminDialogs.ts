import { onBeforeUnmount, onMounted } from 'vue';

// Existing editors share modal behavior without remounting or discarding their drafts.
export function useAdminDialogs() {
  let observer: MutationObserver | undefined;
  const stack: { dialog: HTMLElement; previous: HTMLElement | null }[] = [];
  let originalOverflow = '';
  const focusable = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getClientRects().length > 0 && element.tabIndex >= 0 && !element.closest('[inert]'));
  function syncDialogs() {
    const hadDialog = stack.length > 0;
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"][role="dialog"], [aria-modal="true"][role="alertdialog"]'))
      .filter((dialog) => dialog.getClientRects().length > 0 && dialog.dataset.adminDialogManaged !== 'local');
    const closed = stack.filter((entry) => !dialogs.includes(entry.dialog));
    for (const entry of closed.reverse()) {
      stack.splice(stack.indexOf(entry), 1);
      const needsRestore = document.activeElement === document.body || entry.dialog.contains(document.activeElement);
      if (needsRestore && entry.previous?.isConnected && (!stack.length || stack[stack.length - 1]!.dialog.contains(entry.previous))) entry.previous.focus({ preventScroll: true });
    }
    for (const dialog of dialogs) {
      if (stack.some((entry) => entry.dialog === dialog)) continue;
      stack.push({ dialog, previous: document.activeElement instanceof HTMLElement ? document.activeElement : null });
      if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
      if (!dialog.contains(document.activeElement)) (focusable(dialog)[0] || dialog).focus({ preventScroll: true });
    }
    if (stack.length && !hadDialog) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } else if (!stack.length && hadDialog) document.body.style.overflow = originalOverflow;
  }
  function handleKeydown(event: KeyboardEvent) {
    const dialog = stack[stack.length - 1]?.dialog;
    if (!dialog || event.key !== 'Tab') return;
    const elements = focusable(dialog);
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }
  onMounted(() => {
    observer = new MutationObserver(syncDialogs);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', handleKeydown, true);
    syncDialogs();
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    document.removeEventListener('keydown', handleKeydown, true);
    if (stack.length) document.body.style.overflow = originalOverflow;
  });
}
