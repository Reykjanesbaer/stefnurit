/*
 * Runs before anything else, as a blocking classic script.
 *
 * The panel holds a GitHub token in memory. A hostile page that frames it could
 * try to trick somebody into typing that token into what looks like a trusted
 * site, so the panel refuses to render in a frame at all.
 *
 * This is JavaScript because GitHub Pages cannot set response headers:
 * X-Frame-Options and CSP frame-ancestors are the real mechanism and are not
 * available here. A `frame-ancestors` directive in a <meta> tag is ignored by
 * browsers, so this is what is left. Documented in docs/privacy.md.
 */
(function () {
  if (window.top === window.self) return;

  try {
    window.top.location = window.self.location;
  } catch (error) {
    // Cross-origin parents will not allow the navigation; blank the page instead.
  }

  document.documentElement.replaceChildren();
  var style = 'font:16px/1.6 system-ui,sans-serif;padding:2rem;max-width:34rem;margin:0 auto;color:#1B1B1F';
  var body = document.createElement('body');
  body.setAttribute('style', style);

  var heading = document.createElement('h1');
  heading.textContent = 'Stjórnborðið opnast ekki inni í annarri síðu';
  heading.setAttribute('style', 'font-size:1.25rem');

  var text = document.createElement('p');
  text.textContent = 'Af öryggisástæðum neitar stjórnborð stefnuritsins að birtast inni í ramma á '
    + 'annarri vefsíðu. Opnaðu það beint í eigin flipa.';

  body.appendChild(heading);
  body.appendChild(text);
  document.documentElement.appendChild(body);

  throw new Error('stefnurit admin: refusing to render inside a frame');
})();
