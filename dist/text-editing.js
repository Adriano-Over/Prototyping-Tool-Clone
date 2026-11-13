export function beginTextEditing({
  component,
  editor,
  requestFrame = callback => globalThis.requestAnimationFrame(callback),
  maxFrames = 90,
  onFailure = () => {},
}) {
  return new Promise(resolve => {
    let frames = 0;
    let focusRequested = false;
    let doubleClickSent = false;

    const retryOrFail = () => {
      frames += 1;
      if (frames >= maxFrames) {
        onFailure();
        resolve(false);
        return;
      }
      requestFrame(attempt);
    };

    const attempt = () => {
      const element = component?.view?.el;
      const document = element?.ownerDocument;
      const window = document?.defaultView;
      if (!element?.isConnected || !document || !window) {
        retryOrFail();
        return;
      }

      // GrapesJS' text view listens to the model's `focus` event to start its
      // rich-text editor. Request that directly first; a synthetic dblclick
      // alone can be ignored by the canvas/WebView event path.
      if (!focusRequested) {
        focusRequested = true;
        component?.trigger?.('focus');
      }

      if (editor?.getEditing?.() !== component && !doubleClickSent && frames >= 2) {
        doubleClickSent = true;
        const bounds = element.getBoundingClientRect();
        element.dispatchEvent(new window.MouseEvent('dblclick', {
          bubbles: true,
          cancelable: true,
          detail: 2,
          view: window,
          clientX: bounds.left + Math.min(bounds.width / 2, 8),
          clientY: bounds.top + Math.min(bounds.height / 2, 8),
        }));
      }

      if (editor?.getEditing?.() !== component) {
        retryOrFail();
        return;
      }

      const editable = element.isContentEditable
        ? element
        : element.querySelector?.('[contenteditable="true"]');
      if (!editable) {
        retryOrFail();
        return;
      }

      try {
        editable.focus({ preventScroll: true });
      } catch {
        editable.focus();
      }

      const selection = window.getSelection?.();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      resolve(true);
    };

    requestFrame(attempt);
  });
}
