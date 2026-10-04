(() => {
  const dashboard = document.getElementById('dashboard');
  const links = [...document.querySelectorAll('.admin-nav a[href^="#"]')];
  const sections = [...dashboard.querySelectorAll('.stats, .substats, .users-panel, .profiles-panel, .reports-panel, .bans-panel')];
  const heading = dashboard.querySelector('h1');
  function navigate() {
    const selected = links.find(link => link.hash === location.hash) || links[0];
    const overview = selected.hash === '#overview';
    sections.forEach(section => {
      section.hidden = overview
        ? !section.matches('.stats, .substats')
        : section.id !== selected.hash.slice(1);
    });
    links.forEach(link => {
      if (link === selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    heading.textContent = selected.textContent;
  }
  window.addEventListener('hashchange', navigate);
  navigate();
})();
