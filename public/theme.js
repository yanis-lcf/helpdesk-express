// Applique le thème mémorisé avant le premier rendu (pas de flash). Fichier externe : compatible avec la CSP stricte.
try {
  var t = localStorage.getItem('hdx.theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) {}
