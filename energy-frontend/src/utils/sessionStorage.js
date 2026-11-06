/**
 * Session and Chat persistence utility for WattWise
 * Stores chat history, multi-month bills, and single-bill audits in localStorage.
 */

const STORAGE_KEYS = {
  CURRENT_SESSION_ID: 'wattwise_active_chat_session',
  CHAT_SESSIONS: 'wattwise_chat_sessions_v1',
  BILL_ANALYSIS: 'wattwise_single_bill_analysis_v1',
  BILL_CHAT: 'wattwise_bill_chat_messages_v1',
  MONTHLY_BILLS: 'wattwise_monthly_bills_v1',
  MONTHLY_ANALYSIS: 'wattwise_monthly_analysis_v1',
};

// Default initial chat session
export function getDefaultChatSession() {
  return {
    id: 'default-session',
    title: 'Energy Forecast & Insights',
    createdAt: new Date().toISOString(),
    messages: [
      {
        role: 'assistant',
        text: '### Welcome to WattWise AI!\nI can help you explore your household power consumption, forecast next-hour demand with XGBoost, explain model metrics, or share energy conservation tips. What would you like to explore?',
      },
    ],
  };
}

// ----------------- Chat Sessions -----------------

export function loadChatSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHAT_SESSIONS);
    if (!raw) {
      const initial = [getDefaultChatSession()];
      localStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [getDefaultChatSession()];
  } catch {
    return [getDefaultChatSession()];
  }
}

export function saveChatSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to save chat sessions:', err);
  }
}

export function getActiveSessionId() {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION_ID) || 'default-session';
}

export function setActiveSessionId(id) {
  localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION_ID, id);
}

// ----------------- Single Bill Audit Persistence -----------------

export function loadSavedBillAnalysis() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BILL_ANALYSIS);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveBillAnalysis(analysis) {
  try {
    if (analysis) {
      localStorage.setItem(STORAGE_KEYS.BILL_ANALYSIS, JSON.stringify(analysis));
    } else {
      localStorage.removeItem(STORAGE_KEYS.BILL_ANALYSIS);
    }
  } catch (err) {
    console.error('Failed to save bill analysis:', err);
  }
}

export function loadSavedBillChat() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BILL_CHAT);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBillChat(messages) {
  try {
    localStorage.setItem(STORAGE_KEYS.BILL_CHAT, JSON.stringify(messages || []));
  } catch (err) {
    console.error('Failed to save bill chat:', err);
  }
}

// ----------------- Multi-Month Bills Persistence -----------------

export const DEFAULT_SAMPLE_MONTHS = [
  { id: '1', month: 'May 2026', units_kwh: 310, amount: 96.10, billing_days: 31, notes: 'Spring shoulder season baseline' },
  { id: '2', month: 'Jun 2026', units_kwh: 420, amount: 142.80, billing_days: 30, notes: 'Early summer AC usage starts' },
  { id: '3', month: 'Jul 2026', units_kwh: 560, amount: 198.40, billing_days: 31, notes: 'Peak summer heatwave / heavy cooling' },
  { id: '4', month: 'Aug 2026', units_kwh: 530, amount: 186.20, billing_days: 31, notes: 'Sustained AC and refrigeration load' },
  { id: '5', month: 'Sep 2026', units_kwh: 380, amount: 122.50, billing_days: 30, notes: 'Fall cooldown' },
  { id: '6', month: 'Oct 2026', units_kwh: 330, amount: 104.30, billing_days: 31, notes: 'Moderate autumn baseline' },
];

export function loadSavedMonthlyBills() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MONTHLY_BILLS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.MONTHLY_BILLS, JSON.stringify(DEFAULT_SAMPLE_MONTHS));
      return DEFAULT_SAMPLE_MONTHS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_SAMPLE_MONTHS;
  } catch {
    return DEFAULT_SAMPLE_MONTHS;
  }
}

export function saveMonthlyBills(bills) {
  try {
    localStorage.setItem(STORAGE_KEYS.MONTHLY_BILLS, JSON.stringify(bills || []));
  } catch (err) {
    console.error('Failed to save monthly bills:', err);
  }
}

export function loadSavedMonthlyAnalysis() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MONTHLY_ANALYSIS);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveMonthlyAnalysis(analysis) {
  try {
    if (analysis) {
      localStorage.setItem(STORAGE_KEYS.MONTHLY_ANALYSIS, JSON.stringify(analysis));
    } else {
      localStorage.removeItem(STORAGE_KEYS.MONTHLY_ANALYSIS);
    }
  } catch (err) {
    console.error('Failed to save monthly analysis:', err);
  }
}

