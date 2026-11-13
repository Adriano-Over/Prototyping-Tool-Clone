let session;
async function token() {
  if (!session) session = fetch('/api/session', {cache:'no-store'}).then(async response => {
    if (!response.ok) throw new Error('Local project service is unavailable');
    return (await response.json()).token;
  }).catch(error => { session=undefined; throw error; });
  return session;
}

export async function apiFetch(url, options = {}) {
  const method=(options.method || 'GET').toUpperCase();
  if (['GET','HEAD'].includes(method)) return fetch(url, options);
  const headers=new Headers(options.headers);
  if(!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  headers.set('X-Forma-Token', await token());
  const response=await fetch(url,{...options,headers});
  if (response.status===403) {
    session=undefined;
    headers.set('X-Forma-Token',await token());
    return fetch(url,{...options,headers});
  }
  return response;
}
