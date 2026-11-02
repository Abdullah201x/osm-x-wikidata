import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { loadScript } from './load-script.js';

let ModalA11y;

beforeAll(() => {
  ({ ModalA11y } = loadScript('modal_a11y.js', ['ModalA11y']));
});

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  document.body.innerHTML = `
    <button id="opener">Open</button>
    <div id="modal-a" class="modal-overlay" style="display: none;">
      <div class="modal-card">
        <button id="a-close">x</button>
        <input id="a-input" />
        <button id="a-ok">OK</button>
        <button id="a-hidden-wrap-btn" style="display:none">hidden</button>
      </div>
    </div>
    <div id="modal-b" class="modal-overlay" style="display: none;">
      <div class="modal-card"><button id="b-close">x</button></div>
    </div>`;
  ModalA11y.destroy();
  ModalA11y.init();
}

const show = (id) => { document.getElementById(id).style.display = 'flex'; return nextTick(); };
const hide = (id) => { document.getElementById(id).style.display = 'none'; return nextTick(); };
const tab = (shiftKey = false) => {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
};

describe('ModalA11y', () => {
  beforeEach(setup);
  afterEach(() => ModalA11y.destroy());

  it('moves focus to the first focusable control when a modal opens', async () => {
    document.getElementById('opener').focus();
    await show('modal-a');
    expect(document.activeElement.id).toBe('a-close');
  });

  it('returns focus to the opener when the modal closes', async () => {
    document.getElementById('opener').focus();
    await show('modal-a');
    await hide('modal-a');
    expect(document.activeElement.id).toBe('opener');
  });

  it('wraps Tab from the last control to the first', async () => {
    await show('modal-a');
    document.getElementById('a-ok').focus();
    const event = tab();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('a-close');
  });

  it('wraps Shift+Tab from the first control to the last visible one', async () => {
    await show('modal-a');
    document.getElementById('a-close').focus();
    const event = tab(true);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('a-ok'); // the display:none button is skipped
  });

  it('leaves Tab alone in the middle of the dialog', async () => {
    await show('modal-a');
    document.getElementById('a-input').focus();
    expect(tab().defaultPrevented).toBe(false);
  });

  it('pulls focus back in if it escaped the dialog', async () => {
    await show('modal-a');
    document.getElementById('opener').focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('a-close');
  });

  it('traps Tab in the topmost of two stacked modals and restores focus in order', async () => {
    document.getElementById('opener').focus();
    await show('modal-a');
    document.getElementById('a-ok').focus();
    await show('modal-b');
    expect(document.activeElement.id).toBe('b-close');
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('b-close');

    await hide('modal-b');
    expect(document.activeElement.id).toBe('a-ok');
    await hide('modal-a');
    expect(document.activeElement.id).toBe('opener');
  });

  it('does nothing for Tab when no modal is open', () => {
    expect(tab().defaultPrevented).toBe(false);
  });

  it('does not steal focus back when focus already moved elsewhere', async () => {
    document.getElementById('opener').focus();
    await show('modal-a');
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    await hide('modal-a');
    expect(document.activeElement).toBe(elsewhere);
  });
});
