// main.js — Плагин "Метки на постерах" для Lampa (v2)
// "Не вышло" + счётчик коллекции из TMDB. Независимо от "Моего топа".
(function () {
    'use strict';

    var PLUGIN_NAME = 'poster_badges_v2';
    var CARD_STYLE_ID = 'poster-badges-style';
    var CACHE_KEY = 'poster_badges_collection_cache';

    function notify(msg) {
        try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {}
    }

    // ============ КЭШ ============
    function getCache() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }
    function saveCache(cache) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    }
    function cacheGet(key) {
        var c = getCache();
        return c[key] || null;
    }
    function cacheSet(key, value) {
        var c = getCache();
        c[key] = value;
        saveCache(c);
    }

    // ============ СТИЛИ ============
    function injectStyles() {
        if ($('#' + CARD_STYLE_ID).length) return;
        var css = ''
            + '.card__my-badges { position: absolute; inset: 0; pointer-events: none; z-index: 3; }'
            + '.card__my-badge {'
            + '  position: absolute; font-size: 10px; font-weight: 700;'
            + '  padding: 2px 6px; border-radius: 4px; letter-spacing: 0.3px;'
            + '  line-height: 1.4; white-space: nowrap;'
            + '  box-shadow: 0 1px 3px rgba(0,0,0,0.5);'
            + '}'
            + '.card__my-badge--not-released {'
            + '  top: 6px; left: 6px; background: #c62828; color: #fff;'
            + '}'
            + '.card__my-badge--collection {'
            + '  top: 6px; right: 6px; background: #ffdd55; color: #000;'
            + '  border-radius: 50%; min-width: 20px; height: 20px;'
            + '  display: flex; align-items: center; justify-content: center;'
            + '  padding: 0; font-size: 11px;'
            + '}';
        $('<style>').attr('id', CARD_STYLE_ID).text(css).appendTo('head');
    }

    // ============ ДАННЫЕ КАРТОЧКИ ============
    function getCardData(cardInstance) {
        if (!cardInstance) return null;
        return cardInstance.data || cardInstance.movie || cardInstance.item;
    }

    function isReleased(item) {
        if (!item) return true;
        var dateStr = item.release_date || item.first_air_date || '';
        if (!dateStr) return true;
        var ts = Date.parse(dateStr);
        if (isNaN(ts)) return true;
        return ts <= Date.now();
    }

    // ============ ПОЛУЧЕНИЕ КОЛЛЕКЦИИ ИЗ TMDB ============
    // 1. Запрашиваем детали фильма, чтобы получить belongs_to_collection
    // 2. Если есть — запрашиваем детали коллекции, чтобы узнать число частей
    function fetchCollectionCount(itemId, method, callback) {
        var cacheKey = method + '_' + itemId;
        var cached = cacheGet(cacheKey);
        if (cached !== null) {
            callback(cached);
            return;
        }

        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (!tmdb || !tmdb.full) {
            callback(0);
            return;
        }

        // Шаг 1: детали фильма
        tmdb.full({ id: itemId, method: method, card: {} }, function (data) {
            var movie = data.movie || data;
            var col = movie.belongs_to_collection;
            if (!col || !col.id) {
                cacheSet(cacheKey, 0);
                callback(0);
                return;
            }

            // Шаг 2: детали коллекции
            var colCacheKey = 'col_' + col.id;
            var colCached = cacheGet(colCacheKey);
            if (colCached !== null) {
                cacheSet(cacheKey, colCached);
                callback(colCached);
                return;
            }

            if (!tmdb.get) {
                cacheSet(cacheKey, 1);
                callback(1);
                return;
            }

            tmdb.get('collection/' + col.id, function (colData) {
                var count = 0;
                if (colData && colData.parts && colData.parts.length) {
                    count = colData.parts.length;
                } else if (colData && colData.number_of_items) {
                    count = colData.number_of_items;
                }
                cacheSet(colCacheKey, count);
                cacheSet(cacheKey, count);
                callback(count);
            }, function () {
                cacheSet(cacheKey, 1);
                callback(1);
            });
        }, function () {
            cacheSet(cacheKey, 0);
            callback(0);
        });
    }

    // ============ УЛУЧШЕНИЕ КАРТОЧКИ ============
    function enhanceCard(cardInstance) {
        if (!cardInstance || !cardInstance.html) return;
        var $card = cardInstance.html;
        if (!$card || !$card.length) return;
        if ($card.find('.card__my-badges').length > 0) return;

        var data = getCardData(cardInstance);
        if (!data || !data.id) return;

        var method = (data.name || data.first_air_date) ? 'tv' : 'movie';

        // Контейнер для бейджей
        var $posterWrap = $card.find('.card__img').first();
        if (!$posterWrap.length) $posterWrap = $card.find('.card__poster').first();
        if (!$posterWrap.length) $posterWrap = $card.find('img').first().parent();
        if (!$posterWrap.length) return;

        var $badgesWrap = $('<div class="card__my-badges"></div>');

        // 1. "Не вышло"
        if (!isReleased(data)) {
            $badgesWrap.append($('<div class="card__my-badge card__my-badge--not-released">').text('Не вышло'));
        }

        $posterWrap.append($badgesWrap);

        // 2. Коллекция — асинхронно
        fetchCollectionCount(data.id, method, function (count) {
            if (count >= 2) {
                $badgesWrap.append($('<div class="card__my-badge card__my-badge--collection">').text(String(count)));
            }
        });
    }

    // ============ ПАТЧ BUILD ============
    function patchCardBuild() {
        if (!window.Lampa || !Lampa.Card || !Lampa.Card.prototype) return;
        if (Lampa.Card.prototype.__posterBadgesPatched) return;

        var descriptor = Object.getOwnPropertyDescriptor(Lampa.Card.prototype, 'build');
        if (descriptor && (descriptor.get || descriptor.set)) return;

        Object.defineProperty(Lampa.Card.prototype, 'build', {
            configurable: true,
            get: function () { return this._build; },
            set: function (fn) {
                var self = this;
                this._build = function () {
                    var result = fn.apply(self, arguments);
                    try {
                        setTimeout(function () { enhanceCard(self); }, 0);
                        if (window.Lampa && Lampa.Listener && Lampa.Listener.send) {
                            Lampa.Listener.send('card', { type: 'build', object: self });
                        }
                    } catch (e) {}
                    return result;
                };
            }
        });
        Lampa.Card.prototype.__posterBadgesPatched = true;
    }

    // ============ ПОДПИСКА ============
    function subscribeToCardEvents() {
        if (!window.Lampa || !Lampa.Listener || !Lampa.Listener.follow) return;
        try {
            Lampa.Listener.follow('card', function (e) {
                if (!e || e.type !== 'build' || !e.object) return;
                try { enhanceCard(e.object); } catch (err) {}
            });
        } catch (e) {}
    }

    // ============ СТАРТ ============
    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;

        injectStyles();
        patchCardBuild();
        subscribeToCardEvents();

        // Догоняем уже отрисованные карточки
        setTimeout(function () {
            $('.card').each(function () {
                var $c = $(this);
                if ($c.find('.card__my-badges').length > 0) return;
                var inst = $c.data('card-instance') || $c.data('card');
                if (inst) { try { enhanceCard(inst); } catch (e) {} }
            });
        }, 1500);

        notify('Плагин "Метки на постерах" v2 запущен');
    }

    if (window.appready) startPlugin();
    else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
    } else {
        var tries = 0;
        var iv = setInterval(function () {
            tries++;
            if (window.appready) { clearInterval(iv); startPlugin(); }
            else if (tries > 40) clearInterval(iv);
        }, 500);
    }
})();