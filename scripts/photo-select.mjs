// Control values travel as protocol arguments, never inside JavaScript source.
export function photoSelectRequest(objectId, label, value) {
  return {
    objectId,
    functionDeclaration: `function(label, value) {
      const select = Array.from(this.querySelectorAll('select')).find(element => element.getAttribute('aria-label') === label);
      if (!select) return false;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }`,
    arguments: [{ value: label }, { value }],
    awaitPromise: true,
    returnByValue: true,
  };
}
