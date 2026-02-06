import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import './Manager.css';
import { useError } from '../context/ErrorContext';
import moment from 'moment-timezone';
import { WebSocketContext } from '../context/WebSocketProvider';
import ConfirmDialog from '../components/ConfirmDialog';

// ——— Compact multi-select dropdown (no libs)
const MultiSelectDropdown = ({
  label,
  options = [],
  value = [],
  onChange,
  placeholder = 'Оберіть',
  required = false,
  disabled = false,
}) => {
  const ref = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [dir, setDir] = React.useState('down'); // 'down' | 'up'

  const isArray = Array.isArray;
  const selected = isArray(value) ? value : [];
  const map = new Map(options.map(o => [o.id, o.label]));

  const toggle = () => {
    if (disabled) return;
    setOpen(o => !o);
  };
  const close = () => setOpen(false);

  React.useEffect(() => {
    const onDoc = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Коли відкриваємо — визначаємо, є місце вниз чи краще вгору
  React.useEffect(() => {
    if (!open || !ref.current) return;
    const btn = ref.current.querySelector('.msd-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const panelTarget = 360; // бажана висота (максимум) у px
    setDir(spaceBelow < panelTarget + 24 ? 'up' : 'down');
  }, [open]);

  const handleToggleOption = (id) => {
    if (disabled) return;
    const set = new Set(selected);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange(Array.from(set));
  };

  const handleClear = (e) => {
    if (disabled) return;
    e.stopPropagation();
    onChange([]);
  };

  const chips = selected.slice(0, 2).map(id => map.get(id)).filter(Boolean);
  const more = Math.max(selected.length - chips.length, 0);


  return (
    <div className="msd" ref={ref}>
      {label && (
        <div className="msd-label">
          {label}{required && <span className="req">*</span>}
        </div>
      )}
      <button
        type="button"
        className="msd-btn"
        onClick={toggle}
        aria-expanded={open}
        disabled={disabled}
      >
        {selected.length === 0 ? (
          <span className="msd-ph">{placeholder}</span>
        ) : (
          <span className="msd-chips">
            {chips.map((t, i) => <span key={i} className="msd-chip">{t}</span>)}
            {more > 0 && <span className="msd-more">+{more}</span>}
          </span>
        )}
        <span className={`msd-caret ${open ? 'up' : ''}`}>▾</span>
      </button>

      {open && !disabled && (
        <div className={`msd-panel ${dir}`} role="listbox" aria-multiselectable="true">
          <div className="msd-actions">
            <button type="button" className="msd-link" onClick={handleClear}>Очистити</button>
          </div>
          <div className="msd-list">
            {options.length === 0 ? (
              <div className="msd-empty">Список порожній</div>
            ) : options.map(opt => (
              <label key={opt.id} className="msd-option">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.id)}
                  onChange={() => handleToggleOption(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


const API_URL = import.meta.env.VITE_API_URL;
const MAX_META_TABS = 5;
const createEmptyMeta = () => ({
  personal_account: '',
  extra_actions: [],
  extra_other_text: '',
  application_yesno: false,
  application_types: [],
  manager_comment: '',
  service_zone: true,
  tab_status: 'waiting',
});
const createMetaTab = ({ isNew = false, slot = 1 } = {}) => (
  isNew
    ? { ...createEmptyMeta(), tab_slot: slot, __is_new: true }
    : { ...createEmptyMeta(), tab_slot: slot }
);

const Manager = () => {
  const { showError } = useError();
  const [employee, setEmployee] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('employee'));
    } catch {
      return null;
    }
  });   
  const [showWarning, setShowWarning] = useState(false);
  const appointmentsRef = useRef([]);
  const todayAppointmentsRef = useRef([]);

  const [appointments, setAppointments] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const normalizeStatus = (value) => {
    const key = String(value || '').toLowerCase();
    return key === 'live_queue' ? 'waiting' : key;
  };
  const getBaseTabStatus = (value) => {
    const status = normalizeStatus(value);
    return status === 'in_progress' || status === 'completed' ? status : 'waiting';
  };
  const isLiveQueueRecord = (item) =>
    item?.queue_type === 'live' || String(item?.status || '').toLowerCase() === 'live_queue';
  const isClosedStatus = (value) => {
    const key = normalizeStatus(value);
    return (
      key === 'completed' ||
      key === 'missed' ||
      key === 'did_not_appear' ||
      key === 'alarm_missed'
    );
  };
  const currentClient = appointments.find(app => normalizeStatus(app.status) === 'in_progress');
  const hasActiveClient = Boolean(currentClient);
  const [now, setNow] = useState(moment.tz('Europe/Kyiv'));
  const [serviceDuration, setServiceDuration] = useState(20);
  const todayStr = moment().tz('Europe/Kyiv').format('YYYY-MM-DD');
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [attentionPrompt, setAttentionPrompt] = useState(null);
  const statusLabel = {
    waiting: 'Очікує',
    in_progress: 'В обслуговуванні',
    completed: 'Завершено',
    missed: 'Пропущено',
    alarm_missed: 'Пропущено (тривога)',
    did_not_appear: 'Не з\'явився',
  };
  const formatStatusLabel = (item) => {
    const statusKey = normalizeStatus(item?.status);
    const base = statusLabel[statusKey] || item?.status || '';
    return isLiveQueueRecord(item) ? `${base} (жива черга)` : base;
  };


  // === META STATE (multi-selects + boolean) ===
  const [metaTabs, setMetaTabs] = useState(() => [createMetaTab({ slot: 1 })]);
  const [activeMetaIndex, setActiveMetaIndex] = useState(0);
  const [tabStatuses, setTabStatuses] = useState(['waiting']);
  const [pendingAddTabId, setPendingAddTabId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [options, setOptions] = useState({
    extra_actions: [],        // {id,label}
    application_types: [],    // {id,label}
  });
  const activeMeta = metaTabs[activeMetaIndex] || createMetaTab({ slot: 1 });
  const activeTabStatus = tabStatuses[activeMetaIndex] || 'waiting';
  const activeTabSlot = activeMeta?.tab_slot || activeMetaIndex + 1;
  const isSelectedClosed = selectedTicket ? isClosedStatus(selectedTicket.status) : false;
  const isTabReadOnly = (index) => {
    const tab = metaTabs[index];
    if (!tab) return false;
    const status = normalizeStatus(tab?.tab_status);
    if (status === 'completed' || status === 'canceled') return true;
    if (status === 'waiting' || status === 'in_progress') return false;
    return isSelectedClosed && !tab.__is_new;
  };
  const isActiveTabReadOnly = isTabReadOnly(activeMetaIndex);
  const computeVisibleTabIndexes = (tabs, statuses) => {
    const baseIndexes = (Array.isArray(tabs) ? tabs : []).map((_, idx) => idx);
    const nonCanceledCount = baseIndexes.filter((idx) => statuses?.[idx] !== 'canceled').length;
    const hasNewTab = (Array.isArray(tabs) ? tabs : []).some((tab) => tab?.__is_new);
    const showCompletedTabs = nonCanceledCount > 1 || hasNewTab;
    const filtered = baseIndexes.filter((idx) => {
      const status = statuses?.[idx];
      if (status === 'canceled') return false;
      if (showCompletedTabs) return true;
      if (idx === 0 && isSelectedClosed) return true;
      return status !== 'completed';
    });
    if (filtered.length === 0 && baseIndexes.length > 0) return [0];
    return filtered;
  };

  const visibleTabIndexes = computeVisibleTabIndexes(metaTabs, tabStatuses);

  const openConfirm = (config) => {
    setConfirmDialog(config);
  };

  const closeConfirm = () => {
    setConfirmDialog(null);
  };

  const isTodaySelected = selectedDate === todayStr;
  const [metaSaving, setMetaSaving] = useState(false);
  const saveTimer = useRef(null);

  const socket = useContext(WebSocketContext);
  const canNotifyRef = useRef(false);
  const lastNotifyRef = useRef({ next: null, long: {} });
  const lastAlertRef = useRef({});
  const titleBlinkRef = useRef(null);
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : '');
  const swRegRef = useRef(null);

  const fetchAppointments = async () => {
    if (!employee?.window_number) return;
    try {
      const params = new URLSearchParams({
        window: employee.window_number,
        date: selectedDate,
      });
      const res = await fetch(`${API_URL}/appointments/today?${params.toString()}`);
      const data = await res.json();
      if (!Array.isArray(data)) {
        showError('Помилка отримання черги');
        return;
      }
      setAppointments(data);
      if (selectedDate === todayStr) {
        todayAppointmentsRef.current = data;
      }
    } catch (err) {
      console.error(err);
      showError('Помилка сервера');
    }
  };

  const fetchTodayAppointments = async () => {
    if (!employee?.window_number) return;
    try {
      const params = new URLSearchParams({
        window: employee.window_number,
        date: todayStr,
      });
      const res = await fetch(`${API_URL}/appointments/today?${params.toString()}`);
      const data = await res.json();
      if (!Array.isArray(data)) return;
      todayAppointmentsRef.current = data;
      if (selectedDate === todayStr) {
        setAppointments(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- helpers ---
  const parseArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      try {
        const t = v.trim();
        return t.startsWith('[') ? JSON.parse(t) : (t ? [t] : []);
      } catch {
        return [];
      }
    }
    return [];
  };

  const normalizeMetaTab = (tab = {}) => {
    const extraActions = parseArray(tab.extra_actions);
    const applicationYesNo =
      tab.application_yesno === null || tab.application_yesno === undefined
        ? false
        : !!tab.application_yesno;
    const tabStatus = normalizeStatus(tab.tab_status);
    const rawSlot = Number(tab.tab_slot);
    const tabSlot = Number.isFinite(rawSlot) && rawSlot > 0 ? rawSlot : null;

    return {
      personal_account: tab.personal_account || '',
      extra_actions: extraActions,
      extra_other_text: tab.extra_other_text || '',
      application_yesno: applicationYesNo,
      application_types: applicationYesNo ? parseArray(tab.application_types) : [],
      manager_comment: tab.manager_comment || '',
      service_zone:
        tab.service_zone === null || tab.service_zone === undefined
          ? true
          : !!tab.service_zone,
      tab_status:
        tabStatus === 'in_progress' || tabStatus === 'completed' || tabStatus === 'canceled'
          ? tabStatus
          : 'waiting',
      tab_slot: tabSlot,
    };
  };

  const parseMetaTabs = (raw) => {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const mergeTabsBySlot = (baseTabs, extraTabs) => {
    const map = new Map();
    const usedSlots = new Set();
    const signatures = new Set();
    const normalizeSigArray = (arr) =>
      (Array.isArray(arr) ? arr : [])
        .map((v) => String(v))
        .sort()
        .join('|');
    const tabSignature = (tab) => {
      if (!tab) return '';
      return [
        String(tab.personal_account || '').trim(),
        normalizeSigArray(tab.extra_actions),
        String(tab.extra_other_text || '').trim(),
        tab.application_yesno ? '1' : '0',
        normalizeSigArray(tab.application_types),
        String(tab.manager_comment || '').trim(),
        tab.service_zone === false ? '0' : '1',
        normalizeStatus(tab.tab_status),
      ].join('::');
    };
    const getNextFreeSlot = () => {
      for (let slot = 1; slot <= MAX_META_TABS; slot += 1) {
        if (!usedSlots.has(slot)) return slot;
      }
      return null;
    };
    const addTab = (tab, slot) => {
      if (!Number.isFinite(slot) || slot <= 0) return;
      const sig = tabSignature(tab);
      if (sig && signatures.has(sig)) return;
      map.set(slot, { ...tab, tab_slot: slot });
      usedSlots.add(slot);
      if (sig) signatures.add(sig);
    };

    (Array.isArray(baseTabs) ? baseTabs : []).forEach((tab) => {
      if (!tab) return;
      const rawSlot = Number(tab.tab_slot);
      const slot = Number.isFinite(rawSlot) && rawSlot > 0 && !usedSlots.has(rawSlot)
        ? rawSlot
        : getNextFreeSlot();
      if (slot) addTab(tab, slot);
    });

    (Array.isArray(extraTabs) ? extraTabs : []).forEach((tab) => {
      if (!tab) return;
      const sig = tabSignature(tab);
      if (sig && signatures.has(sig)) return;
      const rawSlot = Number(tab.tab_slot);
      let slot = Number.isFinite(rawSlot) && rawSlot > 0 && !usedSlots.has(rawSlot)
        ? rawSlot
        : null;
      if (!slot) slot = getNextFreeSlot();
      if (!slot) return;
      if (!map.has(slot)) addTab(tab, slot);
    });

    return Array.from(map.values()).sort((a, b) => (a.tab_slot || 0) - (b.tab_slot || 0));
  };

  const mergeAppointmentsByTicket = (list) => {
    const grouped = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const key = item.ticket_number || item.id;
      const parsedTabs = parseMetaTabs(item.meta_tabs) || [normalizeMetaTab(item)];
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { ...item, meta_tabs: parsedTabs });
        return;
      }
      const existingClosed = isClosedStatus(existing.status);
      const itemClosed = isClosedStatus(item.status);
      const pickBase =
        existingClosed === itemClosed
          ? (Number(existing.id) || 0) <= (Number(item.id) || 0)
            ? existing
            : item
          : existingClosed
            ? item
            : existing;
      const mergedTabs = pickBase === existing
        ? mergeTabsBySlot(existing.meta_tabs, parsedTabs)
        : mergeTabsBySlot(parsedTabs, existing.meta_tabs);
      const hasDidNotAppear =
        normalizeStatus(existing.status) === 'did_not_appear' ||
        normalizeStatus(item.status) === 'did_not_appear';
      const hasMissed =
        normalizeStatus(existing.status) === 'missed' ||
        normalizeStatus(item.status) === 'missed';
      const hasAlarmMissed =
        normalizeStatus(existing.status) === 'alarm_missed' ||
        normalizeStatus(item.status) === 'alarm_missed';
      grouped.set(key, {
        ...pickBase,
        status: hasDidNotAppear
          ? 'did_not_appear'
          : hasMissed
            ? 'missed'
            : hasAlarmMissed
              ? 'alarm_missed'
              : pickBase.status,
        meta_tabs: mergedTabs,
      });
    });
    return Array.from(grouped.values());
  };

  const hasOpenTab = (app) => {
    const tabs = parseMetaTabs(app?.meta_tabs);
    if (!Array.isArray(tabs)) return false;
    const closedTicket = isClosedStatus(app?.status);
    return tabs.some((tab) => {
      const status = normalizeStatus(tab?.tab_status);
      if (status === 'in_progress') return true;
      if (status === 'waiting') return !closedTicket;
      return false;
    });
  };

  const normalizeMetaTabs = (tabs) => {
    const raw = Array.isArray(tabs) ? tabs : [];
    const normalized = raw.map((tab, idx) => {
      const normalizedTab = normalizeMetaTab(tab);
      return {
        ...normalizedTab,
        tab_slot: normalizedTab.tab_slot || idx + 1,
      };
    }).slice(0, MAX_META_TABS);
    return normalized.length ? normalized : [createMetaTab({ slot: 1 })];
  };

  const buildMetaPayload = (tabs) => {
    const cleanTabs = (Array.isArray(tabs) ? tabs : []).map((tab) => {
      if (!tab) return tab;
      const { __is_new, ...rest } = tab;
      return rest;
    });
    const normalizedTabs = normalizeMetaTabs(cleanTabs);
    const primary = normalizedTabs[0] || createMetaTab({ slot: 1 });
    return { ...primary, meta_tabs: normalizedTabs };
  };
  
  const validateMetaLocal = (m) => {
    const errs = [];
    const isArray = Array.isArray;
    const requireAccount = m.service_zone !== false;

    if (requireAccount && !m.personal_account?.trim()) {
      errs.push('Абонентський номер споживача не вказано.');
    }
    if (isArray(m.extra_actions) &&
        m.extra_actions.includes('EX_OTHER_FREE_TEXT') &&
        !m.extra_other_text?.trim()) {
      errs.push('Опишіть "Інше" у текстовому полі.');
    }
    const applicationYesNo =
      m.application_yesno === null || m.application_yesno === undefined
        ? false
        : m.application_yesno;
    if (applicationYesNo === true && (!isArray(m.application_types) || m.application_types.length === 0)) {
      errs.push('Оберіть тип(и) заяви.');
    }
    return errs;
  };

  const pruneEmptyTabs = (tabs) =>
    (Array.isArray(tabs) ? tabs : []).filter(Boolean);

  const filterTabsForPersist = (tabs, statuses) =>
    (Array.isArray(tabs) ? tabs : []).filter((tab, idx) => {
      if (!tab) return false;
      const status = normalizeStatus(tab?.tab_status || statuses?.[idx]);
      if (tab?.__is_new && status === 'waiting') return false;
      return true;
    });

  const getNextTabSlot = (tabs) => {
    const items = Array.isArray(tabs) ? tabs : [];
    const canceledIndex = items.findIndex((tab) => tab?.tab_status === 'canceled');
    if (canceledIndex !== -1) {
      const slot = Number(items[canceledIndex]?.tab_slot) || canceledIndex + 1;
      return { slot, replaceIndex: canceledIndex };
    }
    const usedSlots = new Set(
      items
        .map((tab) => Number(tab?.tab_slot))
        .filter((slot) => Number.isFinite(slot) && slot > 0)
    );
    for (let slot = 1; slot <= MAX_META_TABS; slot += 1) {
      if (!usedSlots.has(slot)) return { slot, replaceIndex: -1 };
    }
    return { slot: MAX_META_TABS + 1, replaceIndex: -1 };
  };

  const saveMeta = async (id, nextTabs) => {
    if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        setMetaSaving(true);
        const payload = buildMetaPayload(nextTabs);
        const res = await fetch(`${API_URL}/appointments/${id}/meta`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || (err.errors ? err.errors.join(', ') : 'Помилка збереження'));
        }
      } catch (e) {
        showError(String(e.message || e));
      } finally {
        setMetaSaving(false);
      }
    }, 400);
  };

  const activeTabErrors = validateMetaLocal(activeMeta);
  const isFinishDisabled = metaSaving;

  const syncMetaTabs = (nextTabs, nextStatuses = tabStatuses) => {
    if (!selectedTicket?.id) return;
    const tabsForSave = filterTabsForPersist(pruneEmptyTabs(nextTabs), nextStatuses);
    const payload = buildMetaPayload(tabsForSave);
    // 1) Update selected ticket (modal)
    setSelectedTicket(prev =>
      prev && prev.id === selectedTicket.id
        ? { ...prev, ...payload }
        : prev
    );
    // 2) Update ticket in list
    setAppointments(prev =>
      prev.map(app =>
        app.id === selectedTicket.id
          ? { ...app, ...payload }
          : app
      )
    );
    // 3) Persist meta to server
    saveMeta(selectedTicket.id, tabsForSave);
  };

  const onMetaChange = (patch) => {
    if (isActiveTabReadOnly) return;
    const nextTabs = metaTabs.map((tab, idx) =>
      idx === activeMetaIndex ? { ...tab, ...patch } : tab
    );
    setMetaTabs(nextTabs);
    syncMetaTabs(nextTabs);
  };
  const addMetaTab = ({ persist = false } = {}) => {
    const { slot, replaceIndex } = getNextTabSlot(metaTabs);
    const nextTab = createMetaTab({ isNew: isSelectedClosed, slot });
    const nextTabs = replaceIndex === -1
      ? [...metaTabs, nextTab]
      : metaTabs.map((tab, idx) => (idx === replaceIndex ? nextTab : tab));
    const nextStatuses = replaceIndex === -1
      ? [...tabStatuses, 'waiting']
      : tabStatuses.map((status, idx) => (idx === replaceIndex ? 'waiting' : status));
    setMetaTabs(nextTabs);
    setTabStatuses(nextStatuses);
    setActiveMetaIndex(replaceIndex === -1 ? nextTabs.length - 1 : replaceIndex);
    if (persist) syncMetaTabs(nextTabs, nextStatuses);
  };

  const handleAddMetaTab = ({ persist = false, skipConfirm = false } = {}) => {
    if (selectedTicket) {
      const statusKey = normalizeStatus(selectedTicket.status);
      if (isClosedStatus(selectedTicket.status) && statusKey !== 'completed') {
        showError('Для цього статусу талону додавання вкладок недоступне.');
        return;
      }
    }
    const { slot } = getNextTabSlot(metaTabs);
    if (slot > MAX_META_TABS) return;
    if (skipConfirm) {
      addMetaTab({ persist });
      return;
    }
    openConfirm({
      title: 'Додати вкладку?',
      description: 'Буде створено додатковий рахунок у цьому талоні.',
      confirmLabel: 'Додати',
      cancelLabel: 'Скасувати',
      onConfirm: () => addMetaTab({ persist }),
    });
  };

  const getTabCountForTicket = (ticket) => {
    const parsed = parseMetaTabs(ticket?.meta_tabs);
    if (!parsed || !parsed.length) return 1;
    const activeCount = parsed.filter((tab) => normalizeStatus(tab?.tab_status) !== 'canceled').length;
    return Math.max(activeCount, 1);
  };

  const handleAddTabForTicket = (ticket) => {
    if (!ticket) return;
    const statusKey = normalizeStatus(ticket.status);
    if (isClosedStatus(ticket.status) && statusKey !== 'completed') {
      showError('Для цього статусу талону додавання вкладок недоступне.');
      return;
    }
    const parsed = parseMetaTabs(ticket?.meta_tabs) || [normalizeMetaTab(ticket)];
    const { slot } = getNextTabSlot(parsed);
    if (slot > MAX_META_TABS) return;
    const ticketNumber = ticket.ticket_number || ticket.id;
    openConfirm({
      title: 'Додати вкладку до талону?',
      description: `Талон №${ticketNumber}. Буде створено додатковий рахунок.`,
      confirmLabel: 'Додати',
      cancelLabel: 'Скасувати',
      onConfirm: () => {
        if (selectedTicket?.id === ticket.id) {
          handleAddMetaTab({ persist: false, skipConfirm: true });
          return;
        }
        setPendingAddTabId(ticket.id);
        setSelectedTicket(ticket);
      },
    });
  };

  const handleRemoveMetaTab = (index) => {
    if (metaTabs.length <= 1) return;
    if (metaTabs[index]?.tab_slot === 1) return;

    const slotLabel = metaTabs[index]?.tab_slot || index + 1;
    openConfirm({
      title: `Видалити вкладку ${slotLabel}?`,
      description: 'Дані цієї вкладки буде втрачено.',
      confirmLabel: 'Видалити',
      cancelLabel: 'Скасувати',
      onConfirm: () => removeMetaTabByIndex(index),
    });
  };

  const removeMetaTabByIndex = (index) => {
    const nextTabs = metaTabs.filter((_, idx) => idx !== index);
    const nextStatuses = tabStatuses.filter((_, idx) => idx !== index);
    let nextIndex = activeMetaIndex;
    if (index === activeMetaIndex) {
      nextIndex = Math.max(0, index - 1);
    } else if (index < activeMetaIndex) {
      nextIndex = activeMetaIndex - 1;
    }
    setMetaTabs(nextTabs);
    setTabStatuses(nextStatuses.length ? nextStatuses : ['waiting']);
    setActiveMetaIndex(nextIndex);
    syncMetaTabs(nextTabs, nextStatuses);

    const statusKey = normalizeStatus(selectedTicket?.status);
    const closedByStatus = selectedTicket && isClosedStatus(selectedTicket.status) && statusKey !== 'completed';
    const baseCompleted = normalizeStatus(nextTabs[0]?.tab_status) === 'completed';
    const allClosed = nextTabs.every((tab) => {
      const status = normalizeStatus(tab?.tab_status);
      return status === 'completed' || status === 'canceled';
    });
    const shouldComplete = !closedByStatus && baseCompleted && allClosed;
    const shouldClose = closedByStatus || !hasActionableTabs(nextTabs);
    if (shouldClose) {
      const payloadForState = buildMetaPayload(nextTabs);
      setAppointments(prev =>
        prev.map(item =>
          item.id === selectedTicket.id
            ? {
              ...item,
              ...payloadForState,
              status: shouldComplete ? 'completed' : selectedTicket.status,
            }
            : item
        )
      );
      setShowWarning(false);
      setSelectedTicket(null);
    }
  };

  const handleCancelMetaTab = (index) => {
    if (metaTabs.length <= 1) return;
    if (metaTabs[index]?.tab_slot === 1) return;
    const slotLabel = metaTabs[index]?.tab_slot || index + 1;
    openConfirm({
      title: `Відмінити вкладку ${slotLabel}?`,
      description: 'Вкладку буде скасовано і приховано, дані не збережуться.',
      confirmLabel: 'Відмінити',
      cancelLabel: 'Назад',
      onConfirm: () => {
        const baseSlot = metaTabs[index]?.tab_slot || index + 1;
        const canceledTab = {
          ...createMetaTab({ slot: baseSlot }),
          tab_status: 'canceled',
        };
        const nextTabs = metaTabs.map((tab, idx) =>
          idx === index ? { ...canceledTab, __is_new: tab?.__is_new } : tab
        );
        const nextStatuses = tabStatuses.map((status, idx) =>
          idx === index ? 'canceled' : status
        );
        const statusKey = normalizeStatus(selectedTicket?.status);
        const closedByStatus = selectedTicket && isClosedStatus(selectedTicket.status) && statusKey !== 'completed';
        const baseCompleted = normalizeStatus(nextTabs[0]?.tab_status) === 'completed';
        const allClosed = nextTabs.every((tab) => {
          const status = normalizeStatus(tab?.tab_status);
          return status === 'completed' || status === 'canceled';
        });
        const shouldComplete = !closedByStatus && baseCompleted && allClosed;
        const shouldClose = closedByStatus || !hasActionableTabs(nextTabs);
        const nextVisibleIndexes = computeVisibleTabIndexes(nextTabs, nextStatuses);
        setMetaTabs(nextTabs);
        setTabStatuses(nextStatuses);
        setActiveMetaIndex(nextVisibleIndexes[0] ?? 0);
        syncMetaTabs(nextTabs, nextStatuses);

        if (shouldClose) {
          const payloadForState = buildMetaPayload(nextTabs);
          setAppointments(prev =>
            prev.map(item =>
              item.id === selectedTicket.id
                ? {
                  ...item,
                  ...payloadForState,
                  status: shouldComplete ? 'completed' : selectedTicket.status,
                }
                : item
            )
          );
          setShowWarning(false);
          setSelectedTicket(null);
        }
      },
    });
  };

  const isTabDirty = (tab) => {
    const hasAccount = String(tab.personal_account || '').trim() !== '';
    const hasExtraActions = Array.isArray(tab.extra_actions) && tab.extra_actions.length > 0;
    const hasOtherText = String(tab.extra_other_text || '').trim() !== '';
    const hasAppTypes = Array.isArray(tab.application_types) && tab.application_types.length > 0;
    const hasComment = String(tab.manager_comment || '').trim() !== '';
    const serviceZoneChanged = tab.service_zone === false;
    const applicationFlag = tab.application_yesno === true;

    return (
      hasAccount ||
      hasExtraActions ||
      hasOtherText ||
      hasAppTypes ||
      hasComment ||
      serviceZoneChanged ||
      applicationFlag
    );
  };

  const hasActionableTabs = (tabs) =>
    (Array.isArray(tabs) ? tabs : []).some((tab) => {
      const status = normalizeStatus(tab?.tab_status);
      return status === 'waiting' || status === 'in_progress';
    });

  const closeModal = ({ dropNewTabs = [] } = {}) => {
    if (!selectedTicket) return;
    let nextTabs = metaTabs;
    let nextStatuses = tabStatuses;
    const dropNewSet = new Set(dropNewTabs);
    if (dropNewSet.size) {
      nextTabs = nextTabs.filter((_, idx) => !dropNewSet.has(idx));
      nextStatuses = nextStatuses.filter((_, idx) => !dropNewSet.has(idx));
    }
    const prunedTabs = pruneEmptyTabs(nextTabs);
    if (dropNewSet.size || prunedTabs.length !== nextTabs.length) {
      const payload = buildMetaPayload(prunedTabs);
      setSelectedTicket(prev =>
        prev && prev.id === selectedTicket.id
          ? { ...prev, ...payload }
          : prev
      );
      setAppointments(prev =>
        prev.map(app =>
          app.id === selectedTicket.id
            ? { ...app, ...payload }
            : app
        )
      );
      saveMeta(selectedTicket.id, prunedTabs);
    }

    setSelectedTicket(null);
  };

  const attemptCloseModal = () => {
    if (!selectedTicket) return;
    const pendingNew = metaTabs
      .map((tab, idx) => {
        const status = normalizeStatus(tab?.tab_status);
        if (tab?.__is_new && status === 'waiting') return idx;
        return -1;
      })
      .filter((idx) => idx !== -1);
    if (pendingNew.length) {
      openConfirm({
        title: 'Закрити модалку?',
        description: 'Незапущені нові вкладки буде видалено. Продовжити?',
        confirmLabel: 'Закрити',
        cancelLabel: 'Повернутись',
        onConfirm: () => closeModal({ dropNewTabs: pendingNew }),
      });
      return;
    }
    closeModal();
  };



  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  // Ask for Web Notification permission once.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      canNotifyRef.current = true;
      return;
    }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        canNotifyRef.current = perm === 'granted';
      }).catch(() => {});
    }
  }, []);

  // Try register service worker for more reliable notifications (works on https/localhost).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/manager-notify-sw.js').then((reg) => {
      swRegRef.current = reg;
    }).catch(() => {});
  }, []);

  const fireNotification = (title, body, tag) => {
    if (!canNotifyRef.current || typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      // Prefer service worker to force OS toast even если вкладка не активна.
      if (swRegRef.current && swRegRef.current.showNotification) {
        swRegRef.current.showNotification(title, { body, tag, renotify: true });
      } else {
        new Notification(title, { body, tag, renotify: true });
      }
    } catch (e) {
      // Ignore Notification errors (permissions or platform issues).
    }
  };

  const stopTitleBlink = () => {
    if (titleBlinkRef.current) {
      clearInterval(titleBlinkRef.current);
      titleBlinkRef.current = null;
    }
    if (typeof document !== 'undefined' && originalTitleRef.current) {
      document.title = originalTitleRef.current;
    }
  };

  const startTitleBlink = (message) => {
    if (typeof document === 'undefined') return;
    originalTitleRef.current = document.title || 'Черга';
    stopTitleBlink();
    let toggle = false;
    titleBlinkRef.current = setInterval(() => {
      toggle = !toggle;
      document.title = toggle ? message : originalTitleRef.current;
    }, 1200);
    setTimeout(stopTitleBlink, 12000);
  };

  const acknowledgePrompt = () => {
    setAttentionPrompt(null);
    stopTitleBlink();
  };

  const playBeep = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      // Audio init might fail if user blocked; ignore.
    }
  };

  const notifyAttention = (title, body, tag) => {
    fireNotification(title, body, tag);
    startTitleBlink(title);
    playBeep();
    const now = Date.now();
    const last = lastAlertRef.current[tag] || 0;
    const ALERT_REPEAT_MS = 120000; // не чаще раза в 2 минуты на тот же тег
    if (now - last > ALERT_REPEAT_MS) {
      lastAlertRef.current[tag] = now;
      setAttentionPrompt({ title, body, tag });
    }
  };

  useEffect(() => {
    const fetchServiceDuration = async () => {
      try {
        const res = await fetch(`${API_URL}/settings/service_duration`);
        const data = await res.json();
        if (data?.value) {
          setServiceDuration(Number(data.value));
        }
      } catch {
        console.warn('⚠ Не вдалося отримати service_duration');
      }
    };
  
    fetchServiceDuration();
  }, []);

  // завантаження довідників
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const res = await fetch(`${API_URL}/settings/options`);
        const data = await res.json();
        setOptions({
          extra_actions: Array.isArray(data.extra_actions) ? data.extra_actions : [],
          application_types: Array.isArray(data.application_types) ? data.application_types : [],
        });
      } catch (e) {
        showError('Не вдалося отримати довідники опцій');
      }
    };
    loadOptions();
  }, []);

  // ІНІЦІАЛІЗАЦІЯ META за вибраним талоном
  useEffect(() => {
    if (!selectedTicket) {
      setMetaTabs([createMetaTab({ slot: 1 })]);
      setTabStatuses(['waiting']);
      setActiveMetaIndex(0);
      setPendingAddTabId(null);
      return;
    }

    const parsedTabs = parseMetaTabs(selectedTicket.meta_tabs);
    let nextTabs = parsedTabs && parsedTabs.length
      ? normalizeMetaTabs(parsedTabs)
      : [normalizeMetaTab(selectedTicket)];

    const baseStatus = getBaseTabStatus(selectedTicket.status);
    let nextStatuses = nextTabs.map((tab, idx) => {
      if (tab?.tab_status) {
        const status = normalizeStatus(tab.tab_status);
        return status === 'in_progress' || status === 'completed' || status === 'canceled'
          ? status
          : 'waiting';
      }
      return idx === 0 ? baseStatus : 'waiting';
    });
    nextTabs = nextTabs.map((tab, idx) => ({
      ...tab,
      tab_slot: tab?.tab_slot || idx + 1,
    }));
    nextTabs = nextTabs.map((tab, idx) => {
      if (idx === 0) {
        const status = normalizeStatus(tab?.tab_status);
        const shouldSet = status !== 'in_progress' && status !== 'completed';
        if (shouldSet) return { ...tab, tab_status: baseStatus };
      }
      return tab;
    });
    const shouldAddTab = pendingAddTabId && pendingAddTabId === selectedTicket.id;

    let nextActiveIndex = 0;
    if (shouldAddTab && nextTabs.length < MAX_META_TABS) {
      const { slot, replaceIndex } = getNextTabSlot(nextTabs);
      const newTab = createMetaTab({ isNew: isClosedStatus(selectedTicket.status), slot });
      if (replaceIndex === -1) {
        nextTabs = [...nextTabs, newTab];
        nextStatuses = [...nextStatuses, 'waiting'];
        nextActiveIndex = nextTabs.length - 1;
      } else {
        nextTabs = nextTabs.map((tab, idx) => (idx === replaceIndex ? newTab : tab));
        nextStatuses = nextStatuses.map((status, idx) => (idx === replaceIndex ? 'waiting' : status));
        nextActiveIndex = replaceIndex;
      }
    } else {
      const secondaryIndex = nextTabs.findIndex((tab, idx) => {
        const slot = tab?.tab_slot || idx + 1;
        return slot > 1 && nextStatuses[idx] !== 'completed' && nextStatuses[idx] !== 'canceled';
      });
      nextActiveIndex = secondaryIndex !== -1 ? secondaryIndex : 0;
    }

    setMetaTabs(nextTabs);
    setTabStatuses(nextStatuses);
    setActiveMetaIndex(nextActiveIndex);
    if (shouldAddTab) setPendingAddTabId(null);
  }, [selectedTicket?.id]);

  useEffect(() => {
    if (!employee) return;
    fetchAppointments();
    const interval = setInterval(fetchAppointments, 30000);
    return () => clearInterval(interval);
  }, [employee, selectedDate]);

  // Окремо тримаємо "сьогодні" для нагадувань, навіть якщо переглядаємо інший день.
  useEffect(() => {
    if (!employee) return;
    fetchTodayAppointments();
    const interval = setInterval(fetchTodayAppointments, 30000);
    return () => clearInterval(interval);
  }, [employee]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'queue_updated') {
        fetchAppointments();
        fetchTodayAppointments();
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, selectedDate, employee]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();

      const overdue = todayAppointmentsRef.current.filter(entry => {
        const isWaiting = normalizeStatus(entry.status) === 'waiting';
        const noStart = !entry.start_time || entry.start_time === 'null' || entry.start_time === '';
        const timePassed = new Date(entry.appointment_time).getTime() + 60000 < now.getTime();

        return isWaiting && noStart && timePassed;
      });

      if (overdue.length > 0) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Reminder: notify when есть ожидающий и нет активного.
  useEffect(() => {
    const CHECK_MS = 20000;
    const REPEAT_MS = 120000;

    const tick = () => {
      const list = todayAppointmentsRef.current || [];
      const inProgress = list.find((entry) => normalizeStatus(entry.status) === 'in_progress');
      if (inProgress) return;

      const waiting = list
        .filter((entry) => normalizeStatus(entry.status) === 'waiting')
        .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));

      if (!waiting.length) return;

      const next = waiting[0];
      const ticket = next.ticket_number || next.id;
      const now = Date.now();
      const prev = lastNotifyRef.current.next;
      const tag = `next-${ticket}`;

      if (prev && prev.tag === tag && now - prev.at < REPEAT_MS) return;

      notifyAttention('Чекає клієнт', `Почніть талон №${ticket}`, tag);
      lastNotifyRef.current.next = { tag, at: now };
    };

    const id = setInterval(tick, CHECK_MS);
    return () => clearInterval(id);
  }, []);

  // Reminder: notify when in_progress слишком долго.
  useEffect(() => {
    const CHECK_MS = 20000;
    const REPEAT_MS = 180000;
    const GRACE_MIN = 5;

    const tick = () => {
      const list = todayAppointmentsRef.current || [];
      const current = list.find((entry) => normalizeStatus(entry.status) === 'in_progress');
      if (!current || !current.start_time) return;

      const started = moment(current.start_time);
      if (!started.isValid()) return;

      const elapsedMin = moment().diff(started, 'minutes');
      const threshold = Number(serviceDuration || 0) + GRACE_MIN;

      if (elapsedMin < threshold) return;

      const ticket = current.ticket_number || current.id;
      const tag = `long-${ticket}`;
      const now = Date.now();
      const last = (lastNotifyRef.current.long || {})[tag] || 0;

      if (now - last < REPEAT_MS) return;

      notifyAttention('Завершіть клієнта', `Талон №${ticket} в роботі ${elapsedMin} хв.`, tag);
      lastNotifyRef.current.long = { ...(lastNotifyRef.current.long || {}), [tag]: now };
    };

    const id = setInterval(tick, CHECK_MS);
    return () => clearInterval(id);
  }, [serviceDuration, isTodaySelected]);

  useEffect(() => {
    const checkAndSkip = () => {
      const now = moment.tz('Europe/Kyiv');
      const expired = (todayAppointmentsRef.current || []).filter(app =>
        normalizeStatus(app.status) === 'waiting' &&
        moment(app.appointment_time).isBefore(now.clone().subtract(serviceDuration + 5, 'minutes'))
      );

      expired.forEach(app => handleSkip(app.id));
    };

    const interval = setInterval(checkAndSkip, 10000);
    checkAndSkip();

    return () => clearInterval(interval);
  }, [serviceDuration]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onFocus = () => stopTitleBlink();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  
  
  const handleStart = async (id) => {
    if (hasActiveClient) {
      showError('Спочатку завершіть поточного клієнта, щоб відкрити наступного.');
      return false;
    }

    try {
      const res = await fetch(`${API_URL}/appointments/${id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      if (!res.ok) throw new Error();

      setAppointments(prev =>
        prev.map(item =>
          item.id === id ? { ...item, status: 'in_progress' } : item
        )
      );

      setSelectedTicket(prev =>
        prev && prev.id === id ? { ...prev, status: 'in_progress' } : prev
      );
      setShowWarning(false);
      return true;
    } catch {
      showError('Не вдалося почати обслуговування');
    }
  };

  const handleTabStart = async (tabIndex) => {
    if (!selectedTicket?.id) return;
    const statusKey = normalizeStatus(selectedTicket.status);
    if (statusKey !== 'in_progress') {
      const ok = await handleStart(selectedTicket.id);
      if (!ok) return;
    }

    setTabStatuses(prev => prev.map((s, idx) => (idx === tabIndex ? 'in_progress' : s)));
    const nextTabs = metaTabs.map((tab, idx) =>
      idx === tabIndex ? { ...tab, tab_status: 'in_progress' } : tab
    );
    setMetaTabs(nextTabs);
    syncMetaTabs(nextTabs);
  };



  const handleSkip = async (id) => {
    try {
      const res = await fetch(`${API_URL}/appointments/${id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      if (!res.ok) throw new Error();

      setAppointments(prev =>
        prev.map(item =>
          item.id === id ? { ...item, status: 'missed' } : item
        )
      );

      setSelectedTicket(null);
    } catch {
      showError('Не вдалося пропустити клієнта');
    }
  };

  
  const handleDidNotAppear = async (id) => {
    try {
      const res = await fetch(`${API_URL}/appointments/${id}/did-not-appear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      if (!res.ok) throw new Error();

      setAppointments(prev =>
        prev.map(item =>
          item.id === id ? { ...item, status: 'did_not_appear' } : item
        )
      );

      setSelectedTicket(null);
    } catch {
      showError('Не вдалося позначити клієнта як "Не зʼявився"');
    }
  };

  const handleFinish = async (tabIndex) => {
    if (!selectedTicket?.id) return;
    const tab = metaTabs[tabIndex] || createMetaTab({ slot: tabIndex + 1 });

    const errs = validateMetaLocal(tab);
    if (errs.length) {
      const prefix = metaTabs.length > 1 ? `Вкладка ${tabIndex + 1}: ` : '';
      showError(prefix + errs.join(' '));
      return;
    }

    try {
      const nextTabsForFinish = metaTabs.map((item, idx) =>
        idx === tabIndex ? { ...item, tab_status: 'completed' } : item
      );
      const payload = buildMetaPayload(nextTabsForFinish);
      payload.finish_tab_index = tabIndex;
      const res = await fetch(`${API_URL}/appointments/${selectedTicket.id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error || (err.errors ? err.errors.join(', ') : 'Не вдалося завершити обслуговування')
        );
      }

      const allClosed = nextTabsForFinish.every((item) => {
        const status = normalizeStatus(item?.tab_status);
        return status === 'completed' || status === 'canceled';
      });
      if (tabIndex === 0 && nextTabsForFinish.length === 1) {
        setAppointments(prev => prev.map(item =>
          item.id === selectedTicket.id ? { ...item, status: 'completed' } : item
        ));
        setSelectedTicket(prev =>
          prev && prev.id === selectedTicket.id ? { ...prev, status: 'completed' } : prev
        );
      } else if (allClosed) {
        setAppointments(prev => prev.map(item =>
          item.id === selectedTicket.id ? { ...item, status: 'completed' } : item
        ));
        setSelectedTicket(prev =>
          prev && prev.id === selectedTicket.id ? { ...prev, status: 'completed' } : prev
        );
      }

      const nextStatuses = tabStatuses.map((s, idx) => (idx === tabIndex ? 'completed' : s));
      const payloadForState = buildMetaPayload(nextTabsForFinish);
      setSelectedTicket(prev =>
        prev && prev.id === selectedTicket.id
          ? { ...prev, ...payloadForState }
          : prev
      );
      setAppointments(prev =>
        prev.map(item =>
          item.id === selectedTicket.id
            ? { ...item, ...payloadForState }
            : item
        )
      );
      setMetaTabs(nextTabsForFinish);
      setTabStatuses(nextStatuses);

      if (allClosed) {
        setSelectedTicket(null);
        return;
      }

      const visibleIndexes = computeVisibleTabIndexes(nextTabsForFinish, nextStatuses);

      if (nextStatuses[activeMetaIndex] === 'completed') {
        const nextAfter = visibleIndexes.find((idx) => idx > tabIndex);
        const nextIndex = nextAfter !== undefined ? nextAfter : visibleIndexes[visibleIndexes.length - 1];
        setActiveMetaIndex(nextIndex);
      }
    } catch (e) {
      showError(String(e.message || e));
    }
  };


if (!employee) {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const { showError } = useError();

    const handleLogin = async () => {
      try {
        const res = await fetch(`${API_URL}/auth/login/employee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, password })
        });

        const data = await res.json();

        if (!res.ok) {
          showError(data.error || 'Помилка входу');
          return;
        }

        localStorage.setItem('employee', JSON.stringify(data));
        window.location.reload();
      } catch (err) {
        console.error(err);
        showError('Помилка сервера');
      }
    };

    return (
      <div className="login-container">
        <h2>Вхід для працівника</h2>
        <input
          type="text"
          placeholder="Ім’я"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button onClick={handleLogin}>Увійти</button>
      </div>
    );
  }

  const displayAppointments = useMemo(
    () => mergeAppointmentsByTicket(appointments),
    [appointments]
  );

  const waitingAppointments = displayAppointments
    .filter(a => {
      const status = normalizeStatus(a.status);
      return status === 'waiting' || status === 'in_progress' || hasOpenTab(a);
    })
    .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));

  const closedAppointments = displayAppointments
    .filter(a => {
      const status = normalizeStatus(a.status);
      return status !== 'waiting' && status !== 'in_progress' && !hasOpenTab(a);
    })
    .sort((a, b) => new Date(b.appointment_time) - new Date(a.appointment_time));

  const renderTicketItem = (app) => {
    const statusKey = normalizeStatus(app.status);
    const isLive = isLiveQueueRecord(app);
    const isBlocked = isClosedStatus(app.status);
    const tabCount = getTabCountForTicket(app);
    const addDisabled = tabCount >= MAX_META_TABS;
    const showAddTab = statusKey === 'completed';

    return (
      <li
        key={app.id}
        className={`ticket ${statusKey} ${isLive ? 'live-queue' : ''}`}
        onClick={() => {
          if (isBlocked) {
            return;
          }
          setSelectedTicket(app);
        }}
      >
        <div className="ticket-left">
          <div className="ticket-top">
            <span className="ticket-num">№{app.ticket_number || app.id}</span>
            <span className="ticket-time">
              {new Date(app.appointment_time).toLocaleTimeString('uk-UA', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="ticket-question">{app.question_text}</div>
        </div>
        <div className="ticket-right">
          {showAddTab && (
            <button
              type="button"
              className="ticket-add-tab"
              onClick={(e) => {
                e.stopPropagation();
                if (!addDisabled) handleAddTabForTicket(app);
              }}
              disabled={addDisabled}
              title={addDisabled ? 'Досягнуто максимум вкладок' : 'Додати вкладку до цього талону'}
            >
              + вкладка
            </button>
          )}
          <span className="status">{formatStatusLabel(app)}</span>
        </div>
      </li>
    );
  };


  return (
    <div className="manager-container">
      {attentionPrompt && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:20000,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
          <div style={{background:'#fff',color:'#111',padding:'20px 24px',borderRadius:'12px',maxWidth:'420px',width:'100%',boxShadow:'0 18px 44px rgba(0,0,0,0.35)'}}>
            <h3 style={{margin:'0 0 8px',fontSize:'18px'}}>{attentionPrompt.title}</h3>
            <p style={{margin:'0 0 16px',fontSize:'14px',lineHeight:1.45}}>{attentionPrompt.body}</p>
            <button onClick={acknowledgePrompt} style={{padding:'10px 16px',border:'none',borderRadius:'10px',background:'#2563eb',color:'#fff',fontWeight:600,cursor:'pointer',width:'100%'}}>
              ОК
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title}
        description={confirmDialog?.description}
        confirmLabel={confirmDialog?.confirmLabel}
        cancelLabel={confirmDialog?.cancelLabel}
        onConfirm={() => {
          const handler = confirmDialog?.onConfirm;
          closeConfirm();
          if (handler) handler();
        }}
        onCancel={closeConfirm}
      />

      {showWarning && (
        <div className="warning-banner">
          ⚠️ УВАГА! Наступний споживач очікує на обслуговування.
        </div>
      )}

      <div className="manager-header">
        <div className="manager-title-block">
          <h2>Вікно №{employee.window_number}</h2>
          <p className="manager-subtitle">
            Оператор: <span>{employee.name}</span>
          </p>
        </div>

        <div className="manager-date-picker">
          <label htmlFor="manager-date">Дата:</label>
          <input
            id="manager-date"
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value || todayStr);
              setSelectedTicket(null);
            }}
          />
        </div>

        <button
          className="logout-btn"
          onClick={() => {
            localStorage.removeItem('employee');
            window.location.reload();
          }}
        >
          Вийти
        </button>
      </div>

      {currentClient && (
        <div className="current-client-card">
          <div className="cc-label">Зараз обслуговується</div>
          <div className="cc-main">
            <div className="cc-time">
              {new Date(currentClient.appointment_time).toLocaleTimeString('uk-UA', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
            <div className="cc-info">
              <div className="cc-question">{currentClient.question_text}</div>
            <div className="cc-meta">
              Талон №{currentClient.ticket_number || currentClient.id}
              </div>
            </div>
          </div>
        </div>
      )}

      <ul className="ticket-list">
        {waitingAppointments.length === 0 && closedAppointments.length === 0 ? (
          <li className="ticket empty">
            Наразі нові записи відсутні
          </li>
        ) : (
          <>
            {waitingAppointments.length > 0 && (
              <li className="ticket-section">Очікування</li>
            )}
            {waitingAppointments.map(renderTicketItem)}
            {closedAppointments.length > 0 && (
              <li className="ticket-section">Завершені</li>
            )}
            {closedAppointments.map(renderTicketItem)}
          </>
        )}
      </ul>
      {selectedTicket && (
      <div className="modal-overlay" onClick={attemptCloseModal}>
        <div className="modal-window" onClick={e => e.stopPropagation()}>
          <h3>Талон №{selectedTicket.ticket_number || selectedTicket.id}</h3>
          <p>Час: {new Date(selectedTicket.appointment_time).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</p>
          <p>Питання: {selectedTicket.question_text}</p>
          <p>Статус: {formatStatusLabel(selectedTicket)}</p>

          {/* ФОРМА (окрема від кнопок) */}
          <div className="modal-body">
            <div className="meta-tabs">
              {visibleTabIndexes.map((tabIndex) => {
                const tab = metaTabs[tabIndex];
                const accountLabel = (tab?.personal_account || '').trim();
                const slotLabel = tab?.tab_slot || tabIndex + 1;
                return (
                  <div
                    key={tab?.tab_slot || tabIndex}
                    className={`meta-tab ${tabIndex === activeMetaIndex ? 'active' : ''}`}
                  >
                    <button
                      type="button"
                      className="meta-tab-btn"
                      onClick={() => setActiveMetaIndex(tabIndex)}
                    >
                      <span>Вкладка {slotLabel}</span>
                      {accountLabel && <span className="meta-tab-account">№{accountLabel}</span>}
                    </button>
                    {visibleTabIndexes.length > 1 &&
                      (tab?.tab_slot || tabIndex + 1) > 1 &&
                      !isTabReadOnly(tabIndex) && (
                      <button
                        type="button"
                        className="meta-tab-close"
                        onClick={() => handleRemoveMetaTab(tabIndex)}
                        aria-label={`Закрити вкладку ${slotLabel}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
              {selectedTicket &&
                (!isClosedStatus(selectedTicket.status) || normalizeStatus(selectedTicket.status) === 'completed') && (
                <button
                  type="button"
                  className="meta-tab-add"
                  onClick={handleAddMetaTab}
                  disabled={metaTabs.length >= MAX_META_TABS}
                  aria-label="Додати вкладку"
                  title={metaTabs.length >= MAX_META_TABS ? 'Максимум 5 вкладок' : 'Додати вкладку'}
                >
                  +
                </button>
              )}
            </div>
            <div className="meta-form">
              {activeMeta.service_zone !== false && (
                <div className="field field-account">
                  <label>Абонентський номер споживача<span className="req">*</span></label>
                  <input
                    type="text"
                    value={activeMeta.personal_account}
                    onChange={e => onMetaChange({ personal_account: e.target.value })}
                    placeholder="Введіть абонентський номер споживача"
                    disabled={isActiveTabReadOnly}
                  />
                </div>
              )}

              <div className="field field-zone">
                <label>Зона обслуговування</label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={activeMeta.service_zone !== false}
                    onChange={(e) => onMetaChange({ service_zone: e.target.checked })}
                    disabled={isActiveTabReadOnly}
                  />
                  <span>{activeMeta.service_zone !== false ? "Наша" : "Не наша"}</span>
                </label>
              </div>

              <div className="field field-extra">
                <MultiSelectDropdown
                  label="Додаткові дії"
                  options={options.extra_actions}
                  value={Array.isArray(activeMeta.extra_actions) ? activeMeta.extra_actions : []}
                  onChange={(arr) => onMetaChange({ extra_actions: arr })}
                  placeholder="Обрати дію(ї)"
                  zIndex={200000}
                  disabled={isActiveTabReadOnly}
                />

                {Array.isArray(activeMeta.extra_actions) && activeMeta.extra_actions.includes('EX_OTHER_FREE_TEXT') && (
                  <div className="field nested field-extra-other">
                    <label>Інше — опишіть<span className="req">*</span></label>
                    <input
                      type="text"
                      value={activeMeta.extra_other_text}
                      onChange={e => onMetaChange({ extra_other_text: e.target.value })}
                      placeholder="Коротко опишіть іншу дію"
                      disabled={isActiveTabReadOnly}
                    />
                  </div>
                )}
              </div>

              <div className="field field-yesno">
                <label>Заява<span className="req">*</span></label>
                <div className="radio-group">
                  <label><input
                    type="radio"
                    name="application_yesno"
                    checked={activeMeta.application_yesno === true}
                    onChange={() => onMetaChange({ application_yesno: true })}
                    disabled={isActiveTabReadOnly}
                  /> Так</label>
                  <label><input
                    type="radio"
                    name="application_yesno"
                    checked={activeMeta.application_yesno === false}
                    onChange={() => onMetaChange({ application_yesno: false, application_types: [] })}
                    disabled={isActiveTabReadOnly}
                  /> Ні</label>
                </div>
              </div>

              {activeMeta.application_yesno === true && (
                <div className="field field-app-types">
                  <MultiSelectDropdown
                    label="Тип(и) заяви"
                    required
                    options={options.application_types}
                    value={Array.isArray(activeMeta.application_types) ? activeMeta.application_types : []}
                    onChange={(arr) => onMetaChange({ application_types: arr })}
                    placeholder="Обрати тип(и)"
                    zIndex={190000}
                    disabled={isActiveTabReadOnly}
                  />
                </div>
              )}

              <div className="field field-comment">
                <label>Коментар</label>
                <textarea
                  rows={3}
                  value={activeMeta.manager_comment}
                  onChange={e => onMetaChange({ manager_comment: e.target.value })}
                  placeholder="За бажанням додайте примітку"
                  disabled={isActiveTabReadOnly}
                />
              </div>

              {metaSaving && <div className="saving-hint">Збереження…</div>}
            </div>
          </div>
          {/* НИЖНЯ ПАНЕЛЬ КНОПОК */}
          <div className="modal-footer">
            {activeTabStatus === 'waiting' && !isActiveTabReadOnly && (
              <button
                className="start"
                onClick={() => handleTabStart(activeMetaIndex)}
                title={hasActiveClient ? 'Завершіть поточного клієнта перед стартом нового.' : undefined}
              >Старт</button>
            )}
            {activeTabStatus === 'in_progress' && !isActiveTabReadOnly && (
              <button
                className="finish"
                onClick={() => handleFinish(activeMetaIndex)}
                disabled={isFinishDisabled}
                title={activeTabErrors.length ? activeTabErrors[0] : undefined}
              >
                Фініш
              </button>
            )}
            {!isActiveTabReadOnly && (
              activeTabSlot > 1 ? (
                <button className="skip" onClick={() => handleCancelMetaTab(activeMetaIndex)}>
                  Відмінити
                </button>
              ) : (
                <button className="skip" onClick={() => handleDidNotAppear(selectedTicket.id)}>
                  Не зʼявився
                </button>
              )
            )}
            {normalizeStatus(selectedTicket.status) !== 'in_progress' && (
              <button className="close" onClick={attemptCloseModal}>Закрити</button>
            )}
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default Manager;
