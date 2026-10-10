// main.js — Плагин "Метки на постерах" для Lampa (v8)
(function () {
    'use strict';

    var PLUGIN_NAME = 'poster_badges_v8';
    var STYLE_ID = 'poster-badges-style';
    var COL_CACHE_KEY = 'poster_badges_col_v8';

    function notify(msg) {
        try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {}
    }
    function log() {
        try { console.log.apply(console, ['[Badges]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
    }

    function injectStyles() {
        if ($('#' + STYLE_ID).length) return;
        var css = ''
            + '.card__my-badges{position:absolute;inset:0;pointer-events:none;z-index:5;}'
            + '.card__my-badge{position:absolute;font-size:10px;font-weight:700;'
            + 'padding:2px 6px;border-radius:4px;letter-spacing:0.3px;line-height:1.4;'
            + 'white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.5);}'
            + '.card__my-badge--not-released{top:6px;left:6px;background:#c62828;color:#fff;}'
            + '.card__my-badge--collection{top:6px;right:6px;background:#ffdd55;color:#000;'
            + 'border-radius:50%;min-width:20px;height:20px;display:flex;align-items:center;'
            + 'justify-content:center;padding:0;font-size:11px;box-sizing:border-box;}';
        $('<style>').attr(ID_STYLE()).text(css).appendTo('head');
    }
    function ID_STYLE() { return STYLE_ID; }

    // ---------- ДИАГНОСТИКА ----------
    var diag = {
        cardsSeen: 0,
        cardsWithData: 0,
        cardsNotReleased: 0,
        badgesAdded: 0,
        colReq: 0,
        instanceKeys: [],
        cardClasses: [],
        cardDataKeys: [],
        strategyUsed: 'none'
    };

    // ---------- КЭШ КОЛЛЕКЦИЙ ----------
    var colCache = (function () {
        try { return JSON.parse(localStorage.getItem(COL_CACHE_KEY) || '{}'); } catch (e) { return {}; }
    })();
    function saveColCache() { try { localStorage.setItem(COL_CACHE_KEY, JSON.stringify(colCache)); } catch (e) {} }

    function fetchColCount(colId, cb) {
        if (colCache[colId] !== undefined) { cb(colCache[colId]); return; }
        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (!tmdb || !tmdb.get) { cb(0); return; }
        diag.colReq++;
        try {
            tmdb.get('collection/' + colId, function (d) {
                var n = 0;
                if (d && d.parts && d.parts.length) n = d.parts.length;
                else if (d && d.number_of_items) n = d.number_of_items;
                colCache[colId] = n; saveColCache(); cb(n);
            }, function () { colCache[colId] = 0; saveColCache(); cb(0); });
        } catch (e) { cb(0); }
    }

    function isReleased(item) {
        var d = item.release_date || item.first_air_date || '';
        if (!d) return true;
        var ts = Date.parse(d);
        if (isNaN(ts)) return true;
        return ts <= Date.now();
    }

    // ---------- ПОИСК ДАННЫХ КАРТОЧКИ ----------
    // Пробуем вытащить объект фильма из разных мест: jQ.data, свойства DOM, соседние эл-ты.
    function findCardData($card) {
        // 1. jQuery data
        var dataKeys = ['card', 'instance', 'movie', 'item', 'object', 'data'];
        for (var i = 0; i < dataKeys.length; i++) {
            var v = $card.data(dataKeys[i]);
            if (v && typeof v === 'object' && (v.poster_path || v.title || v.name || v.id)) return v;
        }

        // 2. Все data-атрибуты
        try {
            var allData = $card.data();
            if (allData && typeof allData === 'object') {
                var keys = Object.keys(allData);
                if (keys.length && diag.instanceKeys.length === 0) diag.instanceKeys = keys.slice(0, 10);
                for (var j = 0; j < keys.length; j++) {
                    var obj = allData[keys[j]];
                    if (obj && typeof obj === 'object' && (obj.poster_path || obj.title || obj.name) && obj.id) return obj;
                }
            }
        } catch (e) {}

        // 3. Сосед по DOM-элементам — если Lampa хранит ссылку рядом
        try {
            var el = $card[0];
            if (el) {
                if (el.__card && el.__card.data) return el.__card.data;
                if (el.cardInstance && el.cardInstance.data) return el.cardInstance.data;
                if (el.__lampa_card) return el.__lampa_card.data || el.__lampa_card;
            }
        } catch (e) {}

        return null;
    }

    function findPosterWrap($card) {
        var selectors = ['.card__img', '.card-image', '[class*="card__img"]', '[class*="card__poster"]'];
        for (var i = 0; i < selectors.length; i++) {
            var $w = $card.find(selectors[i]).first();
            if ($w.length) return $w;
        }
        var $img = $card.find('img').first();
        if ($img.length) return $img.parent();
        return $card;
    }

    function enhanceCardElement($card) {
        if (!$card || !$card.length) return;
        diag.cardsSeen++;

        if (diag.cardClasses.length === 0) {
            diag.cardClasses = ($card.attr('class') || '').split(' ').slice(0, 8);
        }

        if ($card.data('badge-done')) return;

        var data = findCardData($card);
        if (!data) return;
        diag.cardsWithData++;

        if (diag.cardDataKeys.length === 0) {
            try { diag.cardDataKeys = Object.keys(data).slice(0, 15); } catch (e) {}
        }

        var $wrap = findPosterWrap($card);
        if (!$wrap.length) return;
        if ($wrap.find('.card__my-badges').length) return;

        var $badges = $('<div class="card__my-badges"></div>');
        var added = false;

        if (!isReleased(data)) {
            $badges.append('<div class="card__my-badge card__my-badge--not-released">Не вышло</div>');
            diag.cardsNotReleased++;
            added = true;
        }

        var col = data.belongs_to_collection;
        if (col && col.id) {
            added = true;
            fetchColCount(col.id, function (n) {
                if (n >= 2) {
                    $badges.append('<div class="card__my-badge card__my-badge--collection">' + n + '</div>');
                }
            });
        }

        if (added) {
            var curPos = $wrap.css('position');
            if (!curPos || curPos === 'static') $wrap.css('position', 'relative');
            $wrap.append($badges);
            $card.data('badge-done', true);
            diag.badgesAdded++;
            diag.strategyUsed = 'mutation';
        }
    }

    // ---------- OBSERVER ----------
    var obs = null;
    function startObserver() {
        if (obs) return;
        try {
            obs = new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    var m = muts[i];
                    for (var j = 0; j < m.addedNodes.length; j++) {
                        var n = m.addedNodes[j];
                        if (n.nodeType !== 1) continue;
                        var $n = $(n);
                        if ($n.hasClass('card')) enhanceCardElement($n);
                        else if ($n.find && $n.find('.card').length) {
                            $n.find('.card').each(function () { enhanceCardElement($(this)); });
                        }
                    }
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            log('observer started');
        } catch (e) { log('observer err', e); }
    }

    function scanAll() {
        $('.card').each(function () { enhanceCardElement($(this)); });
    }

    // ---------- ОТЧЁТ ----------
    function reportDiag() {
        notify('Значки: карточек ' + diag.cardsSeen
            + ', с данными ' + diag.cardsWithData
            + ', знаков ' + diag.badgesAdded
            + ', коллекций ' + diag.colReq);
        log('DIAG', JSON.stringify(diag));
        log('instanceKeys', diag.instanceKeys);
        log('cardClasses', diag.cardClasses);
        log('cardDataKeys', diag.cardDataKeys);
    }

    // ---------- СТАРТ ----------
    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;

        injectStyles();
        startObserver();

        setTimeout(scanAll, 500);
        setTimeout(scanAll, 1500);
        setInterval(scanAll, 3000);

        notify('Плагин "Метки на постерах" v8 запущен');
        setTimeout(reportDiag, 8000);
        setTimeout(reportDiag, 20000);
    }

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
})();