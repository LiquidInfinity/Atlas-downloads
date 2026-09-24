/* ATLAS-owned sign-in UI. Clerk's JavaScript API manages identity; no Clerk UI is mounted. */
const $ = id => document.getElementById(id);
const sections = ['identity','new-user','verify','ready'];
const params = new URLSearchParams(location.search);
const requested = params.get('redirect_url') || params.get('return_to') || sessionStorage.getItem('atlas-auth-return');
function safeReturn(raw) {
  if (!raw) return '/';
  try {
    const url = new URL(raw, location.origin);
    if (url.origin === location.origin || url.origin === 'https://clerk.atlas.roxas.io') return url.href;
  } catch {}
  return '/';
}
const returnTo = safeReturn(requested);
sessionStorage.setItem('atlas-auth-return',returnTo);
let signIn, signUp, email, mode;
function view(id,title,message) {
  for (const section of sections) $(section).hidden = section !== id;
  $('title').textContent = title;
  $('description').textContent = message || '';
  $('back').hidden = id === 'identity' || id === 'ready';
  $('error').textContent = '';
}
function errorMessage(error) { return error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message || error?.message || 'Could not complete sign-in.'; }
function showError(error) { $('error').textContent = errorMessage(error); }
async function busy(button,work) {
  button.disabled = true;
  try { await work(); } catch (error) { showError(error); }
  finally { button.disabled = false; }
}
function finish() { location.assign(returnTo); }
async function signedIn(sessionId) {
  await Clerk.setActive({session:sessionId});
  if (Clerk.session?.currentTask) throw new Error('Your account needs another verification step. Contact ATLAS support.');
  view('ready','You’re signed in','Your ATLAS account is ready.');
  $('ready-message').textContent = `Signed in as ${Clerk.user?.primaryEmailAddress?.emailAddress || email || 'your account'}.`;
  if (returnTo !== new URL('/',location.origin).href) finish();
}
async function startEmail(event) {
  event.preventDefault();
  await busy($('email-button'), async () => {
    email = $('email').value.trim().toLowerCase();
    signIn = null; signUp = null;
    try {
      signIn = await Clerk.client.signIn.create({identifier:email});
    } catch (error) {
      const code = error?.errors?.[0]?.code;
      if (!['form_identifier_not_found','form_identifier_exists','identifier_not_found'].includes(code)) throw error;
      view('new-user','Create your ATLAS account',`Enter the name you want ATLAS to show for ${email}.`);
      return;
    }
    if (signIn.status === 'complete') { await signedIn(signIn.createdSessionId); return; }
    const factor = signIn.supportedFirstFactors?.find(f => f.strategy === 'email_code');
    if (!factor?.emailAddressId) throw new Error('Email code sign-in is unavailable for this address.');
    await signIn.prepareFirstFactor({strategy:'email_code',emailAddressId:factor.emailAddressId});
    mode = 'sign-in';
    $('sent-message').textContent = `We sent a sign-in code to ${email}.`;
    view('verify','Check your email','Enter the code to sign in.');
    $('code').focus();
  });
}
async function createAccount(event) {
  event.preventDefault();
  const button = event.submitter;
  await busy(button, async () => {
    signUp = await Clerk.client.signUp.create({emailAddress:email,firstName:$('first-name').value.trim(),lastName:$('last-name').value.trim()});
    await signUp.prepareEmailAddressVerification({strategy:'email_code'});
    mode = 'sign-up';
    $('sent-message').textContent = `We sent an account verification code to ${email}.`;
    view('verify','Verify your email','Enter the code to create your account.');
    $('code').focus();
  });
}
async function verifyCode(event) {
  event.preventDefault();
  await busy(event.submitter, async () => {
    const code = $('code').value.trim();
    const result = mode === 'sign-up'
      ? await signUp.attemptEmailAddressVerification({code})
      : await signIn.attemptFirstFactor({strategy:'email_code',code});
    if (result.status !== 'complete' || !result.createdSessionId) throw new Error('Additional account verification is required.');
    await signedIn(result.createdSessionId);
  });
}
async function sendLink() {
  await busy($('email-link'), async () => {
    if (mode !== 'sign-in') throw new Error('Create the account with an email code first.');
    const factor = signIn.supportedFirstFactors?.find(f => f.strategy === 'email_link');
    if (!factor?.emailAddressId) throw new Error('Email link sign-in is unavailable for this address.');
    const { startEmailLinkFlow } = signIn.createEmailLinkFlow();
    const flow = startEmailLinkFlow({redirectUrl:location.origin+'/sign-in.html?email_link=1'});
    $('sent-message').textContent = `We sent a sign-in link to ${email}. Open it on this computer.`;
    const result = await flow;
    if (result.status === 'complete' && result.createdSessionId) await signedIn(result.createdSessionId);
  });
}
async function google() {
  await busy($('google'),async () => {
    await Clerk.client.signIn.authenticateWithRedirect({strategy:'oauth_google',redirectUrl:location.origin+'/sign-in.html?oauth_callback=1',redirectUrlComplete:returnTo});
  });
}
async function initialize() {
  if (!window.ATLAS_CLERK_PUBLISHABLE_KEY) throw new Error('ATLAS sign-in is not configured.');
  const script = document.createElement('script');
  script.src = 'https://clerk.atlas.roxas.io/npm/@clerk/clerk-js@6/dist/clerk.browser.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.dataset.clerkPublishableKey = window.ATLAS_CLERK_PUBLISHABLE_KEY;
  await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(new Error('Could not load ATLAS sign-in.'));document.head.append(script)});
  await Clerk.load({signInUrl:location.origin+'/sign-in.html',signUpUrl:location.origin+'/sign-in.html'});
  if (params.has('oauth_callback')) { await Clerk.handleRedirectCallback({redirectUrlComplete:returnTo}); return; }
  if (params.has('email_link')) {
    const result = await Clerk.handleEmailLinkVerification({redirectUrlComplete:returnTo});
    if (result?.createdSessionId) { await signedIn(result.createdSessionId); return; }
  }
  if (Clerk.user && Clerk.session) { await signedIn(Clerk.session.id); return; }
  $('google').disabled = false; $('email-button').disabled = false;
}
$('email-form').addEventListener('submit',startEmail);
$('new-user-form').addEventListener('submit',createAccount);
$('code-form').addEventListener('submit',verifyCode);
$('email-link').addEventListener('click',sendLink);
$('google').addEventListener('click',google);
$('continue').addEventListener('click',finish);
$('back').addEventListener('click',()=>view('identity','Sign in to ATLAS','Use your email or Google account.'));
$('google').disabled = true; $('email-button').disabled = true;
initialize().catch(showError);
