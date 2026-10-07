export function addSkipPathNavigationGuard(html: string, skipPaths: readonly string[], nonce?: string): string {
  if (!/<(?:!doctype\s+html|html\b)/i.test(html) || html.includes('data-shugoi-skip-navigation')) return html;
  const paths = JSON.stringify(skipPaths).replace(/</g, '\\u003c');
  const nonceAttribute = nonce ? ' nonce="' + nonce.replace(/[&"<>]/g, '') + '"' : '';
  const script = '<script data-shugoi-skip-navigation' + nonceAttribute + '>(function(s){function skip(p){return s.some(function(x){return x===p})}function leave(u){try{var n=new URL(u,location.href);if(n.origin===location.origin&&!skip(n.pathname)){location.assign(n.href);return true}}catch(e){}return false}var p=history.pushState,r=history.replaceState;history.pushState=function(){if(arguments.length>2&&leave(arguments[2]))return;return p.apply(this,arguments)};history.replaceState=function(){if(arguments.length>2&&leave(arguments[2]))return;return r.apply(this,arguments)};window.addEventListener("popstate",function(){if(!skip(location.pathname))location.reload()});document.addEventListener("click",function(e){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var n=e.target;while(n&&n.nodeType===1&&n.tagName!=="A")n=n.parentNode;if(!n||n.tagName!=="A"||n.target&&n.target!=="_self"||n.hasAttribute("download"))return;if(leave(n.href))e.preventDefault()},true)})( ' + paths + ' );</script>';
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, script + '</body>');
  if (/<\/html\s*>/i.test(html)) return html.replace(/<\/html\s*>/i, script + '</html>');
  return html + script;
}
