// Shared motion keeps the existing multi-page routes and native link semantics.
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let installed = false;
let pendingNavigation = null;
let exitAnimation = null;
const routes = new Set(['index.html','alerts.html','transactions.html','graph.html','compliance.html','reports.html','system.html','login.html','signup.html','forgot-password.html','verify-email.html','auth-action.html']);
function cancelPendingNavigation() {
  exitAnimation?.cancel(); exitAnimation = null; pendingNavigation = null;
}

export function transitionView(update, region = document.getElementById('page-content')) {
  // Keep local tabs interactive while they animate. Document-scoped snapshots
  // can suppress an immediately following sidebar click in some browsers.
  cancelPendingNavigation();
  try {
    const result = update();
    revealRegion(region);
    return Promise.resolve(result);
  } catch (error) { return Promise.reject(error); }
}

export function revealRegion(region) {
  if (!region || reducedMotion() || typeof region.animate !== 'function') return;
  const previous=region.getAnimations().filter(animation => animation.id === 'acurion-reveal');
  const opacity=previous.length?getComputedStyle(region).opacity:0;
  const transform=previous.length?getComputedStyle(region).transform:'translateY(7px)';
  previous.forEach(animation => animation.cancel());
  const animation = region.animate([
    {opacity,transform},
    {opacity:1,transform:'translateY(0)'},
  ], {duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
  animation.id = 'acurion-reveal';
}

function rememberSelection() {
  const marker=document.getElementById('nav-selection'),navigation=document.getElementById('context-navigation');
  if(!marker || !navigation || !marker.getBoundingClientRect().width)return;
  try { sessionStorage.setItem('acurion:nav-selection-y',String(marker.getBoundingClientRect().top-navigation.getBoundingClientRect().top+navigation.scrollTop)); } catch {}
}

export function navigateSmoothly(href, {replace=false} = {}) {
  const target = new URL(href, location.href);
  if (target.origin !== location.origin || reducedMotion()) {
    rememberSelection();
    replace ? location.replace(target.href) : location.assign(target.href);
    return;
  }
  // A second click chooses the latest destination without stacking animations.
  pendingNavigation = {href:target.href,replace};
  if (exitAnimation) return;
  const region = document.querySelector('.main-content, .auth-card, .login-card');
  if (!region?.animate) {
    pendingNavigation = null;
    replace ? location.replace(target.href) : location.assign(target.href);
    return;
  }
  exitAnimation = region.animate([
    {opacity:1,transform:'translateY(0)'},
    {opacity:0,transform:'translateY(-5px)'},
  ], {duration:120,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
  exitAnimation.finished.then(() => {
    const next = pendingNavigation;
    pendingNavigation = null;
    if (next) { rememberSelection(); next.replace ? location.replace(next.href) : location.assign(next.href); }
  }).catch(() => {});
}

export function installMotion() {
  if (installed) return;
  installed = true;
  window.addEventListener('pageshow', event => {
    // Back/forward cache must never restore a faded-out page.
    if (!event.persisted) return;
    cancelPendingNavigation();
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.dataset.motion === 'off') return;
    const target = new URL(link.href,location.href), current = new URL(location.href);
    if (target.origin !== current.origin || !routes.has(target.pathname.split('/').pop())) return;
    // Hash tabs and same-document views have their own state handlers.
    if (target.pathname === current.pathname && target.search === current.search && target.hash !== current.hash) return;
    if (target.href === current.href) { event.preventDefault(); cancelPendingNavigation(); return; }
    if (current.pathname.endsWith('/compliance.html') && target.pathname === current.pathname) {
      const view = target.searchParams.get('view');
      if (['customers','screening','monitoring','cases','controls'].includes(view)) {
        event.preventDefault();
        cancelPendingNavigation();
        document.dispatchEvent(new CustomEvent('acurion:navigate-view',{detail:target.href}));
        return;
      }
    }
    event.preventDefault(); navigateSmoothly(target.href);
  });
}
installMotion();
