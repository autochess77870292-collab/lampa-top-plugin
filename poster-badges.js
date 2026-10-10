// main.js — Плагин "Метки на постерах" для Lampa (v4)
(function () {
    'use strict';

    var PLUGIN_NAME = 'poster_badges_v4';
    var STYLE_ID = 'poster-badges-style';
    var CACHE_KEY = 'poster_badges_cache_v4';
    var COL_CACHE_KEY = 'poster_badges_col_cache_v4';

    function notify(msg) {
        try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {}
    }

    // ---------- КЭШ ----------
    function readCache(k) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : {}; } catch (e) { return {}; } }
    function writeCache(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }
    var posterCache = readCache(CACHE_KEY);
    var colCache = readCache(COL_CACHE_KEY);
    var saveTimer = null;
    function scheduleSave() {
        if (saveTimer) return;
        saveTimer = setTimeout(function () {
            writeCache(CACHE_KEY, posterCache);
            writeCache(COL_CACHE_KEY, colCache);
            saveTimer = null;
        }, 500);
    }

    // ---------- СТИЛИ ----------
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
        $('<style>').attr('id', STYLE_ID).text(css).appendTo('head');
    }

    // ---------- ПАРСИНГ URL ----------
    function posterPathFromUrl(url) {
        if (!url) return '';
        var s = String(url);
        // ищем .../w300/xxx.jpg или /t/p/w300/xxx.jpg
        var m = s.match(/\/([a-zA-Z0-9_-]{20,}\.(?:jpg|jpeg|png|webp))/i);
        if (m) return '/' + m[1];
        return '';
    }

    // ---------- КЭШИРОВАНИЕ ОТВЕТОВ TMDB ----------
    function cacheItem(item) {
        if (!item) return;
        var pp = item.poster_path;
        if (!pp) return;
        posterCache[pp] = {
            id: item.id,
            poster: pp,
            release: item.release_date || item.first_air_date || null,
            collection: item.belongs_to_collection || null,
            isTV: !!(item.name || item.first_air_date)
        };
        scheduleSave();
    }
    function cacheResponse(data) {
        if (!data) return;
        if (Array.isArray(data.results)) data.results.forEach(cacheItem);
        if (Array.isArray(data.items)) data.items.forEach(cacheItem);
        if (data.movie) cacheItem(data.movie);
        if (data.card) cacheItem(data.card);
        if (data.id && data.poster_path) cacheItem(data);
    }

    // ---------- ОБЁРТКА TMDB ----------
    function wrapTMDB() {
        if (!window.Lampa || !Lampa.Api || !Lampa.Api.sources || !Lampa.Api.sources.tmdb) return false;
        var tmdb = Lampa.Api.sources.tmdb;
        var methods = ['full', 'get', 'list', 'category', 'search', 'similar', 'main', 'menu'];
        methods.forEach(function (m) {
            if (typeof tmdb[m] !== 'function' || tmdb['__bwrap_' + m]) return;
            var orig = tmdb[m];
            tmdb[m] = function () {
                var args = Array.prototype.slice.call(arguments);
                var cbIdx = -1;
                for (var i = 0; i < args.length; i++) {
                    if (typeof args[i] === 'function') { cbIdx = i; break; }
                }
                if (cbIdx === -1) return orig.apply(this, args);
                var origCb = args[cbIdx];
                args[cbIdx] = function (data) {
                    try { cacheResponse(data); } catch (e) {}
                    return origCb.apply(this, arguments);
                };
                return orig.apply(this, args);
            };
            tmdb['__bwrap_' + m] = true;
        });
        return true;
    }

    // ---------- ЗАПРОС КОЛЛЕКЦИИ ----------
    function fetchColCount(colId, cb) {
        if (colCache[colId] !== undefined) { cb(colCache[colId]); return; }
        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (!tmdb || !tmdb.get) { cb(0); return; }
        try {
            tmdb.get('collection/' + colId, function (d) {
                var n = 0;
                if (d && d.parts && d.parts.length) n = d.parts.length;
                else if (d && d.number_of_items) n = d.number_of_items;
                colCache[colId] = n; scheduleSave(); cb(n);
            }, function () { colCache[colId] = 0; scheduleSave(); cb(0); });
        } catch (e) { cb(0); }
    }

    // ---------- УКРАШЕНИЕ КАРТОЧКИ ----------
    function decorateCard($card) {
        if (!$card || !$card.length) return;
        if ($card.data('badge-done')) return;

        var $img = $card.find('img').first();
        var src = $img.length ? ($img.attr('src') || '') : '';

        // Если img нет — ищем background-image
        if (!src) {
            var $imgWrap = $card.find('.card__img, .card-image, [class*="card__img"]').first();
            if ($imgWrap.length) {
                var bg = $imgWrap.css('background-image') || '';
                var m = bg.match(/url\(["']?([^"')]+)["']?\)/);
                if (m) src = m[1];
            }
        }
        if (!src) return;

        var pPath = posterPathFromUrl(src);
        if (!pPath) return;

        var info = posterCache[pPath];
        if (!info) return; // ещё нет данных

        $card.data('badge-done', true);

        var $wrap = $card.find('.card__img').first();
        if (!$wrap.length) $wrap = $img.parent();
        if (!$wrap.length) $wrap = $card;

        if ($wrap.find('.card__my-badges').length) return;

        var $badges = $('<div class="card__my-badges"></div>');

        if (info.release) {
            var ts = Date.parse(info.release);
            if (!isNaN(ts) && ts > Date.now()) {
                $badges.append('<div class="card__my-badge card__my-badge--not-released">Не вышло</div>');
            }
        }

        $wrap.append($badges);

        if (info.collection && info.collection.id) {
            fetchColCount(info.collection.id, function (n) {
                if (n >= 2) {
                    $badges.append('<div class="card__my-badge card__my-badge--collection">' + n + '</div>');
                }
            });
        }
    }

    // ---------- СКАНЕР ----------
    function scanCards() {
        try {
            var $cards = $('.card');
            if (!$cards.length) $cards = $('[class*="card__"]').closest('[class*="card"]');
            $cards.each(function () {
                decorateCard($(this));
            });
        } catch (e) {}
    }

    // ---------- MUTATION OBSERVER ----------
    var obs = null;
    function startObserver() {
        if (obs) return;
        try {
            obs = new MutationObserver(function (muts) {
                var hit = false;
                for (var i = 0; i < muts.length; i++) {
                    var m = muts[i];
                    for (var j = 0; j < m.addedNodes.length; j++) {
                        var n = m.addedNodes[j];
                        if (n.nodeType === 1) {
                            if ($(n).hasClass('card') || $(n).find('.card').length > 0) {
                                hit = true; break;
                            }
                        }
                    }
                    if (hit) break;
                }
                if (hit) scanCards();
            });
            obs.observe(document.body, { childList: true, subtree: true });
        } catch (e) {}
    }

    // ---------- СЛУШАТЕЛИ ----------
    function subscribeEvents() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Listener.follow) return;
        ['complite', 'line', 'movie', 'card', 'category', 'main', 'content'].forEach(function (evt) {
            try {
                Lampa.Listener.follow(evt, function () { setTimeout(scanCards, 150); });
            } catch (e) {}
        });
    }

    // ---------- ДИАГНОСТИКА ----------
    function runDiagnostics() {
        var cards = $('.card').length;
        var cacheKeys = Object.keys(posterCache).length;
        notify('Значки: карточек ' + cards + ', в кэше ' + cacheKeys);
    }

    // ---------- СТАРТ ----------
    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;

        injectStyles();
        var wrapped = wrapTMDB();
        subscribeEvents();
        startObserver();

        setTimeout(scanCards, 500);
        setTimeout(scanCards, 1500);
        setTimeout(scanCards, 3000);
        setInterval(scanCards, 2000);

        notify('Плагин "Метки на постерах" v4 запущен');

        // Диагностика через 6 секунд
        setTimeout(runDiagnostics, 6000);
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