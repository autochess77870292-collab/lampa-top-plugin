var PLUGIN_NAME = 'my_top_v31';
var STORAGE_KEY = 'my_movie_top_v14';
var LLM_KEY = 'my_top_llm_settings';

function notify(msg) { try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {} }
function rawGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function rawSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function parseJSON(s, d) { if (!s) return d; try { var p = JSON.parse(s); return p || d; } catch (e) { return d; } }

function getLLMSettings() {
    var s = parseJSON(rawGet(LLM_KEY, '{}'), {});
    return { apiUrl: s.apiUrl || '', apiKey: s.apiKey || '', model: s.model || 'gpt-4o-mini' };
}
function saveLLMSettings(s) { rawSet(LLM_KEY, JSON.stringify(s)); }

function shieldInput($el) { $el.on('keydown keyup keypress input', function (e) { e.stopPropagation(); }); return $el; }
function onceClick($el, handler) {
    var busy = false;
    $el.off('click hover:enter').on('click hover:enter', function (e) {
        if (busy) return;
        busy = true;
        try { handler(e); } finally { setTimeout(function () { busy = false; }, 400); }
    });
    return $el;
}
function posterUrl(path, size) {
    if (!path) return '';
    size = size || 'w300';
    var clean = String(path).replace(/^\/+/, '');
    try { if (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb && typeof Lampa.Api.sources.tmdb.img === 'function') { var u = Lampa.Api.sources.tmdb.img(path, size); if (u && typeof u === 'string') return u; } } catch (e) {}
    try { if (window.Lampa && Lampa.Api && typeof Lampa.Api.img === 'function') { var u2 = Lampa.Api.img(path, size); if (u2 && typeof u2 === 'string') return u2; } } catch (e) {}
    return 'https://image.tmdb.org/t/p/' + size + '/' + clean;
}
function isSeries(c) { return !!(c && (c.name || c.first_air_date || c.media_type === 'tv')); }

function copyToClipboard(text, onOk, onFail) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(onOk, function () { fallbackCopy(text, onOk, onFail); });
            return;
        }
    } catch (e) {}
    fallbackCopy(text, onOk, onFail);
}
function fallbackCopy(text, onOk, onFail) {
    try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) onOk(); else onFail();
    } catch (e) { onFail(); }
}