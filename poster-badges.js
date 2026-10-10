// main.js — Плагин "Метки на постерах" для Lampa (v9)
// Безопасная версия: без MutationObserver, без патча Lampa.Card.
// Только периодический сканер DOM + try/catch везде.
(function () {
    'use strict';

    var PLUGIN_NAME = 'poster_badges_v9';
    var STYLE_ID = 'poster-badges-style';
    var COL_CACHE_KEY = 'poster_badges_col_v9';

    function notify(msg) {
        try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {}
    }
    function log() {
        try { console.log.apply(console, ['[Badges]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
    }

    // ---------- СТИЛИ ----------
    function injectStyles() {
        try {
            if (document.getElementById(STYLE_ID)) return;
            var css = ''
                + '.card__my-badges{position:absolute;inset:0;pointer-events:none;z-index:5;}'
                + '.card__my-badge{position:absolute;font-size:10px;font-weight:700;'
                + 'padding:2px 6px;border-radius:4px;letter-spacing:0.3px;line-height:1.4;'
                + 'white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.5);}'
                + '.card__my-badge--not-released{top:6px;left:6px;background:#c62828;color:#fff;}'
                + '.card__my-badge--collection{top:6px;right:6px;background:#ffdd55;color:#000;'
                + 'border-radius:50%;min-width:20px;height:20px;display:flex;align-items:center;'
                + 'justify-content:center;padding:0;font-size:11px;box-sizing:border-box;}';
            var st = document.createElement('style');
            st.id = STYLE_ID;
            st.textContent = css;
            document.head.appendChild(st);
        } catch (e) { log('injectStyles err', e); }
    }

    // ---------- ДИАГНОСТИКА ----------
    var diag = {
        seen: 0,
        withData: 0,
        notReleased: 0,
        badges: 0,
        colReq: 0,
        dataKeys: [],
        instanceKeys: []
    };

    // ---------- КЭШ КОЛЛЕКЦИЙ ----------
    var colCache = {};
    try {
        var rawCol = localStorage.getItem(COL_CACHE_KEY);
        if (rawCol) colCache = JSON.parse(rawCol) || {};
    } catch (e) { colCache = {}; }

    function saveColCache() {
        try { localStorage.setItem(COL_CACHE_KEY, JSON.stringify(colCache)); } catch (e) {}
    }

    function fetchColCount(colId, cb) {
        try {
            if (colCache[colId] !== undefined) { cb(colCache[colId]); return; }
            var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
            if (!tmdb || typeof tmdb.get !== 'function') { cb(0); return; }
            diag.colReq++;
            tmdb.get('collection/' + colId, function (d) {
                var n = 0;
                try {
                    if (d && d.parts && d.parts.length) n = d.parts.length;
                    else if (d && d.number_of_items) n = d.number_of_items;
                } catch (e) {}
                colCache[colId] = n;
                saveColCache();
                cb(n);
            }, function () { colCache[colId] = 0; saveColCache(); cb(0); });
        } catch (e) { cb(0); }
    }

    // ---------- ХЕЛПЕРЫ ----------
    function isReleased(item) {
        try {
            var d = item.release_date || item.first_air_date || '';
            if (!d) return true;
            var ts = Date.parse(d);
            if (isNaN(ts)) return true;
            return ts <= Date.now();
        } catch (e) { return true; }
    }

    function looksLikeMovie(obj) {
        if (!obj || typeof obj !== 'object') return false;
        return !!(obj.id && (obj.poster_path || obj.title || obj.name));
    }

    function findCardData($card) {
        // 1. jQuery data по известным ключам
        var keys = ['card', 'instance', 'movie', 'item', 'object', 'data'];
        for (var i = 0; i < keys.length; i++) {
            try {
                var v = $card.data(keys[i]);
                if (looksLikeMovie(v)) return v;
                if (v && v.data && looksLikeMovie(v.data)) return v.data;
            } catch (e) {}
        }

        // 2. Все data-атрибуты
        try {
            var allData = $card.data();
            if (allData && typeof allData === 'object') {
                var ks = Object.keys(allData);
                if (ks.length && diag.instanceKeys.length === 0) diag.instanceKeys = ks.slice(0, 10);
                for (var j = 0; j < ks.length; j++) {
                    var obj = allData[ks[j]];
                    if (looksLikeMovie(obj)) return obj;
                    if (obj && obj.data && looksLikeMovie(obj.data)) return obj.data;
                }
            }
        } catch (e) {}

        // 3. Ссылки на DOM-элементе
        try {
            var el = $card[0];
            if (el) {
                if (el.__card && el.__card.data && looksLikeMovie(el.__card.data)) return el.__card.data;
                if (el.cardInstance && el.cardInstance.data && looksLikeMovie(el.cardInstance.data)) return el.cardInstance.data;
                if (el.__lampa_card && el.__lampa_card.data && looksLikeMovie(el.__lampa_card.data)) return el.__lampa_card.data;
            }
        } catch (e) {}

        return null;
    }

    function findPosterWrap($card) {
        try {
            var selectors = ['.card__img', '.card-image', '[class*="card__img"]', '[class*="card__poster"]'];
            for (var i = 0; i < selectors.length; i++) {
                var $w = $card.find(selectors[i]).first();
                if ($w.length) return $w;
            }
            var $img = $card.find('img').first();
            if ($img.length) return $img.parent();
        } catch (e) {}
        return $card;
    }

    // ---------- ОСНОВНАЯ ЛОГИКА ----------
    function enhanceCardElement($card) {
        try {
            if (!$card || !$card.length) return;
            diag.seen++;

            if ($card.data('badge-done')) return;

            var data = findCardData($card);
            if (!data) return;
            diag.withData++;

            if (diag.dataKeys.length === 0) {
                try { diag.dataKeys = Object.keys(data).slice(0, 15); } catch (e) {}
            }

            var $wrap = findPosterWrap($card);
            if (!$wrap.length) return;
            if ($wrap.find('.card__my-badges').length) return;

            var $badges = $('<div class="card__my-badges"></div>');
            var added = false;

            if (!isReleased(data)) {
                $badges.append('<div class="card__my-badge card__my-badge--not-released">Не вышло</div>');
                diag.notReleased++;
                added = true;
            }

            var col = data.belongs_to_collection;
            if (col && col.id) {
                added = true;
                fetchColCount(col.id, function (n) {
                    try {
                        if (n >= 2) {
                            $badges.append('<div class="card__my-badge card__my-badge--collection">' + n + '</div>');
                        }
                    } catch (e) {}
                });
            }

            if (added) {
                try {
                    var curPos = $wrap.css('position');
                    if (!curPos || curPos === 'static') $wrap.css('position', 'relative');
                } catch (e) {}
                $wrap.append($badges);
                $card.data('badge-done', true);
                diag.badges++;
            }
        } catch (e) {
            log('enhance err', e);
        }
    }

    function scanAll() {
        try {
            var $cards = $('.card');
            if (!$cards.length) return;
            $cards.each(function () {
                try { enhanceCardElement($(this)); } catch (e) {}
            });
        } catch (e) {
            log('scanAll err', e);
        }
    }

    function reportDiag() {
        try {
            notify('Значки: карточек ' + diag.seen
                + ', с данными ' + diag.withData
                + ', знаков ' + diag.badges
                + ', коллекций ' + diag.colReq);
            log('DIAG', JSON.stringify(diag));
            log('dataKeys', diag.dataKeys);
            log('instanceKeys', diag.instanceKeys);
        } catch (e) {}
    }

    // ---------- СТАРТ ----------
    var scanInterval = null;

    function startPlugin() {
        try {
            if (window[PLUGIN_NAME]) return;
            window[PLUGIN_NAME] = true;

            injectStyles();

            setTimeout(scanAll, 500);
            setTimeout(scanAll, 1500);
            setTimeout(scanAll, 3000);

            if (!scanInterval) {
                scanInterval = setInterval(function () {
                    try { scanAll(); } catch (e) {}
                }, 2000);
            }

            notify('Плагин "Метки на постерах" v9 запущен');
            setTimeout(reportDiag, 8000);
            setTimeout(reportDiag, 20000);
        } catch (e) {
            log('startPlugin err', e);
        }
    }

    try {
        if (window.appready) startPlugin();
        else if (window.Lampa && Lampa.Listener) {
            Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
        } else {
            var t = 0;
            var iv = setInterval(function () {
                t++;
                if (window.appready) { clearInterval(iv); startPlugin(); }
                else if (t > 40) clearInterval(iv);
            }, 500);
        }
    } catch (e) {
        log('bootstrap err', e);
    }
})();