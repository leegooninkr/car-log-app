import React, { useState, useEffect } from 'react';
import { Gauge, History, Settings as SettingsIcon, Sun, Moon, Car } from 'lucide-react';
import { loadData, saveData } from './utils/db';
import Dashboard from './components/Dashboard';
import Logs from './components/Logs';
import Settings from './components/Settings';
import { appendLogToSheet, postToAppsScript } from './utils/googleSheets';

export default function App() {
  // Load data from local storage (or seed data on first run)
  const [appData, setAppData] = useState(() => {
    const data = loadData();
    data.settings = {
      hyundaiClientId: '',
      hyundaiClientSecret: '',
      googleClientId: '',
      googleSpreadsheetId: '',
      googleAutoSync: false,
      googleSyncMethod: 'oauth', // 'oauth' or 'script'
      googleScriptUrl: '',
      hyundaiCarId: '',
      hyundaiCarNickname: '',
      hyundaiTokenInfo: null,
      googleToken: null,
      googleTokenExpiresAt: null,
      ...data.settings
    };
    return data;
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState('dark');

  // Touch Swiping States for Tab Navigation
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isHorizontalSwipe, setIsHorizontalSwipe] = useState(false);

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setIsDragging(true);
    setIsHorizontalSwipe(false);
    setDragOffset(0);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStart.x;
    const diffY = touch.clientY - touchStart.y;

    if (!isHorizontalSwipe) {
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
        setIsHorizontalSwipe(true);
      } else if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
        setIsDragging(false);
        return;
      }
    }

    if (isHorizontalSwipe) {
      if (e.cancelable) e.preventDefault();
      
      let offset = diffX;
      if (activeTab === 'dashboard' && offset > 0) {
        offset = offset / 3; // rubber band
      } else if (activeTab === 'settings' && offset < 0) {
        offset = offset / 3; // rubber band
      }
      setDragOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const tabOrder = ['dashboard', 'logs', 'settings'];
    const currentIndex = tabOrder.indexOf(activeTab);
    const threshold = window.innerWidth * 0.2;

    if (isHorizontalSwipe) {
      if (dragOffset < -threshold && currentIndex < 2) {
        setActiveTab(tabOrder[currentIndex + 1]);
      } else if (dragOffset > threshold && currentIndex > 0) {
        setActiveTab(tabOrder[currentIndex - 1]);
      }
    }

    setDragOffset(0);
    setIsHorizontalSwipe(false);
  };

  // Sync data with local storage on state change
  useEffect(() => {
    saveData(appData);
  }, [appData]);

  // Handle HTML document theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Handle OAuth Redirect Callbacks (Popups)
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    
    if (hash || search) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const searchParams = new URLSearchParams(search);
      
      const googleAccessToken = hashParams.get('access_token');
      const googleState = hashParams.get('state');
      
      if (googleAccessToken && googleState === 'google') {
        if (window.opener) {
          window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', token: googleAccessToken }, window.location.origin);
          window.close();
        }
      }
    }
  }, []);

  // Listen for message events from login popups
  useEffect(() => {
    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        const token = event.data.token;
        const expiresAt = Date.now() + 3600 * 1000; // standard 1 hour
        setAppData(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            googleToken: token,
            googleTokenExpiresAt: expiresAt
          }
        }));
        alert('구글 계정 연동 성공!');
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);



  // State handlers passed to child components
  const handleSettingsChange = (newSettings) => {
    setAppData(prev => ({
      ...prev,
      settings: newSettings
    }));
  };

  const handleLogsUpdate = (updatedLogs) => {
    setAppData(prev => ({
      ...prev,
      logs: updatedLogs
    }));
  };

  const handleAddLog = async (newLog) => {
    const finalLog = { ...newLog, syncedToGoogle: false };
    
    // Add locally first
    setAppData(prev => ({
      ...prev,
      logs: [finalLog, ...prev.logs]
    }));
    
    // Auto-sync to Google Sheets if settings enable it
    if (appData.settings.googleAutoSync) {
      if (appData.settings.googleSyncMethod === 'script') {
        if (appData.settings.googleScriptUrl) {
          try {
            await postToAppsScript(appData.settings.googleScriptUrl, appData.settings, finalLog);
            setAppData(prev => ({
              ...prev,
              logs: prev.logs.map(log => log.id === finalLog.id ? { ...log, syncedToGoogle: true } : log)
            }));
          } catch (err) {
            console.error('Failed to auto-sync new log via Apps Script:', err);
          }
        }
      } else {
        // OAuth mode (default)
        if (appData.settings.googleToken && appData.settings.googleSpreadsheetId) {
          if (appData.settings.googleTokenExpiresAt && Date.now() > appData.settings.googleTokenExpiresAt) {
            console.warn('Google Sheet Auto-Sync: Token expired. Please re-authenticate in Settings.');
            return;
          }
          try {
            await appendLogToSheet(appData.settings.googleToken, appData.settings.googleSpreadsheetId, finalLog, appData.settings);
            setAppData(prev => ({
              ...prev,
              logs: prev.logs.map(log => log.id === finalLog.id ? { ...log, syncedToGoogle: true } : log)
            }));
          } catch (err) {
            console.error('Failed to auto-sync new log to Google Sheets:', err);
          }
        }
      }
    }
  };

  const handleDeleteLog = (id) => {
    setAppData(prev => ({
      ...prev,
      logs: prev.logs.filter(log => log.id !== id)
    }));
  };

  const handleDeleteMultipleLogs = (ids) => {
    setAppData(prev => ({
      ...prev,
      logs: prev.logs.filter(log => !ids.includes(log.id))
    }));
  };

  const handleUpdateLog = (updatedLog) => {
    setAppData(prev => ({
      ...prev,
      logs: prev.logs.map(log => log.id === updatedLog.id ? updatedLog : log)
    }));
  };

  const handleImportData = (newData) => {
    setAppData(newData);
  };

  const getPreviousMonthLastOdometer = (logs) => {
    const now = new Date();
    const currentMonthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const pastLogs = logs.filter(log => log.date < currentMonthStartStr);
    if (pastLogs.length > 0) {
      const sorted = [...pastLogs].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id));
      return sorted[0].endOdometer;
    }
    return null;
  };

  const lastMonthLastOdo = getPreviousMonthLastOdometer(appData.logs);
  const resolvedBaseOdometer = (appData.settings.autoBaseOdometer !== false && lastMonthLastOdo !== null)
    ? lastMonthLastOdo
    : appData.settings.baseOdometer;

  const resolvedSettings = {
    ...appData.settings,
    baseOdometer: resolvedBaseOdometer
  };

  const tabOrder = ['dashboard', 'logs', 'settings'];
  const activeIndex = tabOrder.indexOf(activeTab);

  return (
    <>
      {/* App Header */}
      <header className="app-header">
        <h1 className="app-title">
          <Car size={22} style={{ color: 'var(--primary)' }} />
          차량 운행일지
          <span style={{ 
            fontSize: '0.75rem', 
            fontWeight: 500, 
            color: 'var(--text-secondary)',
            background: 'var(--bg-tertiary)',
            padding: '2px 8px',
            borderRadius: '999px',
            border: '1px solid var(--border-light)',
            marginLeft: '4px'
          }}>
            {appData.settings.carNumber}
          </span>
        </h1>
        
        <button 
          onClick={toggleTheme} 
          className="theme-switch"
          aria-label="화면 모드 변경"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      {/* Main Viewport Area with touch sliding */}
      <main className="app-content-viewport">
        <div 
          className="app-content-slider"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            transform: `translate3d(calc(-${activeIndex * 33.33333}% + ${dragOffset}px), 0, 0)`,
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <div className="app-content-slide">
            <Dashboard 
              settings={resolvedSettings} 
              logs={appData.logs} 
              onAddLog={handleAddLog} 
              onLogsUpdate={handleLogsUpdate}
            />
          </div>
          <div className="app-content-slide">
            <Logs 
              logs={appData.logs} 
              settings={resolvedSettings}
              onDeleteLog={handleDeleteLog} 
              onDeleteMultipleLogs={handleDeleteMultipleLogs}
              onUpdateLog={handleUpdateLog} 
            />
          </div>
          <div className="app-content-slide">
            <Settings 
              settings={appData.settings} 
              logs={appData.logs} 
              templates={appData.templates}
              onSettingsChange={handleSettingsChange}
              onImportData={handleImportData}
              onLogsUpdate={handleLogsUpdate}
            />
          </div>
        </div>
      </main>

      {/* Navigation Bar */}
      <nav className="bottom-nav">
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
        >
          <Gauge className="nav-icon" />
          <span>기록 입력</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('logs')} 
          className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
        >
          <History className="nav-icon" />
          <span>기록 이력</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('settings')} 
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        >
          <SettingsIcon className="nav-icon" />
          <span>환경 설정</span>
        </button>
      </nav>
    </>
  );
}
