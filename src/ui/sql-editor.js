(function () {
  window.createSQLEditor = function (textarea, onChange) {
    const tools = window.SQLTools, panel = document.querySelector('#parameters'), fields = document.querySelector('#parameter-fields');
    const message = document.querySelector('#parameter-message'), popup = document.querySelector('#completions');
    let state = new Map(), signature = '', parsed = tools.analyze(''), catalog = [], proposal = null, active = 0;
    const element = (tag, className, text) => { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; };
    function hide() { proposal = null; popup.hidden = true; textarea.setAttribute('aria-expanded', 'false'); textarea.removeAttribute('aria-activedescendant'); }
    function sync() {
      parsed = tools.analyze(textarea.value);
      panel.hidden = !parsed.names.length && !parsed.error;
      message.textContent = parsed.error || '';
      const nextSignature = parsed.names.join('\u0000');
      if (nextSignature === signature) return;
      signature = nextSignature; fields.replaceChildren();
      const nextState = new Map();
      for (const name of parsed.names.slice(0, 128)) {
        const value = state.get(name) || { type: 'text', text: '', null: false }; nextState.set(name, value);
        const row = element('fieldset', 'parameter-row'); row.dataset.parameter = name;
        const label = element('label', 'parameter-label', parsed.native ? name : ':' + name);
        const input = element('input', 'parameter-input'); input.type = 'text'; input.value = value.text;
        input.id = 'parameter-' + nextState.size; input.setAttribute('aria-label', (parsed.native ? name : ':' + name) + ' değeri'); label.htmlFor = input.id;
        const type = element('select', 'parameter-type'); type.setAttribute('aria-label', name + ' veri türü');
        for (const [key, title] of [['text','Metin'],['number','Sayı'],['date','Tarih'],['timestamp','Tarih/saat'],['boolean','Boolean'],['json','JSON']]) { const option = element('option', '', title); option.value = key; type.append(option); }
        type.value = value.type;
        const updateType = () => { input.type = value.type === 'date' ? 'date' : value.type === 'timestamp' ? 'datetime-local' : 'text'; input.step = 'any'; input.placeholder = value.type === 'boolean' ? 'true / false' : value.type === 'json' ? '{"anahtar":"değer"}' : 'Değer girin'; input.value = value.text; };
        type.onchange = () => { value.type = type.value; updateType(); value.text = input.value; message.textContent = ''; };
        input.oninput = () => { value.text = input.value; message.textContent = ''; };
        const nullLabel = element('label', 'parameter-null'), nullInput = element('input'); nullInput.type = 'checkbox'; nullInput.checked = value.null;
        nullLabel.append(nullInput, document.createTextNode(' NULL'));
        nullInput.onchange = () => { value.null = nullInput.checked; input.disabled = value.null; message.textContent = ''; };
        updateType(); input.disabled = value.null;
        row.append(label, type, input, nullLabel); fields.append(row);
      }
      state = nextState;
    }
    function values() {
      sync(); if (parsed.error) throw new Error(parsed.error);
      const parameters = Object.create(null);
      for (const name of parsed.names) {
        const value = state.get(name);
        try { parameters[name] = tools.parameterValue(value.type, value.text, value.null); }
        catch (error) { message.textContent = name + ': ' + error.message; throw new Error(message.textContent); }
      }
      tools.bind(textarea.value, parameters);
      return parameters;
    }
    function position() {
      const rect = textarea.getBoundingClientRect(), style = getComputedStyle(textarea);
      const before = textarea.value.slice(0, textarea.selectionStart), lines = before.split('\n');
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d'); context.font = style.font;
      const x = rect.left + parseFloat(style.paddingLeft) + context.measureText(lines.at(-1).replaceAll('\t', '  ')).width - textarea.scrollLeft;
      const y = rect.top + parseFloat(style.paddingTop) + lines.length * parseFloat(style.lineHeight) - textarea.scrollTop;
      popup.style.left = Math.max(10, Math.min(x, innerWidth - 370)) + 'px';
      popup.style.top = Math.max(10, Math.min(y, innerHeight - 260)) + 'px';
    }
    function select(index) {
      active = (index + proposal.items.length) % proposal.items.length;
      Array.from(popup.children).forEach((item, i) => { item.classList.toggle('active', i === active); item.setAttribute('aria-selected', String(i === active)); });
      const selected = popup.children[active]; textarea.setAttribute('aria-activedescendant', selected.id); selected.scrollIntoView({ block: 'nearest' });
    }
    function accept(index = active) {
      if (!proposal) return;
      const { start, end } = proposal, insertion = proposal.items[index].insert;
      hide(); textarea.setRangeText(insertion, start, end, 'end'); textarea.focus(); onChange();
      if (insertion.endsWith('.')) suggest(true);
    }
    function suggest(explicit = false) {
      if (textarea.readOnly || textarea.selectionStart !== textarea.selectionEnd) { hide(); return; }
      proposal = tools.completions(textarea.value, textarea.selectionStart, catalog, explicit);
      if (!proposal) { hide(); return; }
      popup.replaceChildren();
      proposal.items.forEach((item, index) => {
        const row = element('div', 'completion-option'); row.id = 'completion-option-' + index; row.setAttribute('role', 'option');
        const name = element('span', 'completion-name', item.label), detail = element('small', '', item.kind + (item.detail ? ' · ' + item.detail : ''));
        row.append(name, detail); row.onmousedown = event => { event.preventDefault(); accept(index); }; popup.append(row);
      });
      active = 0; popup.hidden = false; textarea.setAttribute('aria-expanded', 'true'); position(); select(0);
    }
    textarea.setAttribute('aria-autocomplete', 'list'); textarea.setAttribute('aria-controls', 'completions'); textarea.setAttribute('aria-expanded', 'false');
    textarea.addEventListener('keydown', event => {
      if (event.ctrlKey && event.code === 'Space') { event.preventDefault(); event.stopImmediatePropagation(); suggest(true); return; }
      if (event.ctrlKey || event.altKey || event.metaKey) { hide(); return; }
      if (!proposal) return;
      if (['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === 'Escape') hide(); else if (event.key === 'Enter' || event.key === 'Tab') accept(); else select(active + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) hide();
    });
    textarea.addEventListener('blur', hide); textarea.addEventListener('click', hide); textarea.addEventListener('scroll', hide);
    window.addEventListener('resize', hide);
    return { sync, values, suggest, hide,
      reset: () => { state = new Map(); signature = ''; fields.replaceChildren(); hide(); },
      setCatalog: tables => { catalog = tables; },
      disable: disabled => { for (const fieldset of fields.children) fieldset.disabled = disabled; if (disabled) hide(); }
    };
  };
})();
