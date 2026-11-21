function buildLLMPrompt() {
    var text = buildTopText(true);
    return 'Ты — эксперт по кино. Вот мой персональный топ фильмов и сериалов (от лучшего к худшему):\n\n' + text +
        '\n\nПорекомендуй мне 10 фильмов или сериалов, которых НЕТ в этом списке, опираясь на жанры, темы и стиль моего топа.' +
        '\n\nОтветь СТРОГО в формате JSON, без markdown и без пояснений вокруг:' +
        '\n{"recommendations":[{"title":"Название","year":"2020","reason":"Почему подходит (1 предложение)"}]}';
}
function httpPost(url, headers, bodyStr, onOk, onErr) {
    try {
        if (window.Lampa && Lampa.Request && typeof Lampa.Request.native === 'function') {
            Lampa.Request.native(url, function (response) {
                try { onOk(typeof response === 'string' ? response : JSON.stringify(response)); }
                catch (e) { onErr('parse ' + e.message); }
            }, function (e) { onErr('native ' + (e && e.message ? e.message : 'fail')); },
            { method: 'POST', headers: headers, body: bodyStr });
            return;
        }
    } catch (e) {}
    try {
        fetch(url, { method: 'POST', headers: headers, body: bodyStr })
            .then(function (r) { return r.text(); })
            .then(function (t) { onOk(t); })
            .catch(function (e) { onErr('fetch ' + e.message); });
        return;
    } catch (e) {}
    onErr('нет способа отправить запрос');
}
function requestRecommendations(onOk, onErr) {
    var s = getLLMSettings();
    if (!s.apiUrl || !s.apiKey) { onErr('Укажи API URL и ключ в настройках'); return; }
    var url = s.apiUrl.replace(/\/+$/, '') + '/chat/completions';
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey };
    var body = JSON.stringify({ model: s.model, messages: [{ role: 'user', content: buildLLMPrompt() }], temperature: 0.7 });
    notify('Запрос к нейросети...');
    httpPost(url, headers, body, function (text) {
        try {
            var resp = JSON.parse(text);
            var content = '';
            if (resp.choices && resp.choices[0] && resp.choices[0].message) content = resp.choices[0].message.content || '';
            else if (resp.content) content = resp.content;
            else { onErr('Неожиданный формат ответа'); return; }
            content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            var fb = content.indexOf('{');
            var lb = content.lastIndexOf('}');
            if (fb === -1 || lb === -1) { onErr('Ответ не содержит JSON'); return; }
            var json = JSON.parse(content.substring(fb, lb + 1));
            if (!json.recommendations || !Array.isArray(json.recommendations)) { onErr('Нет массива recommendations'); return; }
            onOk(json.recommendations);
        } catch (e) { onErr('Парсинг: ' + e.message); }
    }, onErr);
}

