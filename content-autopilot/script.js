(() => {
  const visual = document.querySelector('.hero-visual');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!visual || reduceMotion) return;

  let frame = 0;
  const updateScroll = () => {
    frame = 0;
    const rect = visual.getBoundingClientRect();
    const progress = Math.max(-1, Math.min(1, (window.innerHeight / 2 - rect.top - rect.height / 2) / window.innerHeight));
    visual.style.setProperty('--scroll-shift', `${progress * 18}px`);
  };

  visual.addEventListener('pointermove', event => {
    const rect = visual.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    visual.style.setProperty('--bg-x', `${x * -18}px`);
    visual.style.setProperty('--bg-y', `${y * -12}px`);
    visual.style.setProperty('--fg-x', `${x * 16}px`);
    visual.style.setProperty('--fg-y', `${y * 11}px`);
    visual.style.setProperty('--chip-x', `${x * 9}px`);
    visual.style.setProperty('--chip-y', `${y * 7}px`);
  });
  visual.addEventListener('pointerleave', () => {
    ['--bg-x', '--bg-y', '--fg-x', '--fg-y', '--chip-x', '--chip-y'].forEach(property => visual.style.setProperty(property, '0px'));
  });
  window.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(updateScroll);
  }, { passive: true });
  updateScroll();
})();
