(() => {
  const bar = document.createElement('nav');
  bar.className = 'meeting-toolbar';
  bar.setAttribute('aria-label', 'Videochat-Steuerung');
  const controls = [['#btnMute', 'Mikrofon'], ['#btnVideo', 'Kamera'], ['.btn-start', 'Start'], ['.btn-next', 'Nächster'], ['.btn-stop', 'Stop']];
  for (const [selector, label] of controls) {
    const source = document.querySelector(selector);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = label === 'Stop' ? 'meeting-stop' : '';
    const sync = () => {
      button.disabled = source.disabled;
      button.title = source.title || label;
      if (source.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', source.getAttribute('aria-pressed'));
      if (label === 'Mikrofon' || label === 'Kamera') {
        button.setAttribute('aria-label', source.getAttribute('aria-label') || label);
        button.innerHTML = source.innerHTML + '<span>' + label + '</span>';
      }
    };
    sync();
    new MutationObserver(sync).observe(source, {attributes: true, childList: true, subtree: true});
    button.addEventListener('click', () => source.click());
    bar.append(button);
  }
  const chat = document.createElement('button');
  chat.type = 'button';
  chat.textContent = 'Chat ausblenden';
  chat.setAttribute('aria-expanded', 'true');
  chat.setAttribute('aria-controls', 'chatBox');
  chat.addEventListener('click', () => {
    const hidden = document.body.classList.toggle('meeting-chat-hidden');
    chat.textContent = hidden ? 'Chat anzeigen' : 'Chat ausblenden';
    chat.setAttribute('aria-expanded', String(!hidden));
  });
  bar.append(chat);
  document.body.append(bar);
})();
