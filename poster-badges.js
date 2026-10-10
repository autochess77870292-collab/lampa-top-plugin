// main.js — Плагин "Метки на постерах" для Lampa (v3)
(function () {
    'use strict';

    var PLUGIN_NAME = 'poster_badges_v3';
    var STYLE_ID = 'poster-badges-style';
    var CACHE_KEY = 'poster_badges_cache_v3';
    var COL_CACHE_KEY = 'poster_badges_col_cache_v3';

    function notify(msg) {
        try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {}
    }

    // ---------- КЭШ ----------
    function readCache(key) {
        try { var r = localStorage.getItem(key); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
    }
    function writeCache(key, obj) {
        try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
    }
    var posterCache = readCache(CACHE_KEY);
    var colCache = readCache(COL_CACHE_KEY);
    var saveCacheScheduled = false;
    function scheduleSave() {
        if (saveCacheScheduled) return;
        saveCacheScheduled = true;
        setTimeout(function () {
            writeCache(CACHE_KEY, posterCache);
            writeCache(COL_CACHE_KEY, colCache);
            saveCacheScheduled = false;
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

    // ---------- ИЗВЛЕЧЕНИЕ ПОСТЕРА ИЗ URL ----------
    function posterPathFromUrl(url) {
        if (!url) return '';
        var m = String(url).match(/\/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))/i);
        return m ? ('/' + m[1]) : '';
    }

    // ---------- КЭШИРОВАНИЕ ОТВЕТОВ TMDB ----------
    function cacheItem(item) {
        if (!item || !item.poster_path) return;
        var entry = {
            id: item.id,
            poster: item.poster_path,
            release: item.release_date || item.first_air_date || null,
            collection: item.belongs_to_collection || null,
            isTV: !!(item.name || item.first_air_date)
        };
        posterCache[item.poster_path] = entry;
        scheduleSave();
    }

    function cacheResponse(data) {
        if (!data) return;
        if (Array.isArray(data.results)) {
            data.results.forEach(cacheItem);
        }
        if (data.movie) cacheItem(data.movie);
        if (data.id && data.poster_path) cacheItem(data);
    }

    // ---------- ОБЁРТКА TMDB ----------
    function wrapTMDB() {
        if (!window.Lampa || !Lampa.Api || !Lampa.Api.sources || !Lampa.Api.sources.tmdb) return;
        var tmdb = Lampa.Api.sources.tmdb;
        ['full', 'get', 'list', 'category', 'search', 'similar'].forEach(function (m) {
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
    }

    // ---------- ЗАПРОС ЧИСЛА ЧАСТЕЙ КОЛЛЕКЦИИ ----------
    function fetchCollectionCount(colId, cb) {
        if (colCache[colId] !== undefined) { cb(colCache[colId]); return; }
        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (!tmdb || !tmdb.get) { cb(0); return; }
        try {
            tmdb.get('collection/' + colId, function (data) {
                var n = 0;
                if (data && data.parts && data.parts.length) n = data.parts.length;
                else if (data && data.number_of_items) n = data.number_of_items;
                colCache[colId] = n;
                scheduleSave();
                cb(n);
            }, function () {
                colCache[colId] = 0;
                scheduleSave();
                cb(0);
            });
        } catch (e) { cb(0); }
    }

    // ---------- ДОБАВЛЕНИЕ ЗНАЧКОВ НА КАРТОЧКУ ----------
    function decorateCard($card) {
        if (!$card || !$card.length) return;
        if ($card.data('badge-done')) return;

        var $img = $card.find('.card__img img, img').first();
        if (!$img.length) return;
        var src = $img.attr('src') || '';
        var pPath = posterPathFromUrl(src);
        if (!pPath) return;

        var info = posterCache[pPath];
        if (!info) return; // ещё нет данных

        // Помечаем "обработана" до добавления, чтобы не дублировать
        $card.data('badge-done', true);

        var $wrap = $card.find('.card__img').first();
        if (!$wrap.length) $wrap = $img.parent();
        if (!$wrap.length) return;
        if ($wrap.find('.card__my-badges').length) return;

        var $badges = $('<div class="card__my-badges"></div>');

        // "Не вышло"
        if (info.release) {
            var ts = Date.parse(info.release);
            if (!isNaN(ts) && ts > Date.now()) {
                $badges.append('<div class="card__my-badge card__my-badge--not-released">Не вышло</div>');
            }
        }

        $wrap.append($badges);

        // Коллекция (асинхронно, если есть данные)
        if (info.collection && info.collection.id) {
            fetchCollectionCount(info.collection.id, function (n) {
                if (n >= 2) {
                    $badges.append('<div class="card__my-badge card__my-badge--collection">' + n + '</div>');
                }
            });
        }
    }

    // ---------- СКАНЕР ----------
    function scanCards() {
        try {
            $('.card').each(function () { decorateCard($(this)); });
        } catch (e) {}
    }

    // ---------- MUTATION OBSERVER ----------
    var obs = null;
    function startObserver() {
        if (obs) return;
        try {
            obs = new MutationObserver(function (mutations) {
                var shouldScan = false;
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    for (var j = 0; j < m.addedNodes.length; j++) {
                        var n = m.addedNodes[j];
                        if (n.nodeType === 1) {
                            if ($(n).hasClass('card') || $(n).find('.card').length > 0) {
                                shouldScan = true; break;
                            }
                        }
                    }
                    if (shouldScan) break;
                }
                if (shouldScan) scanCards();
            });
            obs.observe(document.body, { childList: true, subtree: true });
        } catch (e) { console.error('[Badges] observer err', e); }
    }

    // ---------- СЛУШАТЕЛИ LAMPA ----------
    function subscribeEvents() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Listener.follow) return;
        ['complite', 'line', 'movie', 'card', 'category'].forEach(function (evt) {
            try {
                Lampa.Listener.follow(evt, function () {
                    setTimeout(scanCards, 100);
                });
            } catch (e) {}
        });
    }

    // ---------- СТАРТ ----------
    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;

        injectStyles();
        wrapTMDB();
        subscribeEvents();
        startObserver();

        // Первые проходы
        setTimeout(scanCards, 500);
        setTimeout(scanCards, 1500);
        setTimeout(scanCards, 3000);

        // Регулярный сканер
        setInterval(scanCards, 3000);

        notify('Плагин "Метки на постерах" v3 запущен');
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