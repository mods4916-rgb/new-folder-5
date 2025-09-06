/* Custom JS helpers for Lucky Satta page */
(function (window, document) {
  'use strict';

  // Safe console (older browsers)
  var noop = function(){};
  var methods = ['log','warn','error','info','debug','group','groupEnd','table'];
  if (!window.console) window.console = {};
  methods.forEach(function(m){ if (!window.console[m]) window.console[m] = noop; });

  // jQuery presence check
  function onReady(fn){
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  onReady(function(){
    var $ = window.jQuery || window.$;

    // If Lazy plugin is missing (CDN blocked), create a minimal no-op shim
    if ($ && (!$.fn || !$.fn.Lazy)) {
      $.fn.Lazy = function(){
        // Simple eager-load: if element has data-src, move it to src
        this.each(function(){
          var el = this;
          if (el && el.getAttribute) {
            var ds = el.getAttribute('data-src');
            if (ds && !el.getAttribute('src')) {
              el.setAttribute('src', ds);
            }
          }
        });
        return this;
      };
      console.info('jquery.lazy not found on CDN, using local fallback shim.');
    }

    // Removed JS blink fallback entirely to avoid any animation intervals
    // (Blinking is disabled in index.html CSS)
  });

})(window, document);
