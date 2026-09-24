const params = new URLSearchParams(location.search);
const code = params.get('code');
const state = params.get('state');
const error = params.get('error');
if (error || !code || !state) {
  document.getElementById('title').textContent = 'Sign-in did not finish';
  document.getElementById('description').textContent = 'Return to ATLAS and try Google sign-in again.';
  document.getElementById('error').textContent = error || 'The sign-in response was incomplete.';
} else {
  const callback = new URL('atlas://auth/callback');
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', state);
  const open = document.getElementById('open-atlas');
  open.href = callback.href;
  open.hidden = false;
  history.replaceState(null, '', location.pathname);
  location.assign(callback.href);
}
