// The old GitHub Pages site (abdullah201x.github.io/osm-x-wikidata) has moved.
// Loaded synchronously in <head> so visitors are sent on before the app boots.
// External file (not inline) because production's CSP is script-src 'self'.
if (window.location.hostname.endsWith('github.io')) {
  var newPath = window.location.pathname.replace(/^\/osm-x-wikidata\/?/, '/');
  window.location.replace('https://wikidata.saudiosm.org' + newPath + window.location.search + window.location.hash);
}
