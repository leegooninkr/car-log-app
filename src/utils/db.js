const LOCAL_STORAGE_KEY = 'car_log_app_data_v4'; // Changed key to force reset to empty database

const DEFAULT_SETTINGS = {
  bizNumber: '',
  carModel: '',
  carNumber: '',
  baseOdometer: 0,
  ownerType: '자가', // 렌트, 리스, 자가
  department: '',
  driverName: ''
};

const SEED_TEMPLATES = [];

const SEED_LOGS = [];

export const loadData = () => {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    const initialData = {
      settings: DEFAULT_SETTINGS,
      logs: SEED_LOGS,
      templates: SEED_TEMPLATES
    };
    saveData(initialData);
    return initialData;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse local storage data, resetting to seed data', e);
    return {
      settings: DEFAULT_SETTINGS,
      logs: SEED_LOGS,
      templates: SEED_TEMPLATES
    };
  }
};

export const saveData = (data) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
};
