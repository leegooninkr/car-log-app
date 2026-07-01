import React, { useState, useEffect, useRef } from 'react';
import { PlusCircle, Navigation, MapPin, Check, Calendar, Users, RefreshCw, Upload, Camera } from 'lucide-react';
import { fetchScheduleSheet } from '../utils/googleSheets';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';

export default function Dashboard({ settings, logs, onAddLog, onLogsUpdate, editingLog, setEditingLog, setActiveTab, onUpdateLog }) {
  const getTodayStr = () => new Date().toISOString().slice(0, 10);
  
  // Find latest log to determine default start odometer
  const getLatestEndOdometer = () => {
    if (logs.length === 0) return settings.baseOdometer;
    const sorted = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id));
    return sorted[0].endOdometer || settings.baseOdometer;
  };

  const getTodayStartOdometer = () => {
    const todayLogs = logs.filter(log => log.date === date);
    if (todayLogs.length > 0) {
      const sorted = [...todayLogs].sort((a, b) => a.startOdometer - b.startOdometer);
      return sorted[0].startOdometer;
    }
    return getLatestEndOdometer();
  };

  const getMonthStartOdometer = () => {
    const currentMonthPrefix = date.slice(0, 7); // e.g. "2026-06"
    const monthLogs = logs.filter(log => log.date.startsWith(currentMonthPrefix));
    if (monthLogs.length > 0) {
      const sorted = [...monthLogs].sort((a, b) => a.startOdometer - b.startOdometer);
      return sorted[0].startOdometer;
    }
    return settings.baseOdometer;
  };

  const [date, setDate] = useState(getTodayStr());
  const [purpose, setPurpose] = useState('업무용');
  
  const [depClass, setDepClass] = useState('자택');
  const [depName, setDepName] = useState('자택');
  const [depAddr, setDepAddr] = useState('경기 안산시 상록구 팔곡이동');
  
  const [destClass, setDestClass] = useState('자택');
  const [destName, setDestName] = useState('자택');
  const [destAddr, setDestAddr] = useState('경기 안산시 상록구 팔곡이동');
  
  const [startOdometer, setStartOdometer] = useState(getLatestEndOdometer());
  const [endOdometer, setEndOdometer] = useState('');
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('1'); // Default '1' matching the screenshot
  const [visitedPlaces, setVisitedPlaces] = useState(''); // Visited places waypoint state

  const [showAddress, setShowAddress] = useState(false); // Toggle for detailed address inputs
  const [showSuccess, setShowSuccess] = useState(false);

  // Form dirty flag: prevents useEffect from overwriting user input
  const formDirtyRef = useRef(false);
  const prevEditingLogIdRef = useRef(null);
  const prevDateRef = useRef(date);

  // Camera OCR States
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [ocrPhotoDate, setOcrPhotoDate] = useState(null);
  const cameraInputRef = useRef(null);
  const albumInputRef = useRef(null);

  // Google Schedule Sheet Integration States
  const [googleSpreadsheetId, setGoogleSpreadsheetId] = useState('19tUDOdY3bKZqt09leS-S9Q9Zqm5ZiVIHV61a7GHkf1Y');
  const [scheduleYear, setScheduleYear] = useState(new Date().getFullYear().toString());
  const [scheduleSheetName, setScheduleSheetName] = useState(`${new Date().getFullYear()}년 기술지원팀 일정`);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const [activeScheduleResult, setActiveScheduleResult] = useState(null);

  // Mileage Excel Upload States
  const [mileageExcelData, setMileageExcelData] = useState([]);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [excelError, setExcelError] = useState(null);
  const [showExcelPreview, setShowExcelPreview] = useState(false);

  // Auto update sheet name when year changes
  useEffect(() => {
    setScheduleSheetName(`${scheduleYear}년 기술지원팀 일정`);
  }, [scheduleYear]);

  // Extract Visited Places based on Keywords ("역", "도서관", "지역명")
  const extractPlaces = (cellText) => {
    if (!cellText) return '';
    const lines = cellText.split('\n');
    const places = [];
    
    // Active support keywords (점검, 교체, 도서, 지원, 함)
    const activeWorkRegex = /(점검|교체|도서|지원|수리|작업|방문|함)/;
    // Internal duty / passive words to ignore (당직, 재택, 휴가)
    const ignoreWorkRegex = /(당직|재택|휴가|연차)/;
    
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      // Filter: only parse rows that indicate support work, skip passive/internal duty rows
      if (!activeWorkRegex.test(line) || ignoreWorkRegex.test(line)) {
        continue;
      }
      
      // 1. Remove leading numbers, dots, dashes, stars (e.g. "1.양재도서관" -> "양재도서관", "* 철산역" -> "철산역")
      const cleanedLine = line.replace(/^[^가-힣A-Za-z0-9]+/g, '')
                              .replace(/^\d+[\s.]*/, '')
                              .trim();
      if (!cleanedLine) continue;
      
      const words = cleanedLine.split(/\s+/);
      for (const word of words) {
        // 2. Exact match for place names with suffix keywords
        const match = word.match(/^([가-힣A-Za-z0-9]+(역|도서관|스마트도서관|공원|구청|시청|교육청|센터|빌딩|APT|아파트|초등학교|중학교|고등학교|대학교|대교))/i);
        if (match) {
          const placeName = match[1];
          
          // 3. Filter out action/work keywords
          if (!/(점검|설치|유지보수|교체|지원|수리|완료|반납|대출|회신|전달|이동)/.test(placeName)) {
            if (placeName.length >= 2 && !places.includes(placeName)) {
              places.push(placeName);
            }
          }
        }
      }
    }
    return places.join(',');
  };

  // Convert Sheet Date "6월 26일" or "6/26" to "YYYY-MM-DD"
  const parseSheetDate = (year, dateStr) => {
    if (!dateStr) return '';
    const match = dateStr.match(/(\d+)\s*월\s*(\d+)\s*일/) || dateStr.match(/(\d+)\s*[\/\-]\s*(\d+)/);
    if (match) {
      const month = String(match[1]).padStart(2, '0');
      const day = String(match[2]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return '';
  };

  // Load and Parse Google Sheet data (filtered by settings.driverName and selected date)
  const handleLoadSchedule = async () => {
    if (!settings.driverName || !settings.driverName.trim()) {
      alert('구글 일정표를 연동하려면 우측 하단 [환경 설정] 탭에서 운전자 성명을 먼저 저장해 주세요.');
      return;
    }

    setLoadingSchedule(true);
    setScheduleError(null);
    setActiveScheduleResult(null);
    
    try {
      const rows = await fetchScheduleSheet(googleSpreadsheetId, scheduleSheetName);
      
      if (rows.length === 0) {
        throw new Error('시트 데이터가 비어있거나 올바른 시트명이 아닙니다.');
      }
      
      // Find driver's column index from the header row (row 1)
      const headerRow = rows[0];
      const driverNameClean = settings.driverName.trim();
      const colIdx = headerRow.findIndex(cell => cell && String(cell).includes(driverNameClean));
      
      if (colIdx === -1) {
        throw new Error(`스프레드시트 1행에서 '${driverNameClean}' 님이 포함된 담당자 열을 찾을 수 없습니다.`);
      }
      
      // Find row index matching the active form date
      let foundRow = null;
      for (let r = 1; r < rows.length; r++) {
        const rowDateStr = rows[r][0];
        if (!rowDateStr) continue;
        const parsedDate = parseSheetDate(scheduleYear, rowDateStr);
        if (parsedDate === date) {
          foundRow = rows[r];
          break;
        }
      }
      
      if (!foundRow) {
        throw new Error(`스프레드시트에서 현재 선택한 날짜(${date})의 일정을 찾을 수 없습니다.`);
      }
      
      // Extract cell value for the driver
      const cellValue = foundRow[colIdx] ? String(foundRow[colIdx]).trim() : '';
      
      if (!cellValue) {
        setActiveScheduleResult({
          driverName: driverNameClean,
          date,
          rawText: '(일정 없음)',
          visitedPlaces: ''
        });
        return;
      }
      
      // Extract places using keywords parser
      const extractedPlaces = extractPlaces(cellValue);
      
      setActiveScheduleResult({
        driverName: driverNameClean,
        date,
        rawText: cellValue,
        visitedPlaces: extractedPlaces
      });
      
    } catch (err) {
      console.error(err);
      setScheduleError(err.message);
    } finally {
      setLoadingSchedule(false);
    }
  };

  // Quick Register Log from Google Sheet Row
  const handleRegisterScheduleLog = (sch) => {
    const distStr = scheduleDistances[sch.date];
    const distVal = parseFloat(distStr);
    
    if (isNaN(distVal) || distVal <= 0) {
      alert('주행거리를 입력해 주세요.');
      return;
    }
    
    const startOdo = getLatestEndOdometer();
    const endOdo = Math.round(startOdo + distVal);
    
    const newLog = {
      id: 'log-' + Date.now(),
      date: sch.date,
      purpose: '업무용',
      depClass: '자택',
      depName: '자택',
      depAddr: '경기 안산시 상록구 팔곡이동',
      destClass: '자택',
      destName: '자택',
      destAddr: '경기 안산시 상록구 팔곡이동',
      visitedPlaces: sch.visitedPlaces,
      startOdometer: startOdo,
      endOdometer: endOdo,
      distance: distVal,
      notes: '1'
    };
    
    onAddLog(newLog);
    setRegisteredScheduleIds(prev => [...prev, sch.date]);
    alert(`${sch.date} (${sch.visitedPlaces || '경유지 없음'}) 운행 기록이 성공적으로 등록되었습니다.`);
  };

  // Recalculate all logs' start/end odometers sequentially based on baseOdometer
  const recalculateAllOdomoters = (logsList, baseOdo) => {
    const sorted = [...logsList].sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id));
    
    let currentOdo = baseOdo;
    const updated = sorted.map(log => {
      const start = currentOdo;
      const end = Math.round(start + (log.distance || 0));
      currentOdo = end;
      return {
        ...log,
        startOdometer: start,
        endOdometer: end
      };
    });
    
    return updated.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id));
  };

  // Parse Excel file and extract mileage sum by date
  const parseMileageExcel = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
          
          let dateColIdx = -1;
          let distanceColIdx = -1;
          
          for (let r = 0; r < Math.min(15, rows.length); r++) {
            const row = rows[r];
            if (!row) continue;
            for (let c = 0; c < row.length; c++) {
              const val = String(row[c]).trim();
              if (val.includes('주행일자')) dateColIdx = c;
              if (val.includes('주행거리')) distanceColIdx = c;
            }
            
            if (dateColIdx !== -1 && distanceColIdx !== -1) {
              const dataRows = rows.slice(r + 1);
              const mileageMap = {};
              
              for (const dRow of dataRows) {
                const dateStr = dRow[dateColIdx];
                const distStr = dRow[distanceColIdx];
                
                if (!dateStr || !distStr) continue;
                
                const dateMatch = String(dateStr).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
                if (!dateMatch) continue;
                
                const formattedDate = `${dateMatch[3]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`;
                const cleanedDist = String(distStr).replace(/[^\d.]/g, '');
                const distanceVal = parseFloat(cleanedDist);
                
                if (isNaN(distanceVal) || distanceVal <= 0) continue;
                
                mileageMap[formattedDate] = (mileageMap[formattedDate] || 0) + distanceVal;
              }
              
              const parsedList = Object.entries(mileageMap).map(([date, distance]) => ({
                date,
                distance: Math.round(distance * 10) / 10
              })).sort((a, b) => b.date.localeCompare(a.date));
              
              resolve(parsedList);
              return;
            }
          }
          reject(new Error('엑셀 시트에서 "주행일자" 및 "주행거리" 열을 찾을 수 없습니다.'));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  // Merge parsed mileage excel data with Google sheet schedules into existing logs
  const handleMergeExcelMileage = async () => {
    if (mileageExcelData.length === 0) return;
    
    // Fetch google sheet schedules in background
    let scheduleMap = {};
    let scheduleLoaded = false;
    
    if (settings.driverName && settings.driverName.trim()) {
      try {
        const rows = await fetchScheduleSheet(googleSpreadsheetId, scheduleSheetName);
        if (rows && rows.length > 0) {
          const headerRow = rows[0];
          const driverNameClean = settings.driverName.trim();
          const colIdx = headerRow.findIndex(cell => cell && String(cell).includes(driverNameClean));
          
          if (colIdx !== -1) {
            // Loop through data rows (start from row 2 as 0 is header, 1 is department names etc)
            for (let r = 2; r < rows.length; r++) {
              const rowDateStr = rows[r][0];
              if (!rowDateStr) continue;
              const parsedDate = parseSheetDate(scheduleYear, rowDateStr);
              const cellVal = rows[r][colIdx] ? String(rows[r][colIdx]).trim() : '';
              if (parsedDate && cellVal) {
                scheduleMap[parsedDate] = extractPlaces(cellVal);
              }
            }
            scheduleLoaded = true;
          }
        }
      } catch (err) {
        console.warn('구글 일정표를 가져오지 못해 엑셀 단독으로 병합합니다:', err.message);
      }
    }

    let updatedLogs = [...logs];
    let newLogsCount = 0;
    let updatedLogsCount = 0;
    
    const sortedExcelData = [...mileageExcelData].sort((a, b) => a.date.localeCompare(b.date));
    
    for (const item of sortedExcelData) {
      const sameDateLogs = updatedLogs.filter(log => log.date === item.date);
      const sheetPlaces = scheduleMap[item.date] || '';
      
      if (sameDateLogs.length > 0) {
        const sortedSameDate = [...sameDateLogs].sort((a, b) => a.id.localeCompare(b.id));
        
        sortedSameDate.forEach((log, idx) => {
          const isLast = idx === sortedSameDate.length - 1;
          updatedLogs = updatedLogs.map(l => {
            if (l.id === log.id) {
              return {
                ...l,
                distance: isLast ? item.distance : 0,
                visitedPlaces: l.visitedPlaces || (isLast ? sheetPlaces : '')
              };
            }
            return l;
          });
        });
        updatedLogsCount++;
      } else {
        const newLog = {
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          date: item.date,
          purpose: '업무용',
          depClass: '자택',
          depName: '자택',
          depAddr: settings.defaultDepAddr || '경기 안산시 상록구 팔곡이동',
          destClass: '자택',
          destName: '자택',
          destAddr: settings.defaultDestAddr || '경기 안산시 상록구 팔곡이동',
          visitedPlaces: sheetPlaces,
          startOdometer: settings.baseOdometer,
          endOdometer: settings.baseOdometer + item.distance,
          distance: item.distance,
          notes: '1'
        };
        updatedLogs.push(newLog);
        newLogsCount++;
      }
    }
    
    const finalLogs = recalculateAllOdomoters(updatedLogs, settings.baseOdometer);
    
    onLogsUpdate(finalLogs);
    setMileageExcelData([]);
    setShowExcelPreview(false);
    
    let msg = `주행거리 및 구글 일정 병합 완료!\n(기존 ${updatedLogsCount}개 일자 업데이트, ${newLogsCount}개 일자 신규 생성)`;
    if (scheduleLoaded) {
      msg += `\n*구글 일정표에서 추출한 방문 경로가 날짜별로 함께 반영되었습니다.`;
    } else {
      msg += `\n*구글 일정표 조회가 생략되거나 실패하여 주행거리만 입력되었습니다.`;
    }
    alert(msg);
  };

  // Update starting odometer whenever logs or settings change (only when form is clean)
  useEffect(() => {
    if (!formDirtyRef.current && !editingLog) {
      setStartOdometer(getLatestEndOdometer());
    }
  }, [logs, settings]);

  // Auto fill form fields if a log already exists for the selected date
  useEffect(() => {
    // When editingLog changes to a NEW log (different id), always fill form
    const newEditId = editingLog ? editingLog.id : null;
    const isNewEdit = newEditId && newEditId !== prevEditingLogIdRef.current;
    prevEditingLogIdRef.current = newEditId;

    if (isNewEdit) {
      formDirtyRef.current = false;
      setDate(editingLog.date);
      setDistance(editingLog.distance !== undefined ? editingLog.distance : '');
      setVisitedPlaces(editingLog.visitedPlaces || '');
      setPurpose(editingLog.purpose || '업무용');
      setNotes(editingLog.notes || '1');
      setDepClass(editingLog.depClass || '자택');
      setDepName(editingLog.depName || '자택');
      setDepAddr(editingLog.depAddr || '');
      setDestClass(editingLog.destClass || '자택');
      setDestName(editingLog.destName || '자택');
      setDestAddr(editingLog.destAddr || '');
      setStartOdometer(editingLog.startOdometer !== undefined ? editingLog.startOdometer : '');
      setEndOdometer(editingLog.endOdometer !== undefined ? editingLog.endOdometer : '');
      return;
    }

    // If editingLog exists but hasn't changed id, or form is dirty, skip overwrite
    if (editingLog || formDirtyRef.current) {
      return;
    }

    // Check if date actually changed (not just logs/settings update)
    const dateChanged = date !== prevDateRef.current;
    prevDateRef.current = date;

    // If only logs/settings changed (not date), skip form overwrite to protect user input
    if (!dateChanged) {
      return;
    }

    const existingLog = logs.find(l => l.date === date);
    if (existingLog) {
      setDistance(existingLog.distance !== undefined ? existingLog.distance : '');
      setVisitedPlaces(existingLog.visitedPlaces || '');
      setPurpose(existingLog.purpose || '업무용');
      setNotes(existingLog.notes || '1');
      if (existingLog.depClass) setDepClass(existingLog.depClass);
      if (existingLog.depName) setDepName(existingLog.depName);
      if (existingLog.depAddr) setDepAddr(existingLog.depAddr);
      if (existingLog.destClass) setDestClass(existingLog.destClass);
      if (existingLog.destName) setDestName(existingLog.destName);
      if (existingLog.destAddr) setDestAddr(existingLog.destAddr);
      setStartOdometer(existingLog.startOdometer !== undefined ? existingLog.startOdometer : '');
      setEndOdometer(existingLog.endOdometer !== undefined ? existingLog.endOdometer : '');
    } else {
      setDistance('');
      setVisitedPlaces('');
      setPurpose('업무용');
      setNotes('1');
      setStartOdometer(getLatestEndOdometer());
      setEndOdometer('');
      
      // Auto-inherit: set departure to previous day's destination
      const pastLogs = logs.filter(l => l.date < date);
      const sortedPastLogs = [...pastLogs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      const lastLog = sortedPastLogs[0];
      
      if (lastLog) {
        setDepClass(lastLog.destClass || '자택');
        setDepName(lastLog.destName || '자택');
        setDepAddr(lastLog.destAddr || settings.defaultDepAddr || '경기 안산시 상록구 팔곡이동');
      } else {
        setDepClass('자택');
        setDepName('자택');
        setDepAddr(settings.defaultDepAddr || '경기 안산시 상록구 팔곡이동');
      }
      
      // Destination defaults to settings configuration
      setDestClass('자택');
      setDestName('자택');
      setDestAddr(settings.defaultDestAddr || '경기 안산시 상록구 팔곡이동');
    }
  }, [date, logs, settings, editingLog]);

  // Auto-load schedule when date changes and no existing log for that date
  useEffect(() => {
    if (editingLog) return;
    const existingLog = logs.find(l => l.date === date);
    if (existingLog) return; // Already has a record, skip auto-load
    if (!settings.driverName || !settings.driverName.trim()) return;
    
    let cancelled = false;
    const autoLoadSchedule = async () => {
      try {
        const rows = await fetchScheduleSheet(googleSpreadsheetId, scheduleSheetName);
        if (cancelled || !rows || rows.length === 0) return;
        
        const headerRow = rows[0];
        const driverNameClean = settings.driverName.trim();
        const colIdx = headerRow.findIndex(cell => cell && String(cell).includes(driverNameClean));
        if (colIdx === -1) return;
        
        let foundRow = null;
        for (let r = 1; r < rows.length; r++) {
          const rowDateStr = rows[r][0];
          if (!rowDateStr) continue;
          const parsedDate = parseSheetDate(scheduleYear, rowDateStr);
          if (parsedDate === date) {
            foundRow = rows[r];
            break;
          }
        }
        if (!foundRow) return;
        
        const cellValue = foundRow[colIdx] ? String(foundRow[colIdx]).trim() : '';
        if (!cellValue) return;
        
        const extractedPlaces = extractPlaces(cellValue);
        if (cancelled) return;
        
        if (extractedPlaces && !formDirtyRef.current) {
          setVisitedPlaces(extractedPlaces);
          setActiveScheduleResult({
            driverName: driverNameClean,
            date,
            rawText: cellValue,
            visitedPlaces: extractedPlaces
          });
        }
      } catch (err) {
        // Silently fail for auto-load
        console.warn('일정 자동 로드 실패:', err.message);
      }
    };
    
    autoLoadSchedule();
    return () => { cancelled = true; };
  }, [date]);

  // Recalculate distance when start or end odometer changes
  const handleOdometerChange = (type, value) => {
    formDirtyRef.current = true;
    const val = value === '' ? '' : parseInt(value) || 0;
    if (type === 'start') {
      setStartOdometer(val);
      if (endOdometer !== '' && val !== '') {
        setDistance(Math.max(0, endOdometer - val));
      }
    } else if (type === 'end') {
      setEndOdometer(val);
      if (startOdometer !== '' && val !== '') {
        setDistance(Math.max(0, val - startOdometer));
      }
    }
  };

  // Recalculate end odometer when distance changes
  const handleDistanceChange = (value) => {
    formDirtyRef.current = true;
    const val = value === '' ? '' : parseFloat(value) || 0;
    setDistance(val);
    if (startOdometer !== '' && val !== '') {
      setEndOdometer(Math.round(startOdometer + val));
    }
  };

  // Extract EXIF date from image file
  const extractExifDate = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);
          // Check JPEG SOI marker
          if (view.getUint16(0) !== 0xFFD8) { resolve(null); return; }
          let offset = 2;
          while (offset < view.byteLength - 2) {
            const marker = view.getUint16(offset);
            if (marker === 0xFFE1) { // APP1 (EXIF)
              const length = view.getUint16(offset + 2);
              const exifData = new Uint8Array(e.target.result, offset + 4, length - 2);
              const text = new TextDecoder('ascii').decode(exifData);
              // Find DateTimeOriginal or DateTime tag in ASCII
              const dateMatch = text.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
              if (dateMatch) {
                resolve(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
                return;
              }
              resolve(null);
              return;
            }
            const segLength = view.getUint16(offset + 2);
            offset += 2 + segLength;
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    });
  };

  // Canvas-based Image Preprocessing for OCR (Grayscale + High Contrast)
  const preprocessImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Downscale to target max width 800 for optimal processing speed
          const maxDim = 800;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;
          
          // Greyscale conversion & Contrast amplification
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            // Greyscale luminance formula
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;
            
            // Increase contrast heavily to make digital odometer numbers stand out
            const factor = 1.6;
            gray = (gray - 128) * factor + 128;
            gray = Math.max(0, Math.min(255, gray));
            
            data[i] = gray;
            data[i+1] = gray;
            data[i+2] = gray;
          }
          ctx.putImageData(imgData, 0, 0);
          
          canvas.toBlob((blob) => {
            resolve(blob || file);
          }, 'image/jpeg', 0.9);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // Shared OCR processing logic
  const processOcrFile = async (file) => {
    setOcrProcessing(true);
    setOcrError(null);
    setOcrPhotoDate(null);
    
    try {
      // 1. Try extracting EXIF date from JPEG APP1 header
      let photoDate = await extractExifDate(file);
      
      // 2. Fallback to file's last modified timestamp (almost always available via input/gallery pick)
      if (!photoDate && file.lastModified) {
        try {
          const fileDate = new Date(file.lastModified);
          if (!isNaN(fileDate.getTime())) {
            photoDate = fileDate.toISOString().slice(0, 10);
          }
        } catch (err) {
          console.warn('lastModified parsing failed:', err);
        }
      }
      
      if (photoDate) {
        setOcrPhotoDate(photoDate);
      }

      // Preprocess image to enhance OCR accuracy
      const preprocessedBlob = await preprocessImage(file);

      // Perform OCR with digit-only whitelist parameters
      const result = await Tesseract.recognize(preprocessedBlob, 'eng', {
        logger: () => {}, // suppress logs
        parameters: {
          tessedit_char_whitelist: '0123456789'
        }
      });
      
      const text = result.data.text;
      const cleanedText = text.replace(/\s+/g, ' ');
      const numbers = cleanedText.match(/\d{4,6}/g); // Extract odometer values (4 to 6 digit ranges)
      
      if (!numbers || numbers.length === 0) {
        setOcrError('숫자를 인식하지 못했습니다. 더 선명한 사진으로 다시 시도해 주세요.');
        return;
      }
      
      const parsed = numbers.map(n => parseInt(n)).filter(n => n > 100);
      
      if (parsed.length === 0) {
        setOcrError('유효한 계기판 숫자를 찾을 수 없습니다.');
        return;
      }
      
      // Select the maximum matching number as odometer reading
      const odometerValue = Math.max(...parsed);
      let confirmMsg = `인식된 계기판 숫자: ${odometerValue.toLocaleString()} km`;
      if (photoDate) {
        confirmMsg += `\n사진 생성일(갤러리/EXIF): ${photoDate}`;
      }
      confirmMsg += `\n\n이 값을 도착 계기판에 입력하시겠습니까?`;
      
      const confirmed = window.confirm(confirmMsg);
      
      if (confirmed) {
        formDirtyRef.current = true;
        setEndOdometer(odometerValue);
        if (startOdometer !== '' && odometerValue > startOdometer) {
          setDistance(Math.max(0, odometerValue - startOdometer));
        }
      }
    } catch (err) {
      console.error('OCR Error:', err);
      setOcrError('사진 인식 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setOcrProcessing(false);
    }
  };

  // Camera OCR handler
  const handleOcrCapture = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    await processOcrFile(file);
  };

  // Album OCR handler (no capture attribute)
  const handleAlbumCapture = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    await processOcrFile(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (startOdometer === '' || endOdometer === '' || distance === '') {
      alert('출발 계기판, 도착 계기판, 주행거리를 입력해 주세요.');
      return;
    }

    if (Number(endOdometer) < Number(startOdometer)) {
      alert('도착 계기판 값은 출발 계기판 값보다 커야 합니다.');
      return;
    }

    const logData = {
      date,
      purpose,
      depClass,
      depName,
      depAddr,
      destClass,
      destName,
      destAddr,
      visitedPlaces,
      startOdometer: Number(startOdometer),
      endOdometer: Number(endOdometer),
      distance: Number(distance),
      notes
    };

    if (editingLog) {
      const updatedLog = {
        ...editingLog,
        ...logData
      };
      
      // Cascading odometer recalculation: update all subsequent records
      const otherLogs = logs.filter(l => l.id !== editingLog.id);
      let allLogs = [...otherLogs, updatedLog];
      
      // Cascade destination → next day's departure
      // Find the next chronological log after this date and update its departure
      const nextDayLogs = allLogs
        .filter(l => l.date > updatedLog.date && l.id !== updatedLog.id)
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      
      if (nextDayLogs.length > 0) {
        const nextLog = nextDayLogs[0];
        allLogs = allLogs.map(l => {
          if (l.id === nextLog.id) {
            return {
              ...l,
              depClass: updatedLog.destClass,
              depName: updatedLog.destName,
              depAddr: updatedLog.destAddr
            };
          }
          return l;
        });
      }
      
      const recalculated = recalculateAllOdomoters(allLogs, settings.baseOdometer);
      onLogsUpdate(recalculated);
      
      setEditingLog(null);
      setActiveTab('logs');
      alert('운행 기록이 수정되었습니다. 후속 기록의 계기판 및 다음날 출발지도 자동 동기화되었습니다.');
    } else {
      const newLog = {
        id: 'log-' + Date.now(),
        ...logData
      };
      onAddLog(newLog);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }

    // Reset fields and formDirty
    formDirtyRef.current = false;
    setEndOdometer('');
    setDistance('');
    setVisitedPlaces('');
  };

  const todayStartOdo = getTodayStartOdometer();
  const monthStartOdo = getMonthStartOdometer();
  const latestEndOdo = getLatestEndOdometer();

  return (
    <div className="fade-in dashboard-container" style={{ paddingBottom: '30px' }}>
      <h2>{editingLog ? '운행 기록 수정' : '운행 기록 입력'}</h2>

      <div className="dashboard-grid">
        {/* Left Column: Logging Form */}
        <div className="dashboard-col-left">
          <form onSubmit={handleSubmit} className="glass-card">
        {/* Date and Purpose */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">날짜</label>
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              className="form-control" 
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">구분 (목적)</label>
            <select 
              value={purpose} 
              onChange={(e) => setPurpose(e.target.value)} 
              className="form-select"
            >
              <option value="업무용">3.업무용</option>
              <option value="출퇴근">2.출퇴근</option>
              <option value="일반용">1.일반용(개인)</option>
            </select>
          </div>
        </div>

        {/* Departure and Destination Info */}
        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '16px', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>경로 정보</span>
          </div>

          {/* Departure Input Row */}
          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}><MapPin size={10} style={{ color: '#ef4444' }} /> 출발지</label>
            <div className="form-row" style={{ gap: '8px' }}>
              <div style={{ width: '95px' }}>
                <select 
                  value={depClass} 
                  onChange={(e) => {
                    setDepClass(e.target.value);
                    setDepName(e.target.value); // Sync Name and Class
                  }} 
                  className="form-select"
                  style={{ padding: '8px 10px', fontSize: '0.85rem' }}
                >
                  <option value="자택">자택</option>
                  <option value="근무지">근무지</option>
                  <option value="거래처">거래처</option>
                  <option value="숙소">숙소</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <input 
                  type="text" 
                  placeholder="출발 주소 또는 명칭 (예: 경기 안산시, 럭셔리모텔)" 
                  value={depAddr} 
                  onChange={(e) => setDepAddr(e.target.value)} 
                  className="form-control" 
                  style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                  required
                />
              </div>
            </div>
          </div>

          {/* Destination Input Row */}
          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}><Navigation size={10} style={{ color: '#10b981' }} /> 도착지</label>
            <div className="form-row" style={{ gap: '8px' }}>
              <div style={{ width: '95px' }}>
                <select 
                  value={destClass} 
                  onChange={(e) => {
                    setDestClass(e.target.value);
                    setDestName(e.target.value); // Sync Name and Class
                  }} 
                  className="form-select"
                  style={{ padding: '8px 10px', fontSize: '0.85rem' }}
                >
                  <option value="자택">자택</option>
                  <option value="근무지">근무지</option>
                  <option value="거래처">거래처</option>
                  <option value="숙소">숙소</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <input 
                  type="text" 
                  placeholder="도착 주소 또는 명칭 (예: 경기 안산시, 럭셔리모텔)" 
                  value={destAddr} 
                  onChange={(e) => setDestAddr(e.target.value)} 
                  className="form-control" 
                  style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                  required
                />
              </div>
            </div>
          </div>

          {/* Visited Places Input */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>방문한 곳 (경유지)</label>
            <textarea 
              placeholder="예: 용산역, 잠원도서관 (쉼표로 구분)" 
              value={visitedPlaces} 
              onChange={(e) => setVisitedPlaces(e.target.value)} 
              className="form-control"
              style={{ 
                padding: '8px 12px', 
                fontSize: '0.85rem', 
                minHeight: '54px', 
                resize: 'vertical',
                lineHeight: '1.4',
                fontFamily: 'inherit'
              }}
            />
          </div>
        </div>

        {/* Mileage Calculator */}
        <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '16px', background: 'rgba(255,255,255,0.01)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--secondary)', display: 'block', marginBottom: '10px' }}>주행거리 계산 (km)</span>
          
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>출발 계기판</label>
            <input 
              type="number" 
              value={startOdometer} 
              onChange={(e) => handleOdometerChange('start', e.target.value)} 
              className="form-control" 
              style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
              placeholder="km"
              required
            />
          </div>
          
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>도착 계기판</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input 
                type="number" 
                value={endOdometer} 
                onChange={(e) => handleOdometerChange('end', e.target.value)} 
                className="form-control" 
                style={{ padding: '8px 12px', fontSize: '0.85rem', flex: 1 }}
                placeholder="km"
                required
              />
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={ocrProcessing}
                className="btn-secondary"
                style={{ 
                  padding: '8px 10px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '4px',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                  opacity: ocrProcessing ? 0.5 : 1
                }}
                title="계기판 사진 촬영으로 자동 입력"
              >
                <Camera size={14} /> 촬영
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleOcrCapture}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => albumInputRef.current?.click()}
                disabled={ocrProcessing}
                className="btn-secondary"
                style={{ 
                  padding: '8px 10px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '4px',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                  opacity: ocrProcessing ? 0.5 : 1
                }}
                title="앨범에서 계기판 사진 선택"
              >
                🖼️ 앨범
              </button>
              <input
                ref={albumInputRef}
                type="file"
                accept="image/*"
                onChange={handleAlbumCapture}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* OCR Status */}
          {ocrProcessing && (
            <p style={{ fontSize: '0.8rem', color: 'var(--primary)', textAlign: 'center', margin: '8px 0' }}>
              📷 계기판 숫자 인식 중...
            </p>
          )}
          {ocrError && (
            <p style={{ fontSize: '0.78rem', color: '#ef4444', margin: '4px 0 8px 0', padding: '6px 8px', background: 'rgba(239,68,68,0.05)', borderRadius: '4px' }}>
              ❌ {ocrError}
            </p>
          )}
          {ocrPhotoDate && !ocrProcessing && !ocrError && (
            <p style={{ fontSize: '0.78rem', color: '#10b981', margin: '4px 0 8px 0', padding: '6px 8px', background: 'rgba(16,185,129,0.05)', borderRadius: '4px' }}>
              📅 사진 촬영일: {ocrPhotoDate}
            </p>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>주행 거리</label>
            <input 
              type="number" 
              value={distance} 
              onChange={(e) => handleDistanceChange(e.target.value)} 
              className="form-control" 
              style={{ padding: '10px 14px', fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}
              placeholder="직접 입력시 도착 계기판 자동 가산"
              step="any"
              required
            />
          </div>
        </div>

        {/* Remarks / Notes */}
        <div className="form-group">
          <label className="form-label">비고</label>
          <input 
            type="text" 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)} 
            className="form-control" 
            placeholder="특이사항 입력 (일반적으로 '1' 또는 빈칸)"
          />
        </div>

        {/* Submit */}
        {editingLog ? (
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button 
              type="button" 
              onClick={() => {
                formDirtyRef.current = false;
                setEditingLog(null);
                setActiveTab('logs');
              }} 
              className="btn-secondary" 
              style={{ flex: 1 }}
            >
              수정 취소
            </button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>
              수정 완료
            </button>
          </div>
        ) : (
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
            <PlusCircle size={18} /> 운행기록 등록
          </button>
        )}

        {showSuccess && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '6px', 
            color: '#10b981', 
            textAlign: 'center', 
            marginTop: '12px', 
            fontSize: '0.9rem', 
            fontWeight: 600 
          }}>
            <Check size={16} /> 운행 기록이 로컬 저장소에 등록되었습니다!
          </div>
        )}
      </form>
        </div>

        {/* Right Column: Google Sheets & Excel Aggregators */}
        <div className="dashboard-col-right">
          {/* 3. Google Sheets Schedule Parser Card */}
          <div className="glass-card" style={{ marginTop: '0' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#10b981' }}>
          <Calendar size={18} /> 구글 일정표 연동 방문 경로 추출
        </h3>
        <p style={{ fontSize: '0.85rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>
          구글 스프레드시트 일정표에서 특정 담당자의 기술지원 일정을 읽어와 방문 경로를 자동으로 추출하고 운행기록에 등록합니다.
        </p>

          <div>
            {/* Sheet Settings Form */}
            <div className="form-row" style={{ gap: '8px', marginBottom: '10px' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>스프레드시트 ID</label>
                <input 
                  type="text" 
                  value={googleSpreadsheetId} 
                  onChange={(e) => setGoogleSpreadsheetId(e.target.value)} 
                  className="form-control" 
                  style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                  placeholder="구글 시트 ID"
                />
              </div>
              <div style={{ width: '80px' }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>연도</label>
                <input 
                  type="number" 
                  value={scheduleYear} 
                  onChange={(e) => setScheduleYear(e.target.value)} 
                  className="form-control" 
                  style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>시트 이름</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  value={scheduleSheetName} 
                  onChange={(e) => setScheduleSheetName(e.target.value)} 
                  className="form-control" 
                  style={{ padding: '6px 10px', fontSize: '0.8rem', flex: 1 }}
                  placeholder="예: 2026년 기술지원팀 일정"
                />
                <button
                  type="button"
                  onClick={handleLoadSchedule}
                  disabled={loadingSchedule}
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RefreshCw size={12} className={loadingSchedule ? 'spin' : ''} /> 일정표 로드
                </button>
              </div>
            </div>

            {scheduleError && (
              <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '0 0 10px 0', padding: '8px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                ❌ {scheduleError}
              </p>
            )}

            {/* Target driver indicator */}
            <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid var(--border-light)', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>대상 이름: </span>
              <strong style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>{settings.driverName || '성명 미지정 (환경 설정 필요)'}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>조회 날짜: </span>
              <strong style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>{date}</strong>
            </div>

            {/* Parsed Single Schedule Result */}
            {activeScheduleResult && (
              <div 
                style={{ 
                  padding: '12px', 
                  borderRadius: '6px', 
                  border: '1px solid var(--border-light)', 
                  background: 'rgba(255,255,255,0.01)',
                  marginTop: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>일정 상세 내역</strong>
                </div>

                {/* Raw Schedule Text */}
                <p style={{ fontSize: '0.78rem', margin: '0 0 8px 0', color: 'var(--text-secondary)', whiteSpace: 'pre-line', paddingLeft: '8px', borderLeft: '2px solid var(--border-light)' }}>
                  {activeScheduleResult.rawText}
                </p>

                {/* Extracted visited places */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>추출 경로:</span>
                  {activeScheduleResult.visitedPlaces ? (
                    activeScheduleResult.visitedPlaces.split(',').map((p, i) => (
                      <span key={i} style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {p}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontStyle: 'italic' }}>경로 없음 (키워드 미일치 또는 일정 없음)</span>
                  )}
                </div>

                {activeScheduleResult.visitedPlaces && (
                  <button
                    type="button"
                    onClick={() => {
                      setVisitedPlaces(activeScheduleResult.visitedPlaces);
                      alert(`경유지에 '${activeScheduleResult.visitedPlaces}'(이)가 입력되었습니다.`);
                    }}
                    className="btn-primary"
                    style={{ width: '100%', padding: '8px', fontSize: '0.8rem', background: '#10b981', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <MapPin size={14} /> 이 경로를 메인 폼의 경유지에 자동 입력
                  </button>
                )}
              </div>
            )}
          </div>
      </div>

      {/* 4. Excel Mileage Auto Aggregator Card */}
      <div className="glass-card" style={{ marginTop: '20px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--accent)' }}>
          <Upload size={18} /> 주행기록 엑셀 업로드 (누적 합산)
        </h3>
        <p style={{ fontSize: '0.85rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>
          다운로드받은 주행일지 엑셀 파일(.xlsx)을 업로드하여 날짜별 누적 주행거리를 자동으로 합산하고 기존 운행기록에 일괄 반영합니다.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <label className="btn-secondary" style={{ flex: 1, gap: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '10px 14px' }}>
            <Upload size={16} /> 주행일지 엑셀 파일 선택
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                setLoadingExcel(true);
                setExcelError(null);
                setMileageExcelData([]);
                try {
                  const parsed = await parseMileageExcel(file);
                  setMileageExcelData(parsed);
                  setShowExcelPreview(true);
                  if (parsed.length === 0) {
                    alert('파싱된 주행 데이터가 없습니다.');
                  }
                } catch (err) {
                  console.error(err);
                  setExcelError(err.message || '엑셀 파싱 중 오류가 발생했습니다.');
                } finally {
                  setLoadingExcel(false);
                  e.target.value = ''; // Reset file input
                }
              }} 
              style={{ display: 'none' }} 
            />
          </label>
        </div>

        {loadingExcel && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            🔄 엑셀 파일 파싱 중...
          </p>
        )}

        {excelError && (
          <p style={{ fontSize: '0.8rem', color: '#ef4444', padding: '8px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
            ❌ {excelError}
          </p>
        )}

        {showExcelPreview && mileageExcelData.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              📊 엑셀 주행거리 분석 결과 ({mileageExcelData.length}일)
            </span>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px', marginBottom: '12px' }}>
              {mileageExcelData.map((item) => (
                <div 
                  key={item.date}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '8px 10px', 
                    borderRadius: '4px', 
                    background: 'rgba(255,255,255,0.01)', 
                    border: '1px solid var(--border-light)' 
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{item.date}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>
                    {item.distance.toFixed(1)} km (합산)
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleMergeExcelMileage}
              className="btn-primary"
              style={{ width: '100%', padding: '10px', background: 'var(--accent)', border: 'none' }}
            >
              주행거리 및 구글 일정 일괄 반영 및 재계산
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
</div>
  );
}
