// Local development does not need a continue URL. Verification still happens
// through the configured Firebase email action handler; return to the app after it.
export function emailActionSettings(page,href) {
  const current=new URL(href),host=current.hostname;
  if(host==='localhost'||host.endsWith('.localhost')||host.startsWith('127.')
    ||host==='[::1]'||host==='::1'||host==='0.0.0.0')return undefined;
  return {url:new URL(page,current).href};
}
