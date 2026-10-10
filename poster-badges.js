// main.js — Плагин "Метки на постерах" для Lampa (v10)
// Данные берём из DOM, обогащаем через TMDB search.
(function () {
    'use strict';

    var PLUGIN_NAME = 'poster_badges_v10';
    var STYLE_ID = 'poster-badges-style';
    var CACHE_KEY = 'poster_badges_cache_v10';
    var COL_CACHE_KEY = 'poster_badges_col_v10';

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

    // ---------- КЭШИ ----------
    var enrichCache = {};
    var colCache = {};
    try {
        var r1 = localStorage.getItem(CACHE_KEY);
        if (r1) enrichCache = JSON.parse(r1) || {};
        var r2 = localStorage.getItem(COL_CACHE_KEY);
        if (r2) colCache = JSON.parse(r2) || {};
    } catch (e) {}

    var saveTimer = null;
    function scheduleSave() {
        if (saveTimer) return;
        saveTimer = setTimeout(function () {
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(enrichCache)); } catch (e) {}
            try { localStorage.setItem(COL_CACHE_KEY, JSON.stringify(colCache)); } catch (e) {}
            saveTimer = null;
        }, 800);
    }

    // ---------- ДИАГНОСТИКА ----------
    var diag = {
        scanned: 0,
        decorated: 0,
        notReleased: 0,
        collections: 0,
        searches: 0,
        cacheHits: 0,
        errors: 0
    };

    // ---------- ЧТЕНИЕ DOM ----------
    function posterPathFromUrl(url) {
        if (!url) return '';
        var m = String(url).match(/\/([a-zA-Z0-9_-]{20,}\.(?:jpg|jpeg|png|webp))/i);
        return m ? ('/' + m[1]) : '';
    }

    function readCardFromDOM($card) {
        // Название
        var title = '';
        var titleSels = ['.card__title', '.card-title', '[class*="card__title"]', '[class*="card-title"]'];
        for (var i = 0; i < titleSels.length; i++) {
            var $t = $card.find(titleSels[i]).first();
            if ($t.length) { title = ($t.text() || '').trim(); if (title) break; }
        }

        // Год
        var year = '';
        var yearSels = ['.card__date', '.card-date', '[class*="card__date"]', '[class*="card-date"]'];
        for (var j = 0; j < yearSels.length; j++) {
            var $y = $card.find(yearSels[j]).first();
            if ($y.length) {
                var txt = ($y.text() || '').trim();
                var m = txt.match(/\b(19|20)\d{2}\b/);
                if (m) { year = m[0]; break; }
            }
        }

        // Постер
        var src = '';
        var $img = $card.find('img').first();
        if ($img.length) src = $img.attr('src') || $img.attr('data-src') || '';
        var posterPath = posterPathFromUrl(src);

        if (!title) return null;
        return { title: title, year: year, posterPath: posterPath };
    }

    // ---------- TMDB SEARCH + FULL ----------
    var activeRequests = 0;
    var maxRequests = 3;
    var requestQueue = [];

    function queueRequest(fn) {
        requestQueue.push(fn);
        pumpQueue();
    }
    function pumpQueue() {
        while (activeRequests < maxRequests && requestQueue.length) {
            var fn = requestQueue.shift();
            activeRequests++;
            try {
                fn(function () {
                    activeRequests--;
                    setTimeout(pumpQueue, 150);
                });
            } catch (e) {
                activeRequests--;
            }
        }
    }

    function getTMDB() {
        return (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
    }

    function searchAndEnrich(title, year, done) {
        var tmdb = getTMDB();
        if (!tmdb || typeof tmdb.search !== 'function') { done(null); return; }

        diag.searches++;
        var query = { query: title, type: 'movie' };
        if (year) query.year = year;

        tmdb.search(query, function (res) {
            var movie = null;
            try {
                if (res && Array.isArray(res.results) && res.results.length) {
                    movie = res.results[0];
                }
            } catch (e) {}
            if (!movie) { done(null); return; }

            // Если у результата уже есть belongs_to_collection и release_date — используем
            if (movie.release_date && movie.belongs_to_collection !== undefined) {
                done(movie);
                return;
            }

            // Иначе — full для получения полных данных
            if (typeof tmdb.full !== 'function') { done(movie); return; }
            tmdb.full({ id: movie.id, method: 'movie', card: {} }, function (full) {
                done((full && full.movie) || movie);
            }, function () { done(movie); });
        }, function () { done(null); });
    }

    // ---------- ДЕКОРИРОВАНИЕ ----------
    function isReleased(item) {
        try {
            var d = item.release_date || item.first_air_date || '';
            if (!d) return true;
            var ts = Date.parse(d);
            if (isNaN(ts)) return true;
            return ts <= Date.now();
        } catch (e) { return true; }
    }

    function findPosterWrap($card) {
        try {
            var sels = ['.card__img', '.card-image', '[class*="card__img"]', '[class*="card__poster"]'];
            for (var i = 0; i < sels.length; i++) {
                var $w = $card.find(sels[i]).first();
                if ($w.length) return $w;
            }
            var $img = $card.find('img').first();
            if ($img.length) return $img.parent();
        } catch (e) {}
        return $card;
    }

    function applyBadges($card, data) {
        if ($card.data('badge-done')) return;
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
            if (colCache[col.id] !== undefined) {
                if (colCache[col.id] >= 2) {
                    $badges.append('<div class="card__my-badge card__my-badge--collection">' + colCache[col.id] + '</div>');
                    diag.collections++;
                }
            } else {
                var tmdb = getTMDB();
                if (tmdb && typeof tmdb.get === 'function') {
                    tmdb.get('collection/' + col.id, function (d) {
                        var n = 0;
                        try {
                            if (d && d.parts && d.parts.length) n = d.parts.length;
                            else if (d && d.number_of_items) n = d.number_of_items;
                        } catch (e) {}
                        colCache[col.id] = n;
                        scheduleSave();
                        if (n >= 2) {
                            $badges.append('<div class="card__my-badge card__my-badge--collection">' + n + '</div>');
                            diag.collections++;
                        }
                    }, function () { colCache[col.id] = 0; scheduleSave(); });
                }
            }
        }

        if (added) {
            try {
                var curPos = $wrap.css('position');
                if (!curPos || curPos === 'static') $wrap.css('position', 'relative');
            } catch (e) {}
            $wrap.append($badges);
            $card.data('badge-done', true);
            diag.decorated++;
        }
    }

    // ---------- ПРОВЕРКА ВИДИМОСТИ ----------
    function isVisible($card) {
        try {
            var el = $card[0];
            if (!el) return false;
            var rect = el.getBoundingClientRect();
            var vh = window.innerHeight || document.documentElement.clientHeight;
            // Расширяем окно на 200px вверх/вниз — предзагрузка
            return rect.bottom > -200 && rect.top < vh + 200;
        } catch (e) { return true; }
    }

    // ---------- СКАНЕР ----------
    function scanVisible() {
        try {
            var $cards = $('.card');
            if (!$cards.length) return;

            $cards.each(function () {
                var $c = $(this);
                if ($c.data('badge-done') || $c.data('badge-pending')) return;
                if (!isVisible($c)) return;

                var info = readCardFromDOM($c);
                if (!info) return;
                diag.scanned++;

                // Есть в кэше — применяем сразу
                if (info.posterPath && enrichCache[info.posterPath]) {
                    diag.cacheHits++;
                    applyBadges($c, enrichCache[info.posterPath]);
                    return;
                }

                // Иначе — в очередь
                $c.data('badge-pending', true);
                queueRequest(function (releaseSlot) {
                    searchAndEnrich(info.title, info.year, function (movie) {
                        $c.removeData('badge-pending');
                        if (!movie) { releaseSlot(); return; }
                        if (info.posterPath) {
                            enrichCache[info.posterPath] = {
                                release_date: movie.release_date || movie.first_air_date || null,
                                belongs_to_collection: movie.belongs_to_collection || null
                            };
                            scheduleSave();
                        }
                        applyBadges($c, movie);
                        releaseSlot();
                    });
                });
            });
        } catch (e) { diag.errors++; log('scan err', e); }
    }

    // ---------- ОТЧЁТ ----------
    function reportDiag() {
        try {
            notify('Значки: скан ' + diag.scanned
                + ', знаков ' + diag.decorated
                + ', не вышло ' + diag.notReleased
                + ', коллекций ' + diag.collections
                + ', поисков ' + diag.searches
                + ', кэш ' + diag.cacheHits);
            log('DIAG', JSON.stringify(diag));
        } catch (e) {}
    }

    // ---------- СТАРТ ----------
    var scanInterval = null;

    function startPlugin() {
        try {
            if (window[PLUGIN_NAME]) return;
            window[PLUGIN_NAME] = true;

            injectStyles();

            setTimeout(scanVisible, 1000);
            setTimeout(scanVisible, 2500);
            setTimeout(scanVisible, 5000);

            if (!scanInterval) {
                scanInterval = setInterval(function () {
                    try { scanVisible(); } catch (e) {}
                }, 2500);
            }

            notify('Плагин "Метки на постерах" v10 запущен');
            setTimeout(reportDiag, 10000);
            setTimeout(reportDiag, 25000);
        } catch (e) { log('start err', e); }
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
    } catch (e) { log('bootstrap err', e); }
})();