// main.js — Плагин "Метки на постерах" для Lampa (v7)
(function () {
    'use strict';

    var PLUGIN_NAME = 'poster_badges_v7';
    var STYLE_ID = 'poster-badges-style';
    var COL_CACHE_KEY = 'poster_badges_col_v7';

    function notify(msg) {
        try { if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(msg); } catch (e) {}
    }
    function log() {
        try { console.log.apply(console, ['[Badges]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
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

    // ---------- ДИАГНОСТИКА ----------
    var diag = {
        patchOK: false,
        cardsBuilt: 0,
        cardsWithData: 0,
        cardsNotReleased: 0,
        badgesAdded: 0,
        colRequests: 0,
        lastDataKeys: [],
        lastHtmlClasses: []
    };

    // ---------- КЭШ КОЛЛЕКЦИЙ ----------
    var colCache = (function () {
        try { return JSON.parse(localStorage.getItem(COL_CACHE_KEY) || '{}'); }
        catch (e) { return {}; }
    })();
    function saveColCache() {
        try { localStorage.setItem(COL_CACHE_KEY, JSON.stringify(colCache)); } catch (e) {}
    }
    function fetchColCount(colId, cb) {
        if (colCache[colId] !== undefined) { cb(colCache[colId]); return; }
        var tmdb = (window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb) || null;
        if (!tmdb || !tmdb.get) { cb(0); return; }
        diag.colRequests++;
        try {
            tmdb.get('collection/' + colId, function (d) {
                var n = 0;
                if (d && d.parts && d.parts.length) n = d.parts.length;
                else if (d && d.number_of_items) n = d.number_of_items;
                colCache[colId] = n; saveColCache(); cb(n);
            }, function () { colCache[colId] = 0; saveColCache(); cb(0); });
        } catch (e) { cb(0); }
    }

    // ---------- ЛОГИКА ЗНАЧКОВ ----------
    function isReleased(item) {
        var d = item.release_date || item.first_air_date || '';
        if (!d) return true;
        var ts = Date.parse(d);
        if (isNaN(ts)) return true;
        return ts <= Date.now();
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

    function enhanceCard(inst) {
        if (!inst || !inst.html) return;
        var $card = inst.html;
        if (!$card || !$card.length) return;

        diag.cardsBuilt++;

        var data = inst.data || inst.movie || inst.item || null;
        if (!data) { log('нет data'); return; }
        diag.cardsWithData++;
        try { diag.lastDataKeys = Object.keys(data).slice(0, 20); } catch (e) {}

        if ($card.data('badge-done')) return;

        var $wrap = findPosterWrap($card);
        if (!$wrap.length) { log('нет wrap'); return; }
        try { diag.lastHtmlClasses = ($wrap.attr('class') || '').split(' ').slice(0, 6); } catch (e) {}
        if ($wrap.find('.card__my-badges').length) return;

        var $badges = $('<div class="card__my-badges"></div>');
        var added = false;

        // "Не вышло"
        if (!isReleased(data)) {
            $badges.append('<div class="card__my-badge card__my-badge--not-released">Не вышло</div>');
            diag.cardsNotReleased++;
            added = true;
        }

        // Коллекция
        var col = data.belongs_to_collection;
        if (col && col.id) {
            added = true;
            fetchColCount(col.id, function (n) {
                if (n >= 2) {
                    $badges.append('<div class="card__my-badge card__my-badge--collection">' + n + '</div>');
                    diag.badgesAdded++;
                }
            });
        }

        if (added) {
            // выравниваем позиционирование
            var curPos = $wrap.css('position');
            if (!curPos || curPos === 'static') $wrap.css('position', 'relative');
            $wrap.append($badges);
            $card.data('badge-done', true);
            diag.badgesAdded++;
        }
    }

    // ---------- ПЕРЕХВАТ КОНСТРУКТОРА ----------
    function wrapCardConstructor() {
        if (diag.patchOK) return true;
        if (!window.Lampa || !Lampa.Card) { log('нет Lampa.Card'); return false; }

        var Orig = Lampa.Card;

        function WrappedCard(object) {
            var inst = new Orig(object);

            var origBuild = inst.build;
            inst.build = function () {
                var r;
                try { r = origBuild.apply(inst, arguments); }
                catch (e) { log('build err', e); return; }
                setTimeout(function () {
                    try { enhanceCard(inst); } catch (e) { log('enhance err', e); }
                }, 0);
                return r;
            };

            setTimeout(function () {
                try { enhanceCard(inst); } catch (e) {}
            }, 300);

            return inst;
        }

        WrappedCard.prototype = Orig.prototype;
        for (var k in Orig) {
            if (Object.prototype.hasOwnProperty.call(Orig, k)) WrappedCard[k] = Orig[k];
        }

        Lampa.Card = WrappedCard;
        diag.patchOK = true;
        log('Lampa.Card перехвачен');
        return true;
    }

    // ---------- РЕТРО-СКАН ----------
    function retroScan() {
        $('.card').each(function () {
            var $c = $(this);
            if ($c.data('badge-done')) return;
            var inst = $c.data('card-instance') || $c.data('card') || $c.data('instance');
            if (inst) { try { enhanceCard(inst); } catch (e) {} }
        });
    }

    // ---------- ОТЧЁТ ----------
    function reportDiag() {
        notify('Значки: патч ' + (diag.patchOK ? 'OK' : 'FAIL')
            + ', карточек ' + diag.cardsBuilt
            + ', с данными ' + diag.cardsWithData
            + ', не вышло ' + diag.cardsNotReleased
            + ', коллекций ' + diag.colRequests);
        log('DIAG', JSON.stringify(diag));
        log('lastDataKeys', diag.lastDataKeys);
        log('lastHtmlClasses', diag.lastHtmlClasses);
    }

    // ---------- СТАРТ ----------
    function startPlugin() {
        if (window[PLUGIN_NAME]) return;
        window[PLUGIN_NAME] = true;

        injectStyles();

        var ok = wrapCardConstructor();
        if (!ok) {
            var tries = 0;
            var iv = setInterval(function () {
                tries++;
                if (wrapCardConstructor() || tries > 40) clearInterval(iv);
            }, 500);
        }

        setInterval(retroScan, 3000);

        notify('Плагин "Метки на постерах" v7 запущен (патч ' + (diag.patchOK ? 'OK' : '...') + ')');
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