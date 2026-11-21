function MyTopComponent() {
    var html = $('<div class="my-top-page" style="height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>');

    function buildContent() {
        try {
            html.empty();
            var top = getTop();
            var units = getSortedUnits();

            var buttons = $('<div style="display:flex;gap:8px;padding:20px 20px 12px;flex-wrap:wrap;"></div>');

            var btnSort = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Сортировать</span></div>');
            onceClick(btnSort, function () { startSort(buildContent); });
            buttons.append(btnSort);

            var btnCopy = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Копировать</span></div>');
            onceClick(btnCopy, function () {
                copyToClipboard(buildTopText(true),
                    function () { notify('Топ скопирован'); },
                    function () { notify('Не удалось скопировать'); });
            });
            buttons.append(btnCopy);

            var btnImport = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Вставить</span></div>');
            onceClick(btnImport, function () { openImportDialog(buildContent); });
            buttons.append(btnImport);

            var btnEnrich = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Обновить</span></div>');
            onceClick(btnEnrich, function () { enrichTop(buildContent); });
            buttons.append(btnEnrich);

            var btnRec = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Рекомендации</span></div>');
            onceClick(btnRec, function () {
                if (!getLLMSettings().apiUrl) { notify('Укажи API в настройках'); openLLMSettings(buildContent); return; }
                requestRecommendations(function (recs) {
                    showRecommendations(recs, function (card) { addToTop(card); });
                }, function (e) { notify('Ошибка: ' + e); });
            });
            buttons.append(btnRec);

            var btnSettings = $('<div class="full-start__button selector" style="flex:1;min-width:110px;"><span>Настройки ИИ</span></div>');
            onceClick(btnSettings, function () { openLLMSettings(buildContent); });
            buttons.append(btnSettings);

            html.append(buttons);
            html.append('<div style="margin:0 20px 20px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;color:#8a8a95;font-size:12px;">Элементов: <b>' + units.length + '</b></div>');

            if (!units.length) { html.append('<div style="padding:40px;text-align:center;color:#8a8a95;">Список пуст</div>'); return; }

            var list = $('<div style="padding:0 20px 120px;"></div>');
            units.forEach(function (u) {
                var placeText = u.place ? '#' + u.place : '—';
                var src = posterUrl(u.poster, 'w200');
                var row = $('<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);"></div>');
                var placeBtn = $('<div>').css({ fontSize: '22px', fontWeight: '700', color: '#ffdd55', minWidth: '44px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }).text(placeText);
                onceClick(placeBtn, function () { editPlace(u.ids, buildContent); });
                row.append(placeBtn);
                var posterWrap = $('<div>').css({ width: '54px', height: '80px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', flexShrink: 0, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' });
                if (src) {
                    var img = $('<img>').attr('src', src).css({ width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
                    img.on('error', function () { var d = 'https://tmdb.org' + String(u.poster).replace(/^\/+/, ''); if (img.attr('src') !== d) img.attr('src', d); else img.remove(); });
                    posterWrap.append(img);
                }
                onceClick(posterWrap, function () { openMovieCard(top[u.ids[0]]); });
                row.append(posterWrap);
                var info = $('<div>').css({ flex: 1, minWidth: 0, cursor: 'pointer' });
                if (u.isCollection) info.append($('<div>').css({ color: '#ffdd55', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '2px' }).text('КОЛЛЕКЦИЯ × ' + u.count));
                var titleDiv = $('<div>').css({ fontSize: '16px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }).text(u.title);
                if (!u.isCollection && top[u.ids[0]].isSeries) titleDiv.append(' ').append($('<span>').css({ color: '#ffdd55', fontSize: '11px' }).text('СЕРИАЛ'));
                info.append(titleDiv);
                if (u.isCollection) {
                    var parts = u.ids.map(function (id) { return top[id].title + ' (' + top[id].year + ')'; }).join(' · ');
                    info.append($('<div>').css({ fontSize: '12px', color: '#8a8a95', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }).text(parts));
                } else {
                    info.append($('<div>').css({ fontSize: '13px', color: '#8a8a95', marginTop: '4px' }).text(top[u.ids[0]].year || '—'));
                }
                if (u.note) info.append($('<div>').css({ fontSize: '12px', color: '#8a8a95', marginTop: '4px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }).text(u.note));
                onceClick(info, function () { openMovieCard(top[u.ids[0]]); });
                row.append(info);
                var noteBtn = $('<div class="full-start__button selector" style="padding:8px 12px;"><span style="font-size:12px;">Заметка</span></div>');
                onceClick(noteBtn, function () {
                    if (u.isCollection) editCollectionNotes(u.ids, buildContent);
                    else editNote(u.ids[0], buildContent);
                });
                row.append(noteBtn);
                list.append(row);
            });
            html.append(list);
        } catch (e) {
            html.append('<div style="padding:40px;text-align:center;color:#ff6666;">Ошибка: ' + e.message + '</div>');
        }
    }

    this.create = function () { syncWithFavorites(true); buildContent(); return html; };
    this.start = function () {};
    this.render = function () { return html; };
    this.destroy = function () { html.remove(); };
}

function registerComponent() {
    if (!window.Lampa || !Lampa.Component || !Lampa.Component.add) return;
    Lampa.Component.add('my_top_page', MyTopComponent);
}
function openTopPage() {
    try { Lampa.Activity.push({ url: '', title: 'Мой топ', component: 'my_top_page', data: {} }); }
    catch (e) { notify('Ошибка открытия: ' + e.message); }
}

var STAR_SVG_CARD = '<svg xmlns="http://w3.org" viewBox="0 0 24 24" style="width:2em;height:2em;min-width:2em;min-height:2em;display:block;flex:0 0 auto;"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
var STAR_SVG_MENU = '<svg xmlns="http://w3.org" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;display:block;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

function addButtonToFull(e) {
    if (e.type !== 'complite') return;
    var movie = e.data && e.data.movie ? e.data.movie : null;
    if (!movie) return;
    setTimeout(function () {
        if ($('.my-top-btn-card').length > 0) return;
        var btn = $('<div class="full-start__button selector view--custom my-top-btn-card" style="display:flex;align-items:center;justify-content:center;">' + STAR_SVG_CARD + '</div>');
        onceClick(btn, function () { addToTop(movie); });
        var c = $('.full-start__buttons');
        if (c.length) c.append(btn);
        else $('[class*="full-start"][class*="buttons"]').first().append(btn);
    }, 200);
}
function addMenuItem() {
    var attempts = 0, maxAttempts = 20;
    var tryAdd = function () {
        attempts++;
        var lists = $('.menu .menu__list');
        if (lists.length > 0) {
            var first = lists.first();
            if (first.find('.my-top-menu-item').length > 0) return;
            var item = $('<li class="menu__item selector my-top-menu-item"><div class="menu__ico">' + STAR_SVG_MENU + '</div><div class="menu__text">Мой топ</div></li>');
            onceClick(item, openTopPage);
            first.append(item);
        } else if (attempts < maxAttempts) setTimeout(tryAdd, 500);
    };
    setTimeout(tryAdd, 1500);
}
function startPlugin() {
    if (window[PLUGIN_NAME]) return;
    window[PLUGIN_NAME] = true;
    try {
        registerComponent();
        Lampa.Listener.follow('full', addButtonToFull);
        addMenuItem();
        notify('V1');
    } catch (e) {}
}
if (window.appready) startPlugin();
else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') startPlugin(); });
