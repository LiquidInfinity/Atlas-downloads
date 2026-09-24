/* ATLAS-owned OAuth consent UI, using Clerk's API without mounted Clerk components. */
const params = new URLSearchParams(location.search);
const clientId = params.get('client_id');
const redirectUri = params.get('redirect_uri');
const scope = params.get('scope') || '';
const expectedClientId = '1ui5SuECRAMy8TEe';
const expectedRedirectUri = 'atlas://auth/callback';
const allowedScopes = new Set(['profile','email','offline_access']);
const $ = id => document.getElementById(id);
const fail = message => { $('error').textContent = message; };

async function initialize() {
  if (clientId !== expectedClientId || redirectUri !== expectedRedirectUri ||
      scope.split(' ').some(value => !allowedScopes.has(value)) ||
      params.get('code_challenge_method') !== 'S256' || !params.get('code_challenge')) {
    throw new Error('This ATLAS connection request is invalid.');
  }
  const script = document.createElement('script');
  script.src = 'https://clerk.atlas.roxas.io/npm/@clerk/clerk-js@6/dist/clerk.browser.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.dataset.clerkPublishableKey = window.ATLAS_CLERK_PUBLISHABLE_KEY;
  await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(new Error('Could not load ATLAS sign-in.'));document.head.append(script)});
  await Clerk.load({signInUrl:location.origin+'/sign-in.html'});
  if (params.get('atlas_account_choice') !== 'complete') {
    if (Clerk.session) await Clerk.signOut();
    const chosen = new URL(location.href);
    chosen.searchParams.set('atlas_account_choice','complete');
    const signIn = new URL('/sign-in.html',location.origin);
    signIn.searchParams.set('return_to',chosen.href);
    location.replace(signIn);
    return;
  }
  if (!Clerk.user || !Clerk.session) {
    const next = new URL('/sign-in.html',location.origin);
    next.searchParams.set('redirect_url',location.href);
    location.replace(next);
    return;
  }
  const data = await Clerk.oauthApplication.getConsentInfo({oauthClientId:clientId,scope});
  $('account').textContent = `Signed in as ${Clerk.user.primaryEmailAddress?.emailAddress || Clerk.user.id}.`;
  $('app-name').textContent = `${data.oauthApplicationName || 'Atlas Desktop'} is connecting to ${Clerk.user.primaryEmailAddress?.emailAddress || 'your email'}.`;
  $('client-id').textContent = `Client ID: ${data.clientId || clientId}`;
  $('redirect-uri').textContent = redirectUri;
  $('destination').textContent = `After you allow or deny access, you will return to the ATLAS desktop app on this computer.`;
  for (const permission of data.scopes || []) {
    const item = document.createElement('li');
    item.textContent = permission.description || permission.scope;
    $('scopes').append(item);
  }
  const form = $('consent-form');
  form.action = Clerk.oauthApplication.buildConsentActionUrl({clientId});
  for (const [key,value] of params) {
    if (key === 'consented' || key === 'organization_id' || key === 'atlas_account_choice') continue;
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = key; input.value = value;
    form.append(input);
  }
  $('consent').hidden = false;
}
initialize().catch(error => fail(error?.message || 'Could not load this connection request.'));
