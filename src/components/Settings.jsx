import React, { useState } from 'react';
import { Save, Download, Upload, User, FileSpreadsheet, Car, ShieldAlert, CloudLightning, RefreshCw } from 'lucide-react';
import { exportToNtsCsv } from '../utils/csvExport';
import { getGoogleAuthUrl, createSpreadsheet, batchSyncLogsToSheet, postToAppsScript } from '../utils/googleSheets';

export default function Settings({ 
  settings, 
  onSettingsChange, 
  onImportData, 
  logs,
  templates,
  onLogsUpdate
}) {
  const [formData, setFormData] = useState({ ...settings });
  const [showSavedMsg, setShowSavedMsg] = useState(false);

  // API Integrations state
  const [loadingCars, setLoadingCars] = useState(false);
  const [carsList, setCarsList] = useState([]);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');
  const [loadingSync, setLoadingSync] = useState(false);

  const redirectUri = window.location.origin + window.location.pathname;

  // Google Login Popup
  const handleGoogleLogin = () => {
    if (!formData.googleClientId) {
      alert('먼저 Google Client ID를 입력하고 저장해 주세요.');
      return;
    }
    const width = 500, height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const authUrl = getGoogleAuthUrl(formData.googleClientId, redirectUri);
    window.open(authUrl, 'google-oauth', `width=${width},height=${height},left=${left},top=${top}`);
  };



  // Create Google Sheets
  const handleCreateGoogleSheet = async () => {
    if (!settings.googleToken) {
      alert('구글 계정이 연동되지 않았습니다.');
      return;
    }
    try {
      const sheetId = await createSpreadsheet(settings.googleToken, settings.carNumber);
      const newSettings = {
        ...formData,
        googleSpreadsheetId: sheetId
      };
      setFormData(newSettings);
      onSettingsChange(newSettings);
      alert('새 스프레드시트가 성공적으로 생성 및 연동되었습니다!');
    } catch (err) {
      console.error(err);
      alert('스프레드시트 생성에 실패했습니다: ' + err.message);
    }
  };

  // Batch sync unsynced logs to Google Sheets
  const handleBatchSync = async () => {
    const unsynced = logs.filter(log => !log.syncedToGoogle);
    if (unsynced.length === 0) {
      alert('새로 동기화할 운행 기록이 없습니다.');
      return;
    }
    
    setLoadingSync(true);
    setSyncStatusMsg('구글 시트 동기화 중...');
    try {
      if (formData.googleSyncMethod === 'script') {
        if (!formData.googleScriptUrl) {
          alert('Google Apps Script 웹 앱 URL이 입력되지 않았습니다.');
          setLoadingSync(false);
          setSyncStatusMsg('');
          return;
        }
        await postToAppsScript(formData.googleScriptUrl, settings, unsynced);
      } else {
        if (!settings.googleToken || !settings.googleSpreadsheetId) {
          alert('구글 연동 및 스프레드시트 설정이 필요합니다.');
          setLoadingSync(false);
          setSyncStatusMsg('');
          return;
        }
        await batchSyncLogsToSheet(settings.googleToken, settings.googleSpreadsheetId, unsynced, settings);
      }
      
      const updatedLogs = logs.map(log => {
        if (!log.syncedToGoogle) {
          return { ...log, syncedToGoogle: true };
        }
        return log;
      });
      onLogsUpdate(updatedLogs);
      setSyncStatusMsg('✅ 동기화 완료!');
      setTimeout(() => setSyncStatusMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert('동기화 실패: ' + err.message);
      setSyncStatusMsg('❌ 동기화 실패');
    } finally {
      setLoadingSync(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'baseOdometer' ? parseInt(value) || 0 : value
    }));
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    onSettingsChange(formData);
    setShowSavedMsg(true);
    setTimeout(() => setShowSavedMsg(false), 2000);
  };

  const handleExportJson = () => {
    const backupData = {
      settings,
      logs,
      templates: templates || []
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `car_log_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported.settings && imported.logs && imported.templates) {
          if (confirm('기존 데이터가 덮어씌워집니다. 계속하시겠습니까?')) {
            onImportData(imported);
            setFormData(imported.settings);
            alert('데이터 복원이 완료되었습니다.');
          }
        } else {
          alert('올바르지 않은 백업 파일 형식입니다.');
        }
      } catch (err) {
        alert('파일을 읽는 도중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fade-in" style={{ paddingBottom: '20px' }}>
      <h2>설정 및 데이터 관리</h2>

      {/* 1. Vehicle and Driver Settings */}
      <form onSubmit={handleSaveSettings} className="glass-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--primary)' }}>
          <Car size={18} /> 차량 및 운전자 정보 (고정 값)
        </h3>
        
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">부서</label>
            <input 
              type="text" 
              name="department" 
              value={formData.department} 
              onChange={handleInputChange} 
              className="form-control" 
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">성명</label>
            <input 
              type="text" 
              name="driverName" 
              value={formData.driverName} 
              onChange={handleInputChange} 
              className="form-control" 
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">차종</label>
            <input 
              type="text" 
              name="carModel" 
              value={formData.carModel} 
              onChange={handleInputChange} 
              className="form-control" 
              placeholder="예: 코나, 쏘나타"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">차량번호</label>
            <input 
              type="text" 
              name="carNumber" 
              value={formData.carNumber} 
              onChange={handleInputChange} 
              className="form-control" 
              placeholder="예: 149허9365"
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">기본 출발지 주소</label>
            <input 
              type="text" 
              name="defaultDepAddr" 
              value={formData.defaultDepAddr || ''} 
              onChange={handleInputChange} 
              className="form-control" 
              placeholder="예: 경기 안산시 상록구 팔곡이동"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">기본 도착지 주소</label>
            <input 
              type="text" 
              name="defaultDestAddr" 
              value={formData.defaultDestAddr || ''} 
              onChange={handleInputChange} 
              className="form-control" 
              placeholder="예: 경기 안산시 상록구 팔곡이동"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className="form-label" style={{ margin: 0 }}>기초 누적거리 (km)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input 
                type="checkbox"
                checked={formData.autoBaseOdometer !== false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  const now = new Date();
                  const currentMonthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                  const pastLogs = logs.filter(log => log.date < currentMonthStartStr);
                  let lastMonthLastOdo = null;
                  if (pastLogs.length > 0) {
                    const sorted = [...pastLogs].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id));
                    lastMonthLastOdo = sorted[0].endOdometer;
                  }
                  
                  setFormData(prev => ({
                    ...prev,
                    autoBaseOdometer: checked,
                    baseOdometer: checked && lastMonthLastOdo !== null ? lastMonthLastOdo : prev.baseOdometer
                  }));
                }}
                style={{ accentColor: 'var(--primary)' }}
              />
              전달 마지막 기록 자동 적용
            </label>
          </div>
          {(() => {
            const now = new Date();
            const currentMonthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            const pastLogs = logs.filter(log => log.date < currentMonthStartStr);
            let lastMonthLastOdo = null;
            if (pastLogs.length > 0) {
              const sorted = [...pastLogs].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id));
              lastMonthLastOdo = sorted[0].endOdometer;
            }
            
            const isAuto = formData.autoBaseOdometer !== false && lastMonthLastOdo !== null;
            const displayVal = isAuto ? lastMonthLastOdo : (formData.baseOdometer !== undefined ? formData.baseOdometer : '');
            
            return (
              <>
                <input 
                  type="number" 
                  name="baseOdometer" 
                  value={displayVal} 
                  onChange={handleInputChange} 
                  className="form-control" 
                  disabled={isAuto}
                  placeholder={lastMonthLastOdo !== null ? `전달 마지막: ${lastMonthLastOdo} km` : '기초 누적거리 입력'}
                  required
                />
                {isAuto && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '4px', display: 'block' }}>
                    💡 전달 마지막 기록({lastMonthLastOdo} km)이 자동으로 적용 중입니다. 수정을 원하시면 체크를 해제하세요.
                  </span>
                )}
              </>
            );
          })()}
        </div>

        <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
          <Save size={18} /> 고정 정보 저장
        </button>

        {showSavedMsg && (
          <p style={{ color: 'var(--primary)', textAlign: 'center', marginTop: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
            성공적으로 저장되었습니다!
          </p>
        )}
      </form>

      {/* Google Sheets Integration Card */}
      <div className="glass-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#10b981' }}>
          <FileSpreadsheet size={18} /> 구글 시트 (Google Sheets) 연동
        </h3>
        <p style={{ fontSize: '0.85rem', marginBottom: '12px' }}>
          구글 드라이브에 시트를 생성하여 운행 기록을 보관하고 기입할 수 있습니다.
        </p>

        {/* Sync Method Selection */}
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label className="form-label">연동 방식 선택</label>
          <select
            name="googleSyncMethod"
            value={formData.googleSyncMethod || 'oauth'}
            onChange={(e) => {
              const val = e.target.value;
              setFormData(prev => ({ ...prev, googleSyncMethod: val }));
              onSettingsChange({ ...formData, googleSyncMethod: val });
            }}
            className="form-select"
          >
            <option value="oauth">OAuth 로그인 연동 (기본형)</option>
            <option value="script">Google Apps Script 연동 (보안/우회형 - APK 강력추천)</option>
          </select>
        </div>

        {formData.googleSyncMethod === 'script' ? (
          // Apps Script Mode UI
          <div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label" style={{ color: '#10b981', fontWeight: 700 }}>Google Apps Script 웹 앱 URL</label>
              <input 
                type="text" 
                name="googleScriptUrl" 
                value={formData.googleScriptUrl || ''} 
                onChange={handleInputChange} 
                className="form-control" 
                placeholder="https://script.google.com/macros/s/... 형태의 URL 입력"
              />
            </div>

            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid var(--border-light)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 700, color: 'var(--primary)', display: 'block', marginBottom: '6px' }}>💡 우회 연동 가이드 (구글 차단 우회):</span>
              <ol style={{ paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>구글 드라이브에 빈 스프레드시트 생성 (또는 기존 스프레드시트 열기)</li>
                <li>상단 메뉴 <strong>확장 프로그램 → Apps Script</strong> 클릭</li>
                <li>아래 코드를 복사해서 붙여넣고 저장:
                  <textarea
                    readOnly
                    value={`function doPost(e) {\n  try {\n    var data = JSON.parse(e.postData.contents);\n    var logs = Array.isArray(data.logs) ? data.logs : [data.log || data];\n    var sheet = SpreadsheetApp.getActiveSpreadsheet();\n    var activeSheet = sheet.getSheetByName("운행기록") || sheet.insertSheet("운행기록");\n    if (activeSheet.getLastRow() === 0) {\n      activeSheet.appendRow(['기록 ID', '년도', '월', '일', '부서', '성명', '구분(목적)', '출발분류', '출발지명', '출발지 주소', '도착분류', '도착지명', '도착지 주소(경유지 포함)', '주행거리(km)', '비고']);\n    }\n    for (var i = 0; i < logs.length; i++) {\n      var log = logs[i];\n      var logDate = new Date(log.date);\n      activeSheet.appendRow([log.id, logDate.getFullYear(), logDate.getMonth() + 1, logDate.getDate(), data.settings.department, data.settings.driverName, log.purpose, log.depClass, log.depName, log.depAddr, log.destClass, log.destName, log.visitedPlaces ? log.destAddr + "(" + log.visitedPlaces + ")" : log.destAddr, log.distance, log.notes || '']);\n    }\n    return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);\n  } catch (err) {\n    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);\n  }\n}`}
                    style={{ width: '100%', height: '80px', fontFamily: 'monospace', fontSize: '0.7rem', marginTop: '6px', background: 'rgba(0,0,0,0.2)', color: 'var(--primary)', border: '1px solid var(--border-light)', padding: '6px' }}
                    onClick={(e) => {
                      e.target.select();
                      navigator.clipboard.writeText(e.target.value);
                      alert('Apps Script 코드가 복사되었습니다! 붙여넣기 하여 사용하세요.');
                    }}
                  />
                  <small style={{ display: 'block', color: 'var(--primary)', fontSize: '0.65rem', marginTop: '2px' }}>클릭 시 전체 복사됩니다.</small>
                </li>
                <li>우측 상단 <strong>배포 → 새 배포</strong> 선택</li>
                <li>유형 선택(톱니바퀴)에서 <strong>웹 앱</strong> 선택</li>
                <li>설정 항목:<br />
                  - 다음 사용자 권한으로 실행: <strong>나(본인 계정)</strong><br />
                  - 액세스할 수 있는 사용자: <strong>모든 사용자(Anyone)</strong>
                </li>
                <li><strong>배포</strong> 클릭 후 표시되는 <strong>웹 앱 URL</strong>을 복사하여 위의 입력란에 붙여넣고 저장하세요.</li>
              </ol>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button 
                type="button"
                onClick={handleSaveSettings}
                className="btn-primary" 
                style={{ flex: 1 }}
              >
                웹 앱 URL 저장
              </button>
              
              <button 
                type="button"
                onClick={handleBatchSync} 
                disabled={loadingSync || !formData.googleScriptUrl}
                className="btn-secondary" 
                style={{ flex: 1, gap: '6px' }}
              >
                <CloudLightning size={16} /> 미기입기록 일괄 전송
              </button>
            </div>
          </div>
        ) : (
          // OAuth Mode UI
          <div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">구글 Client ID</label>
              <input 
                type="text" 
                name="googleClientId" 
                value={formData.googleClientId || ''} 
                onChange={handleInputChange} 
                className="form-control" 
                placeholder="Google Cloud Console에서 생성된 OAuth Client ID"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">연동 스프레드시트 ID</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  name="googleSpreadsheetId" 
                  value={formData.googleSpreadsheetId || ''} 
                  onChange={handleInputChange} 
                  className="form-control" 
                  placeholder="스프레드시트 ID 또는 자동 생성"
                />
                {settings.googleToken && (
                  <button 
                    type="button" 
                    onClick={handleCreateGoogleSheet}
                    className="btn-secondary"
                    style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  >
                    시트 생성
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button 
                type="button"
                onClick={handleGoogleLogin} 
                className="btn-primary" 
                style={{ flex: 1, background: settings.googleToken ? '#10b981' : '#3b82f6', border: 'none' }}
              >
                {settings.googleToken ? '구글 계정 재연동' : 'Google 계정 로그인'}
              </button>
              
              <button 
                type="button"
                onClick={handleBatchSync} 
                disabled={loadingSync || !settings.googleToken || !settings.googleSpreadsheetId}
                className="btn-secondary" 
                style={{ flex: 1, gap: '6px' }}
              >
                <CloudLightning size={16} /> 미기입기록 일괄 전송
              </button>
            </div>

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                ⚠️ PWA 앱에서 구글 로그인 연동이 되지 않는 경우:
              </label>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>
                브라우저에 열린 로그인 완료 페이지의 **전체 주소(URL)**를 복사하여 아래에 붙여넣어 주세요.
              </p>
              <input 
                type="text" 
                placeholder="https://...#access_token=... 붙여넣기" 
                onChange={(e) => {
                  const urlStr = e.target.value;
                  if (urlStr.includes('access_token=')) {
                    try {
                      const hash = new URL(urlStr).hash;
                      const params = new URLSearchParams(hash.substring(1));
                      const token = params.get('access_token');
                      if (token) {
                        const expiresAt = Date.now() + 3600 * 1000;
                        const nextSettings = {
                          ...formData,
                          googleToken: token,
                          googleTokenExpiresAt: expiresAt
                        };
                        setFormData(nextSettings);
                        onSettingsChange(nextSettings);
                        alert('구글 토큰이 수동으로 연동되었습니다!');
                        e.target.value = '';
                      }
                    } catch (err) {
                      alert('올바른 URL 형식이 아닙니다.');
                    }
                  }
                }}
                className="form-control" 
                style={{ fontSize: '0.8rem', padding: '8px 12px' }}
              />
            </div>
          </div>
        )}

        {/* Global Auto Sync Checkbox (shared by both methods) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0', padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>자동 동기화</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: formData.googleAutoSync ? '#10b981' : 'var(--text-secondary)' }}>
              {formData.googleAutoSync ? '활성화' : '비활성화'}
            </span>
            <input 
              type="checkbox"
              checked={!!formData.googleAutoSync}
              onChange={(e) => {
                const nextVal = e.target.checked;
                setFormData(prev => ({ ...prev, googleAutoSync: nextVal }));
                onSettingsChange({ ...formData, googleAutoSync: nextVal });
              }}
              style={{ width: '16px', height: '16px' }}
            />
          </label>
        </div>

        {syncStatusMsg && (
          <p style={{ color: '#10b981', textAlign: 'center', marginTop: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
            {syncStatusMsg}
          </p>
        )}
      </div>



      {/* 2. Download NTS Excel Template */}
      <div className="glass-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--accent)' }}>
          <FileSpreadsheet size={18} /> 운행일지 다운로드
        </h3>
        <p style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
          현재까지 기록된 총 {logs.length}건의 운행 일지를 국세청 양식에 맞춘 Excel 호환 CSV 파일로 내보냅니다.
        </p>
        <button 
          onClick={() => exportToNtsCsv(settings, logs)} 
          className="btn-primary" 
          style={{ width: '100%', background: 'linear-gradient(135deg, var(--accent), #d97706)', boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)' }}
        >
          <Download size={18} /> 운행일지 다운로드 총 {logs.length}건 CSV 내보내기
        </button>
      </div>

      {/* 4. JSON Backup and Restore */}
      <div className="glass-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <User size={18} /> 데이터 백업 및 복원
        </h3>
        <p style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
          로컬 저장소의 기기 정보 및 운행기록 데이터를 안전하게 다른 브라우저나 스마트폰으로 복제할 수 있습니다.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleExportJson} className="btn-secondary" style={{ flex: 1, gap: '6px' }}>
            <Download size={16} /> 백업 파일 받기
          </button>
          
          <label className="btn-secondary" style={{ flex: 1, gap: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Upload size={16} /> 복원 파일 열기
            <input 
              type="file" 
              accept=".json" 
              onChange={handleImportJson} 
              style={{ display: 'none' }} 
            />
          </label>
        </div>
      </div>

      {/* 5. App Security Lock */}
      <div className="glass-card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#ef4444' }}>
          <ShieldAlert size={18} /> 보안 및 앱 잠금
        </h3>
        <p style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
          현재 기기의 접근 권한을 수동으로 해제하여 화면을 다시 잠급니다. 다음 실행 시 마스터 비밀번호를 다시 요구합니다.
        </p>
        <button 
          onClick={() => {
            localStorage.removeItem('car_log_app_unlocked');
            window.location.reload();
          }} 
          className="btn-secondary" 
          style={{ width: '100%', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171' }}
        >
          수동 앱 잠금 (보안 로그아웃)
        </button>
      </div>
    </div>
  );
}