function openLLMSettings(onDone) {
    var s = getLLMSettings();
    var modal = $('<div>').css({ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });
    var box = $('<div>').css({ background: '#1c1c22', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto' });
    box.append($('<div>').css({ color: '#fff', fontSize: '18px', marginBottom: '16px' }).text('Настройки нейросети'));
    function field(label, placeholder, value, isPassword) {
        var wrap = $('<div>').css({ marginBottom: '14px' });
        wrap.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginBottom: '6px' }).text(label));
        var input = $('<input>').attr('type', isPassword ? 'password' : 'text').attr('placeholder', placeholder).css({ width: '100%', background: '#0f0f12', color: '#e8e8ec', border: '1px solid #2c2c34', borderRadius: '8px', padding: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }).val(value || '');
        shieldInput(input);
        wrap.append(input);
        return { wrap: wrap, input: input };
    }
    var fUrl = field('API URL', 'https://api.deepseek.com/v1', s.apiUrl);
    var fKey = field('API Key', 'sk-...', s.apiKey, true);
    var fModel = field('Модель', 'deepseek-chat', s.model);
    box.append(fUrl.wrap).append(fKey.wrap).append(fModel.wrap);
    box.append($('<div>').css({ color: '#8a8a95', fontSize: '11px', lineHeight: '1.5', marginTop: '6px' }).html('OpenAI-совместимый API: DeepSeek, OpenRouter, Groq, Together. Ключ хранится только на устройстве.'));
    var btnRow = $('<div>').css({ display: 'flex', gap: '8px', marginTop: '18px', justifyContent: 'flex-end' });
    var btnCancel = $('<div class="full-start__button selector"><span>Отмена</span></div>');
    var btnSave = $('<div class="full-start__button selector"><span>Сохранить</span></div>');
    btnRow.append(btnCancel).append(btnSave);
    box.append(btnRow);
    modal.append(box);
    $('body').append(modal);
    modal.on('keydown keyup keypress', function (e) { e.stopPropagation(); });
    onceClick(btnCancel, function () { modal.remove(); });
    onceClick(btnSave, function () {
        saveLLMSettings({ apiUrl: fUrl.input.val().trim(), apiKey: fKey.input.val().trim(), model: fModel.input.val().trim() || 'gpt-4o-mini' });
        modal.remove();
        notify('Настройки сохранены');
        if (onDone) onDone();
    });
}

function showRecommendations(recs, onAddToTop) {
    var modal = $('<div>').css({ position: 'fixed', inset: 0, background: '#0f0f12', zIndex: 100001, display: 'flex', flexDirection: 'column' });
    var header = $('<div>').css({ padding: '16px 20px', background: '#1a1a20', display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
    header.append($('<div>').css({ color: '#fff', fontSize: '18px' }).text('Рекомендации (' + recs.length + ')'));
    var btnClose = $('<div class="full-start__button selector"><span>Закрыть</span></div>');
    onceClick(btnClose, function () { modal.remove(); });
    header.append(btnClose);
    modal.append(header);
    var body = $('<div>').css({ flex: 1, overflowY: 'auto', padding: '16px 20px 60px' });
    modal.append(body);
    recs.forEach(function (rec) {
        var row = $('<div>').css({ display: 'flex', gap: '14px', padding: '14px', background: '#1c1c22', borderRadius: '10px', marginBottom: '12px', alignItems: 'flex-start' });
        var posterBox = $('<div>').css({ width: '70px', height: '105px', borderRadius: '6px', flexShrink: 0, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6a6a75', fontSize: '10px', textAlign: 'center' }).text('…');
        row.append(posterBox);
        var info = $('<div>').css({ flex: 1, minWidth: 0 });
        info.append($('<div>').css({ color: '#fff', fontSize: '15px', fontWeight: '600' }).text(rec.title || '?'));
        info.append($('<div>').css({ color: '#8a8a95', fontSize: '12px', marginTop: '2px' }).text(rec.year || ''));
        info.append($('<div>').css({ color: '#b0b0b8', fontSize: '13px', marginTop: '8px', lineHeight: '1.4' }).text(rec.reason || ''));
        row.append(info);
        var btnBox = $('<div>').css({ display: 'flex', flexDirection: 'column', gap: '6px' });
        var btnAdd = $('<div class="full-start__button selector" style="padding:8px 12px;"><span style="font-size:12px;">В топ</span></div>');
        onceClick(btnAdd, function () { if (rec._card) onAddToTop(rec._card); else notify('Данные ещё загружаются'); });
        btnBox.append(btnAdd);
        row.append(btnBox);
        body.append(row);
        searchTMDBForRecommendation(rec, function (card) {
            if (card) {
                rec._card = card;
                var src = posterUrl(card.poster_path, 'w200');
                if (src) {
                    var img = $('<img>').attr('src', src).css({ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' });
                    img.on('error', function () { img.remove(); posterBox.text('нет'); });
                    posterBox.empty().append(img);
                } else posterBox.text('нет');
            } else posterBox.text('не найдено');
        });
    });
    $('body').append(modal);
}